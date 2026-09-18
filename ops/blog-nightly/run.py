#!/usr/bin/env python3
"""Nightly blog pipeline entry point (ADR-015).

    python3 run.py --stage all [--dry-run] [--db PATH] [--log-dir DIR]

`BLOG_DRY_RUN=1` in the environment forces dry-run: nothing is ever published.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
import tomllib
import uuid
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import checks  # noqa: E402
import db  # noqa: E402
import editor  # noqa: E402
import llm  # noqa: E402
import publish as publish_mod  # noqa: E402
import recon  # noqa: E402
import score as score_mod  # noqa: E402
import writer  # noqa: E402

log = logging.getLogger("blog")
STAGES = ("recon", "score", "editor", "writer", "publish", "all")


def load_config(path: Path) -> dict:
    cfg = tomllib.loads(path.read_text("utf-8"))
    cfg["site"]["url"] = os.environ.get("SITE_URL") or cfg["site"]["url"]
    return cfg


def data_file(name: str) -> list[str]:
    lines = (HERE / name).read_text("utf-8").splitlines()
    return [l.strip() for l in lines if l.strip() and not l.startswith("#")]


def setup_logging(log_dir: Path) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    handlers = [logging.StreamHandler(sys.stdout),
                logging.FileHandler(log_dir / f"{date.today().isoformat()}.log", "a", "utf-8")]
    logging.basicConfig(level=logging.INFO, handlers=handlers,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")


class Lock:
    def __init__(self, path: Path):
        self.path = path
        self.fd: int | None = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            age = time.time() - self.path.stat().st_mtime
            if age < 6 * 3600:
                raise SystemExit(f"another run holds {self.path} ({age / 60:.0f} min old)")
            log.warning("stale lock %s (%.1f h), taking over", self.path, age / 3600)
            self.path.unlink(missing_ok=True)
            self.fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(self.fd, str(os.getpid()).encode())
        return self

    def __exit__(self, *exc):
        if self.fd is not None:
            os.close(self.fd)
        self.path.unlink(missing_ok=True)


def make_client(cfg: dict) -> llm.LLMClient:
    lc = cfg["llm"]
    base = os.environ.get(lc["base_url_env"], "")
    key = os.environ.get(lc["api_key_env"], "")
    if not base or not key:
        raise SystemExit(f"{lc['base_url_env']} / {lc['api_key_env']} are not set")
    return llm.LLMClient(base_url=base, api_key=key, max_calls=lc["max_llm_calls_per_run"],
                         price_per_mtok=lc["price_per_mtok"], timeout=lc["timeout_s"],
                         max_retries=lc["max_retries"])


def compute_shortlist(conn, cfg: dict, banned_rx) -> tuple[list[dict], list[dict]]:
    posts = db.get_posts(conn, cluster="gost")
    return score_mod.shortlist(conn, cfg, posts, banned_rx), posts


def write_artifact(log_dir: Path, name: str, payload: dict) -> Path:
    path = log_dir / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Diplox nightly blog pipeline")
    ap.add_argument("--stage", choices=STAGES, default="all")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--db", default=None)
    ap.add_argument("--log-dir", default=None)
    ap.add_argument("--config", default=str(HERE / "config.toml"))
    args = ap.parse_args(argv)

    cfg = load_config(Path(args.config))
    dry_run = args.dry_run or os.environ.get("BLOG_DRY_RUN") == "1"
    log_dir = Path(args.log_dir or cfg["paths"]["log_dir"])
    setup_logging(log_dir)
    db_path = args.db or cfg["paths"]["db"]

    banned_rx = re.compile(cfg["checks"]["banned_product_regex"], re.IGNORECASE)
    safety_rx = re.compile(cfg["checks"]["safety_regex"], re.IGNORECASE)

    run_id = f"{date.today().isoformat()}-{uuid.uuid4().hex[:8]}"
    timings: dict[str, float] = {}
    conn = db.connect(db_path)
    db.migrate(conn)
    db.ensure_topics(conn, data_file("seeds.txt"))
    conn.commit()
    db.start_run(conn, run_id, date.today().isoformat(), dry_run)
    log.info("run %s stage=%s dry_run=%s db=%s", run_id, args.stage, dry_run, db_path)

    lock_path = Path(args.log_dir or cfg["paths"]["log_dir"]) / "run.lock" \
        if args.log_dir else Path(cfg["paths"]["lock"])
    client: llm.LLMClient | None = None
    try:
        with Lock(lock_path):
            result = run_stages(args.stage, conn, cfg, run_id, dry_run, log_dir,
                                banned_rx, safety_rx, timings)
            client = result.get("client")
            usage = client.usage if client else llm.Usage()
            db.finish_run(conn, run_id, stage_timings=timings, llm_calls=usage.calls,
                          tokens=usage.total_tokens,
                          cost_usd=round(usage.cost_usd(cfg["llm"]["price_per_mtok"]), 6),
                          result=result["result"], published_slug=result.get("slug"),
                          error=result.get("error"))
            log.info("run %s finished: %s (%s calls, %s tokens, $%.4f)", run_id,
                     result["result"], usage.calls, usage.total_tokens,
                     usage.cost_usd(cfg["llm"]["price_per_mtok"]))
            return 0 if result["result"] in ("ok", "dry_run_ok", "stage_done") else 1
    except Exception as e:  # noqa: BLE001 — one nightly run must not crash silently
        log.exception("run %s failed", run_id)
        usage = client.usage if client else llm.Usage()
        db.finish_run(conn, run_id, stage_timings=timings, result="error", error=str(e)[:500],
                      llm_calls=usage.calls, tokens=usage.total_tokens)
        return 1
    finally:
        conn.close()


def run_stages(stage: str, conn, cfg: dict, run_id: str, dry_run: bool, log_dir: Path,
               banned_rx, safety_rx, timings: dict) -> dict:
    tone = (HERE / "prompts" / "tone.md").read_text("utf-8")
    gost_whitelist = data_file("prompts/gost-whitelist.txt")
    internal_links = data_file("prompts/internal-links.txt")
    out: dict = {"result": "stage_done"}

    if stage in ("recon", "all"):
        t = time.monotonic()
        stats = recon.run(conn, cfg, cfg["recon"].get("deadline_s", 60))
        timings["recon"] = round(time.monotonic() - t, 2)
        log.info("recon: %s", stats)
        if stage == "recon":
            return out

    t = time.monotonic()
    shortlist, posts = compute_shortlist(conn, cfg, banned_rx)
    timings["score"] = round(time.monotonic() - t, 2)
    log.info("shortlist (%d):\n%s", len(shortlist),
             "\n".join(f"  {i + 1:2d}. {c['score']:.3f}  {c['phrase']}  "
                       f"(спрос {c['demand']:.2f}, непокрытость {c['uncovered']:.2f}, "
                       f"сезон {c['seasonality']:.2f}, ближайшая {c['nearest_slug']})"
                       for i, c in enumerate(shortlist)))
    write_artifact(log_dir, f"shortlist-{run_id}.json", {"shortlist": shortlist})
    if stage == "score":
        return out

    client = make_client(cfg)
    out["client"] = client
    t = time.monotonic()
    brief = editor.run(client, cfg, shortlist, posts, gost_whitelist, internal_links,
                       tone, (HERE / "prompts" / "editor.md").read_text("utf-8"), banned_rx)
    timings["editor"] = round(time.monotonic() - t, 2)
    topic_id = score_mod.topic_id_for(conn, brief["target_query"].strip().lower())
    db.save_brief(conn, run_id, topic_id, brief, cfg["editor"]["model"])
    write_artifact(log_dir, f"brief-{run_id}.json", brief)
    log.info("brief: %s", json.dumps(brief, ensure_ascii=False))
    if stage == "editor":
        return out

    t = time.monotonic()
    instructions = (HERE / "prompts" / "writer.md").read_text("utf-8")
    article = writer.run(client, cfg, brief, tone, instructions)
    failures = checks.run_all(article, brief, posts, cfg, banned_rx, safety_rx)
    if failures and not any(f.fatal for f in failures):
        log.warning("checks failed, one rewrite: %s", [f.code for f in failures])
        article = writer.run(client, cfg, brief, tone, instructions,
                             feedback=[f.message for f in failures])
        failures = checks.run_all(article, brief, posts, cfg, banned_rx, safety_rx)
    timings["writer"] = round(time.monotonic() - t, 2)
    write_artifact(log_dir, f"article-{run_id}.json",
                   {**article, "checks": [f.code for f in failures]})
    if failures:
        codes = ",".join(f.code for f in failures)
        log.error("rejected: %s", "; ".join(f"{f.code}: {f.message}" for f in failures))
        out.update(result=failures[0].code if failures[0].fatal else "checks_failed",
                   error=codes)
        return out
    log.info("checks passed: %s (%s)", article["slug"], article["reading_time"])
    if stage == "writer":
        return out

    t = time.monotonic()
    res = publish_mod.run(article, cfg, cfg["site"]["url"], dry_run)
    timings["publish"] = round(time.monotonic() - t, 2)
    if topic_id and not dry_run:
        db.mark_topic_covered(conn, topic_id, article["slug"])
    out.update(result="dry_run_ok" if dry_run else "ok", slug=res.get("slug"))
    return out


if __name__ == "__main__":
    raise SystemExit(main())
