"""Stage 4a — deterministic checks on the generated article (no LLM).

`banned_product` is fatal: no rewrite attempt, the run is rejected (ADR-015).
Every other failure produces feedback for exactly one rewrite.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import similarity

GOST_MENTION_RE = re.compile(r"ГОСТ\s*(?:Р\s*)?[\d][\d.\-–—]*", re.IGNORECASE)
WORD_RE = re.compile(r"[А-Яа-яЁёA-Za-z0-9-]+")


@dataclass
class Failure:
    code: str
    message: str
    fatal: bool = False


def _norm_gost(s: str) -> str:
    s = s.lower().replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


def article_text(article: dict) -> str:
    return " ".join([
        article.get("title", ""),
        article.get("description", ""),
        article.get("content_markdown", ""),
        " ".join(article.get("keywords", []) or []),
    ])


def check_banned_product(article: dict, banned_rx: re.Pattern[str]) -> Failure | None:
    m = banned_rx.search(article_text(article))
    if m:
        return Failure("banned_product_mention",
                       f"текст упоминает несуществующий продукт: {m.group(0)!r}", fatal=True)
    return None


def check_safety(article: dict, safety_rx: re.Pattern[str]) -> Failure | None:
    m = safety_rx.search(article_text(article))
    if m:
        return Failure("safety_stopword", f"стоп-слово в тексте: {m.group(0)!r}", fatal=True)
    return None


def check_min_words(article: dict, min_words: int) -> Failure | None:
    n = len(WORD_RE.findall(article.get("content_markdown", "")))
    if n < min_words:
        return Failure("too_short", f"в статье {n} слов, нужно не меньше {min_words}")
    return None


def check_keywords(article: dict, brief: dict, min_present: int) -> Failure | None:
    text = article_text(article).lower()
    brief_kw = [k.lower().strip() for k in brief.get("keywords", []) if k.strip()]
    present = [k for k in brief_kw if k in text]
    if len(present) < min_present:
        missing = [k for k in brief_kw if k not in present]
        return Failure("keywords_missing",
                       f"в тексте только {len(present)} ключевых слов из брифа, "
                       f"нужно {min_present}; нет: {', '.join(missing[:5])}")
    own_missing = [k for k in (article.get("keywords") or [])
                   if k.lower().strip() and k.lower().strip() not in text]
    if own_missing:
        return Failure("keywords_missing",
                       "ключевые слова статьи не встречаются в тексте: "
                       + ", ".join(own_missing[:5]))
    return None


def check_gost_whitelist(article: dict, whitelist: list[str]) -> Failure | None:
    allowed = {_norm_gost(g) for g in whitelist}
    # "ГОСТ 7.32" also covers a mention written as "ГОСТ 7.32-2017" only if listed
    bad = []
    for mention in GOST_MENTION_RE.findall(article.get("content_markdown", "")):
        if _norm_gost(mention).rstrip(".,") not in allowed:
            bad.append(mention.strip())
    if bad:
        uniq = sorted(set(bad))
        return Failure("gost_not_whitelisted",
                       "стандарты вне белого списка: " + ", ".join(uniq[:5]))
    return None


def check_slug_unique(article: dict, existing_slugs: set[str]) -> Failure | None:
    if article.get("slug") in existing_slugs:
        return Failure("slug_taken", f"slug {article['slug']!r} уже занят")
    if not re.fullmatch(r"[a-z0-9-]+", article.get("slug", "")):
        return Failure("slug_invalid", f"slug {article.get('slug')!r} не kebab-case")
    return None


def check_title_similarity(article: dict, posts: list[dict], threshold: float) -> Failure | None:
    if not posts:
        return None
    index = similarity.TfidfIndex([p.get("title", "") for p in posts],
                                  [p["slug"] for p in posts])
    slug, sim = index.max_similarity(article.get("title", ""))
    if sim >= threshold:
        return Failure("title_duplicate",
                       f"заголовок похож на статью {slug} (сходство {sim:.2f})")
    return None


def run_all(article: dict, brief: dict, posts: list[dict], cfg: dict,
            banned_rx: re.Pattern[str], safety_rx: re.Pattern[str]) -> list[Failure]:
    c = cfg["checks"]
    whitelist = brief.get("gost_whitelist") or []
    results = [
        check_banned_product(article, banned_rx),
        check_safety(article, safety_rx),
        check_min_words(article, c["min_words"]),
        check_keywords(article, brief, c["min_keywords_present"]),
        check_gost_whitelist(article, whitelist),
        check_slug_unique(article, {p["slug"] for p in posts}),
        check_title_similarity(article, posts, c["title_similarity_max"]),
    ]
    return [r for r in results if r is not None]
