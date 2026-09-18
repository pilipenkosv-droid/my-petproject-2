"""Stage 1 — recon: refresh own posts, suggest phrases, competitors, volumes.

No LLM. Every source is best-effort: a network failure is logged and the
pipeline continues, except the site post list, which is required (ADR-015).
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import db

log = logging.getLogger("blog.recon")

UA = "diplox-blog-nightly/1.0 (+https://diplox.online)"
SUGGEST_URL = "https://www.google.com/complete/search?client=chrome&hl=ru&gl=ru&q="


class ReconError(RuntimeError):
    pass


def fetch(url: str, timeout: float = 15.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_text(url: str, timeout: float = 15.0, encoding: str = "utf-8") -> str:
    return fetch(url, timeout).decode(encoding, "replace")


# --- own posts ------------------------------------------------------------

def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1]


def parse_rss(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    posts = []
    for item in root.iter():
        if _strip_ns(item.tag) != "item":
            continue
        d = {_strip_ns(c.tag): (c.text or "").strip() for c in item}
        link = d.get("link", "")
        slug = link.rstrip("/").rsplit("/", 1)[-1]
        if not slug:
            continue
        posts.append({
            "slug": slug,
            "title": d.get("title", ""),
            "description": d.get("description", ""),
            "date_published": d.get("pubDate", "")[:16],
            "keywords": [c.text for c in item if _strip_ns(c.tag) == "category" and c.text],
        })
    return posts


def parse_sitemap_urls(xml_text: str, prefix: str | None = None) -> list[str]:
    root = ET.fromstring(xml_text)
    urls = [(e.text or "").strip() for e in root.iter() if _strip_ns(e.tag) == "loc"]
    if prefix:
        urls = [u for u in urls if prefix in u]
    return [u for u in urls if u]


def collect_site_posts(site_url: str) -> list[dict]:
    """RSS first (has titles), sitemap as a fallback / slug top-up."""
    posts: dict[str, dict] = {}
    try:
        for p in parse_rss(fetch_text(f"{site_url}/api/rss")):
            posts[p["slug"]] = p
    except Exception as e:  # noqa: BLE001 - best effort, sitemap may still work
        log.warning("rss failed: %s", e)
    try:
        for u in parse_sitemap_urls(fetch_text(f"{site_url}/sitemap.xml"), prefix="/blog/"):
            slug = u.rstrip("/").rsplit("/", 1)[-1]
            posts.setdefault(slug, {"slug": slug, "title": slug.replace("-", " "),
                                    "description": "", "keywords": [], "date_published": None})
    except Exception as e:  # noqa: BLE001
        log.warning("sitemap failed: %s", e)
    if not posts:
        raise ReconError("no posts from site RSS/sitemap — cannot run the pipeline blind")
    return list(posts.values())


# --- google suggest -------------------------------------------------------

def suggest(phrase: str, timeout: float = 8.0) -> list[str]:
    url = SUGGEST_URL + urllib.parse.quote(phrase)
    raw = fetch(url, timeout)
    try:
        text = raw.decode("utf-8")
        data = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError):
        data = json.loads(raw.decode("windows-1251", "replace"))
    return [s for s in (data[1] or []) if isinstance(s, str)]


# --- competitors ----------------------------------------------------------

def sitemaps_from_robots(site: str, timeout: float = 10.0) -> list[str]:
    try:
        robots = fetch_text(f"{site}/robots.txt", timeout)
    except Exception as e:  # noqa: BLE001
        log.warning("robots.txt failed for %s: %s", site, e)
        return []
    return re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots)


def competitor_titles(site: str, limit: int = 200) -> list[tuple[str, str]]:
    """Return (url, title) pairs; titles are derived from slugs when absent."""
    out: list[tuple[str, str]] = []
    candidates = sitemaps_from_robots(site) or [f"{site}/sitemap.xml"]
    for sm in candidates[:5]:
        try:
            body = fetch_text(sm)
        except Exception as e:  # noqa: BLE001
            log.warning("sitemap %s failed: %s", sm, e)
            continue
        try:
            urls = parse_sitemap_urls(body)
        except ET.ParseError:
            continue
        nested = [u for u in urls if u.endswith(".xml")]
        for n in nested[:3]:
            try:
                urls += parse_sitemap_urls(fetch_text(n))
            except Exception as e:  # noqa: BLE001
                log.warning("nested sitemap %s failed: %s", n, e)
        for u in urls:
            if u.endswith(".xml"):
                continue
            slug = u.rstrip("/").rsplit("/", 1)[-1]
            if len(slug) < 8 or "." in slug:
                continue
            out.append((u, urllib.parse.unquote(slug).replace("-", " ").replace("_", " ")))
            if len(out) >= limit:
                return out
    return out


# --- wordstat manual import ----------------------------------------------

def wordstat_rows(path: str) -> list[dict]:
    p = Path(path)
    if not p.exists():
        log.warning("wordstat file %s missing", path)
        return []
    data = json.loads(p.read_text("utf-8"))
    rows = data if isinstance(data, list) else data.get("rows", [])
    return [{"phrase": r["query"], "source": "manual", "volume": int(r.get("wordstat") or 0)}
            for r in rows if r.get("query")]


# --- GSC (optional) -------------------------------------------------------

def gsc_rows(site_property: str, days: int = 28) -> list[dict]:
    """Search Console impressions per query. Needs `google-auth` (RS256 JWT
    cannot be signed with the stdlib). Returns [] when unavailable."""
    key_file = os.environ.get("GSC_SERVICE_ACCOUNT_JSON")
    if not key_file or not Path(key_file).exists():
        log.info("gsc: no service account file, skipping")
        return []
    try:
        from google.oauth2 import service_account  # type: ignore
        from google.auth.transport.requests import Request  # type: ignore
    except ImportError:
        log.info("gsc: google-auth not installed (apt install python3-google-auth), skipping")
        return []
    creds = service_account.Credentials.from_service_account_file(
        key_file, scopes=["https://www.googleapis.com/auth/webmasters.readonly"])
    creds.refresh(Request())
    end = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 86400))
    start = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 86400 * days))
    url = ("https://searchconsole.googleapis.com/webmasters/v3/sites/"
           f"{urllib.parse.quote(site_property, safe='')}/searchAnalytics/query")
    body = json.dumps({"startDate": start, "endDate": end,
                       "dimensions": ["query"], "rowLimit": 500}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode())
    return [{"phrase": row["keys"][0], "source": "gsc",
             "impressions": int(row.get("impressions") or 0),
             "clicks": int(row.get("clicks") or 0),
             "ctr": float(row.get("ctr") or 0), "position": float(row.get("position") or 0)}
            for row in data.get("rows", [])]


# --- orchestration --------------------------------------------------------

def _harvest_suggest(conn, cfg: dict, started: float, deadline_s: float) -> int:
    """Google Suggest by seed phrases. Gets only a share of the recon budget,
    otherwise the weekly competitor pass never gets its turn."""
    seeds = [r["seed_phrase"] for r in conn.execute(
        "SELECT seed_phrase FROM topics WHERE cluster='gost' AND status='new'")]
    suggest_deadline = deadline_s * cfg["recon"].get("suggest_share", 0.6)
    found = 0
    for phrase in seeds:
        if time.monotonic() - started > suggest_deadline:
            log.warning("recon deadline hit, suggest stopped after %s phrases", found)
            break
        try:
            for s in suggest(phrase):
                db.upsert_query(conn, {"phrase": s, "source": "suggest"})
                found += 1
        except Exception as e:  # noqa: BLE001
            log.warning("suggest failed for %r: %s", phrase, e)
        time.sleep(cfg["recon"].get("suggest_delay_s", 0.2))
    conn.commit()
    return found


def _harvest_competitors(conn, cfg: dict, started: float, deadline_s: float) -> int:
    age = db.competitor_age_days(conn)
    if age is not None and age < cfg["recon"].get("competitor_interval_days", 7):
        log.info("competitors fresh (%.1f days), skipping", age)
        return 0
    found = 0
    for site_url in cfg["recon"]["competitors"]:
        if time.monotonic() - started > deadline_s:
            log.warning("recon deadline hit, competitors incomplete")
            break
        try:
            for url, title in competitor_titles(site_url):
                db.upsert_competitor_post(conn, site_url, url, title)
                found += 1
        except Exception as e:  # noqa: BLE001
            log.warning("competitor %s failed: %s", site_url, e)
    conn.commit()
    return found


def _harvest_volumes(conn, cfg: dict) -> tuple[int, int]:
    wordstat = 0
    for row in wordstat_rows(cfg["recon"]["wordstat_file"]):
        db.upsert_query(conn, row)
        wordstat += 1
    gsc = 0
    try:
        for row in gsc_rows(cfg["recon"].get("gsc_site", "sc-domain:diplox.online")):
            db.upsert_query(conn, row)
            gsc += 1
    except Exception as e:  # noqa: BLE001
        log.warning("gsc failed: %s", e)
    conn.commit()
    return wordstat, gsc


def run(conn, cfg: dict, deadline_s: float = 60.0) -> dict:
    site = cfg["site"]["url"].rstrip("/")
    started = time.monotonic()
    stats = {"posts": 0, "suggest": 0, "competitors": 0, "wordstat": 0, "gsc": 0}

    for p in collect_site_posts(site):
        p["cluster"] = "gost"
        db.upsert_post(conn, p)
        stats["posts"] += 1
    conn.commit()

    stats["suggest"] = _harvest_suggest(conn, cfg, started, deadline_s)
    stats["wordstat"], stats["gsc"] = _harvest_volumes(conn, cfg)
    stats["competitors"] = _harvest_competitors(conn, cfg, started, deadline_s)
    return stats
