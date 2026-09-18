"""Stage 4b — publish the article through POST /api/blog/publish.

In dry-run the payload is only logged (no request, no secrets in the log).
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import date

log = logging.getLogger("blog.publish")

UA = "diplox-blog-nightly/1.0"


class PublishError(RuntimeError):
    pass


def build_payload(article: dict, today: date | None = None) -> dict:
    return {
        "slug": article["slug"],
        "title": article["title"],
        "description": article["description"],
        "content": article["content_markdown"],
        "datePublished": (today or date.today()).isoformat(),
        "keywords": article.get("keywords", []),
        "readingTime": article.get("reading_time", "5 мин"),
        "cluster": "gost",
    }


def redact(payload: dict, content_chars: int = 400) -> dict:
    """Shortened copy for the log — the article body is huge."""
    p = dict(payload)
    body = p.get("content", "")
    p["content"] = body[:content_chars] + ("… [%d символов всего]" % len(body)
                                           if len(body) > content_chars else "")
    return p


def publish(payload: dict, site_url: str, token: str, timeout: float = 30.0) -> dict:
    url = site_url.rstrip("/") + "/api/blog/publish"
    req = urllib.request.Request(
        url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:500]
        raise PublishError(f"publish failed: HTTP {e.code} {body}") from e
    except urllib.error.URLError as e:
        raise PublishError(f"publish failed: {e.reason}") from e


def run(article: dict, cfg: dict, site_url: str, dry_run: bool) -> dict:
    payload = build_payload(article)
    if dry_run:
        log.info("DRY-RUN payload:\n%s",
                 json.dumps(redact(payload), ensure_ascii=False, indent=1))
        return {"ok": True, "dry_run": True, "slug": payload["slug"]}
    token = os.environ.get(cfg["publish"]["token_env"])
    if not token:
        raise PublishError(f"{cfg['publish']['token_env']} is not set")
    result = publish(payload, site_url, token)
    log.info("published: %s", result)
    return result
