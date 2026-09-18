"""Stage 2a — deterministic topic scoring and shortlist (no LLM).

score = demand x uncovered x seasonality   (ADR-015)

  demand      — Wordstat/manual volume, GSC impressions, presence in Google
                Suggest, all normalised to 0..1 and mixed by config weights.
  uncovered   — 1 - max TF-IDF similarity to an already published article;
                candidates above `similarity_drop` are discarded entirely.
  seasonality — calendar of Russian submission deadlines (data, see config).
"""

from __future__ import annotations

import math
import re
from datetime import date

import similarity

# Only formatting/GOST intent belongs to the `gost` cluster.
GOST_HINTS = re.compile(
    r"гост|оформл|титульн|список\s+литератур|библиограф|сноск|ссылк|шрифт|"
    r"поля|интервал|нумерац|содержан|оглавлен|приложен|таблиц|рисун|аннотац|"
    r"рецензи|антиплагиат|уникальн|структур|план|введен|заключен|"
    r"диплом|курсов|реферат|вкр|магистерск|диссертац|практик|эссе|доклад|отчёт|отчет",
    re.IGNORECASE,
)

SEASON_TERMS = {
    "diploma": re.compile(r"диплом|вкр|магистерск|диссертац", re.IGNORECASE),
    "coursework": re.compile(r"курсов", re.IGNORECASE),
    "practice": re.compile(r"практик", re.IGNORECASE),
    "small": re.compile(r"реферат|эссе|доклад|контрольн", re.IGNORECASE),
}

# month -> multiplier per term group; 1.0 for anything unlisted.
SEASON_CALENDAR: dict[str, dict[int, float]] = {
    "diploma": {4: 1.4, 5: 1.5, 6: 1.3, 1: 1.1, 2: 1.1, 3: 1.2},
    "coursework": {10: 1.3, 11: 1.4, 12: 1.3, 3: 1.2, 4: 1.2},
    "practice": {6: 1.3, 7: 1.2, 8: 1.2, 9: 1.3},
    "small": {9: 1.2, 10: 1.2, 2: 1.1, 3: 1.1},
}


def seasonality(phrase: str, today: date | None = None) -> float:
    m = (today or date.today()).month
    best = 1.0
    for group, rx in SEASON_TERMS.items():
        if rx.search(phrase):
            best = max(best, SEASON_CALENDAR.get(group, {}).get(m, 1.0))
    return best


def _norm(value: float, top: float) -> float:
    if top <= 0:
        return 0.0
    return min(1.0, math.log1p(max(value, 0.0)) / math.log1p(top))


def candidates(conn, banned_rx: re.Pattern[str]) -> dict[str, dict]:
    """Merge query rows from all sources into one phrase -> metrics map."""
    out: dict[str, dict] = {}
    for r in conn.execute("SELECT * FROM queries"):
        phrase = (r["phrase"] or "").strip().lower()
        if len(phrase) < 8 or not GOST_HINTS.search(phrase):
            continue
        if banned_rx.search(phrase):
            continue
        c = out.setdefault(phrase, {"phrase": phrase, "volume": 0, "impressions": 0,
                                    "clicks": 0, "position": 0.0, "in_suggest": False,
                                    "sources": set()})
        c["sources"].add(r["source"])
        c["volume"] = max(c["volume"], int(r["volume"] or 0))
        c["impressions"] = max(c["impressions"], int(r["impressions"] or 0))
        c["clicks"] = max(c["clicks"], int(r["clicks"] or 0))
        c["position"] = max(c["position"], float(r["position"] or 0.0))
        if r["source"] == "suggest":
            c["in_suggest"] = True
    return out


def shortlist(conn, cfg: dict, posts: list[dict], banned_rx: re.Pattern[str],
              today: date | None = None) -> list[dict]:
    sc = cfg["score"]
    cands = candidates(conn, banned_rx)
    if not cands:
        return []
    index = similarity.TfidfIndex(
        [similarity.post_document(p) for p in posts],
        [p["slug"] for p in posts],
    )
    top_vol = max((c["volume"] for c in cands.values()), default=0)
    top_imp = max((c["impressions"] for c in cands.values()), default=0)

    scored: list[dict] = []
    for c in cands.values():
        nearest, sim = index.max_similarity(c["phrase"])
        if sim >= sc["similarity_drop"]:
            continue
        demand = (
            sc["w_volume"] * _norm(c["volume"], top_vol)
            + sc["w_impressions"] * _norm(c["impressions"], top_imp)
            + sc["w_suggest"] * (1.0 if c["in_suggest"] else 0.0)
        )
        season = seasonality(c["phrase"], today)
        uncovered = 1.0 - sim
        scored.append({
            "phrase": c["phrase"],
            "score": round(demand * uncovered * season, 5),
            "demand": round(demand, 4),
            "uncovered": round(uncovered, 4),
            "seasonality": season,
            "similarity": round(sim, 4),
            "nearest_slug": nearest,
            "volume": c["volume"],
            "impressions": c["impressions"],
            "sources": sorted(c["sources"]),
        })
    scored.sort(key=lambda x: (-x["score"], x["phrase"]))
    return scored[: sc.get("shortlist_size", 10)]


def topic_id_for(conn, phrase: str) -> int | None:
    row = conn.execute("SELECT id FROM topics WHERE seed_phrase = ?", (phrase,)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT OR IGNORE INTO topics (cluster, seed_phrase, status) VALUES ('gost', ?, 'new')",
        (phrase,))
    conn.commit()
    if cur.lastrowid:
        return cur.lastrowid
    row = conn.execute("SELECT id FROM topics WHERE seed_phrase = ?", (phrase,)).fetchone()
    return row["id"] if row else None
