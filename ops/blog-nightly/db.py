"""SQLite storage for the nightly blog pipeline (ADR-015).

Schema is created and migrated idempotently: `migrate()` may be called on
every run. No external dependencies.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Iterable

DEFAULT_DB = "/var/lib/diplox-blog/blog.db"

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS posts (
        slug TEXT PRIMARY KEY,
        cluster TEXT NOT NULL DEFAULT 'gost',
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '[]',
        date_published TEXT,
        source TEXT NOT NULL DEFAULT 'site',
        seen_at INTEGER
    )""",
    """CREATE TABLE IF NOT EXISTS queries (
        phrase TEXT NOT NULL,
        source TEXT NOT NULL,
        volume INTEGER,
        impressions INTEGER,
        clicks INTEGER,
        ctr REAL,
        position REAL,
        seen_at INTEGER,
        PRIMARY KEY (phrase, source)
    )""",
    """CREATE TABLE IF NOT EXISTS competitor_posts (
        site TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        seen_at INTEGER,
        PRIMARY KEY (site, url)
    )""",
    """CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cluster TEXT NOT NULL DEFAULT 'gost',
        seed_phrase TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'new',
        covered_by_slug TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS embeddings (
        kind TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        model TEXT NOT NULL,
        vector BLOB,
        updated_at INTEGER,
        PRIMARY KEY (kind, ref_id, model)
    )""",
    """CREATE TABLE IF NOT EXISTS briefs (
        run_id TEXT NOT NULL,
        topic_id INTEGER,
        json TEXT NOT NULL,
        model TEXT,
        created_at INTEGER,
        PRIMARY KEY (run_id)
    )""",
    """CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        stage_timings TEXT NOT NULL DEFAULT '{}',
        llm_calls INTEGER NOT NULL DEFAULT 0,
        tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        result TEXT,
        published_slug TEXT,
        error TEXT,
        dry_run INTEGER NOT NULL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_queries_source ON queries(source)",
    "CREATE INDEX IF NOT EXISTS idx_runs_date ON runs(date DESC)",
]


def connect(path: str = DEFAULT_DB) -> sqlite3.Connection:
    p = Path(path)
    if p.parent and str(p.parent) not in ("", "."):
        p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def migrate(conn: sqlite3.Connection) -> None:
    """Create everything that is missing. Safe to call repeatedly."""
    cur = conn.cursor()
    for stmt in SCHEMA:
        cur.execute(stmt)
    conn.commit()


def now() -> int:
    return int(time.time())


def upsert_post(conn: sqlite3.Connection, post: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO posts (slug, cluster, title, description, keywords,
                              date_published, source, seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             cluster=excluded.cluster, title=excluded.title,
             description=excluded.description, keywords=excluded.keywords,
             date_published=excluded.date_published, seen_at=excluded.seen_at""",
        (
            post["slug"],
            post.get("cluster", "gost"),
            post.get("title", ""),
            post.get("description", ""),
            json.dumps(post.get("keywords", []), ensure_ascii=False),
            post.get("date_published"),
            post.get("source", "site"),
            now(),
        ),
    )


def upsert_query(conn: sqlite3.Connection, q: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO queries (phrase, source, volume, impressions, clicks,
                                ctr, position, seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(phrase, source) DO UPDATE SET
             volume=excluded.volume, impressions=excluded.impressions,
             clicks=excluded.clicks, ctr=excluded.ctr,
             position=excluded.position, seen_at=excluded.seen_at""",
        (
            q["phrase"].strip().lower(),
            q["source"],
            q.get("volume"),
            q.get("impressions"),
            q.get("clicks"),
            q.get("ctr"),
            q.get("position"),
            now(),
        ),
    )


def upsert_competitor_post(conn: sqlite3.Connection, site: str, url: str, title: str) -> None:
    conn.execute(
        """INSERT INTO competitor_posts (site, url, title, seen_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(site, url) DO UPDATE SET
             title=excluded.title, seen_at=excluded.seen_at""",
        (site, url, title, now()),
    )


def ensure_topics(conn: sqlite3.Connection, seeds: Iterable[str], cluster: str = "gost") -> None:
    for s in seeds:
        conn.execute(
            "INSERT OR IGNORE INTO topics (cluster, seed_phrase, status) VALUES (?, ?, 'new')",
            (cluster, s.strip().lower()),
        )


def competitor_age_days(conn: sqlite3.Connection) -> float | None:
    row = conn.execute("SELECT MAX(seen_at) AS t FROM competitor_posts").fetchone()
    if not row or not row["t"]:
        return None
    return (now() - row["t"]) / 86400.0


def get_posts(conn: sqlite3.Connection, cluster: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM posts"
    args: tuple = ()
    if cluster:
        sql += " WHERE cluster = ?"
        args = (cluster,)
    out = []
    for r in conn.execute(sql, args):
        d = dict(r)
        try:
            d["keywords"] = json.loads(d.get("keywords") or "[]")
        except json.JSONDecodeError:
            d["keywords"] = []
        out.append(d)
    return out


def start_run(conn: sqlite3.Connection, run_id: str, date: str, dry_run: bool) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO runs (run_id, date, started_at, dry_run) VALUES (?, ?, ?, ?)",
        (run_id, date, now(), 1 if dry_run else 0),
    )
    conn.commit()


def finish_run(conn: sqlite3.Connection, run_id: str, **fields: Any) -> None:
    if "stage_timings" in fields and not isinstance(fields["stage_timings"], str):
        fields["stage_timings"] = json.dumps(fields["stage_timings"], ensure_ascii=False)
    fields["finished_at"] = now()
    cols = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE runs SET {cols} WHERE run_id = ?", (*fields.values(), run_id))
    conn.commit()


def save_brief(conn: sqlite3.Connection, run_id: str, topic_id: int | None,
               brief: dict[str, Any], model: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO briefs (run_id, topic_id, json, model, created_at) VALUES (?, ?, ?, ?, ?)",
        (run_id, topic_id, json.dumps(brief, ensure_ascii=False), model, now()),
    )
    conn.commit()


def mark_topic_covered(conn: sqlite3.Connection, topic_id: int, slug: str) -> None:
    conn.execute(
        "UPDATE topics SET status = 'covered', covered_by_slug = ? WHERE id = ?",
        (slug, topic_id),
    )
    conn.commit()
