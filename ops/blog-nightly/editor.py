"""Stage 2b — editor: one LLM call that turns the shortlist into a brief.

The brief is validated against `schemas/brief.json` with a small stdlib
validator (the subset of JSON Schema the file actually uses), so the server
needs no `jsonschema` package.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import llm

log = logging.getLogger("blog.editor")

HERE = Path(__file__).resolve().parent
TYPES = {"object": dict, "array": list, "string": str, "number": (int, float),
         "integer": int, "boolean": bool}


class BriefInvalid(ValueError):
    pass


def load_schema(path: Path | None = None) -> dict:
    return json.loads((path or HERE / "schemas" / "brief.json").read_text("utf-8"))


def validate(instance, schema: dict, where: str = "$") -> list[str]:
    """Return a list of human-readable violations (empty = valid)."""
    errors: list[str] = []
    expected = schema.get("type")
    if expected and not isinstance(instance, TYPES[expected]):
        return [f"{where}: expected {expected}, got {type(instance).__name__}"]
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{where}: {instance!r} not in {schema['enum']}")
    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            errors.append(f"{where}: shorter than minLength {schema['minLength']}")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            errors.append(f"{where}: longer than maxLength {schema['maxLength']}")
    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0):
            errors.append(f"{where}: fewer than minItems {schema['minItems']}")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            errors.append(f"{where}: more than maxItems {schema['maxItems']}")
        item_schema = schema.get("items")
        if item_schema:
            for i, item in enumerate(instance):
                errors += validate(item, item_schema, f"{where}[{i}]")
    if isinstance(instance, dict):
        for key in schema.get("required", []):
            if key not in instance:
                errors.append(f"{where}: missing required field {key!r}")
        for key, sub in schema.get("properties", {}).items():
            if key in instance:
                errors += validate(instance[key], sub, f"{where}.{key}")
    return errors


def build_prompt(shortlist: list[dict], posts: list[dict], gost_whitelist: list[str],
                 internal_links: list[str], tone: str, instructions: str) -> list[dict]:
    recent = sorted(posts, key=lambda p: p.get("date_published") or "", reverse=True)[:60]
    ctx = {
        "shortlist": [{k: c[k] for k in ("phrase", "score", "demand", "uncovered",
                                         "seasonality", "similarity", "nearest_slug")}
                      for c in shortlist],
        "published_posts": [{"slug": p["slug"], "title": p.get("title", "")} for p in recent],
        "allowed_internal_links": internal_links,
        "gost_whitelist": gost_whitelist,
    }
    user = (
        "Шорт-лист тем, уже опубликованные статьи и разрешённые ссылки:\n\n"
        + json.dumps(ctx, ensure_ascii=False, indent=1)
        + "\n\nВыбери одну тему и верни бриф JSON."
    )
    return [
        {"role": "system", "content": instructions + "\n\n" + tone},
        {"role": "user", "content": user},
    ]


def sanitize(brief: dict, allowed_links: list[str], allowed_gost: list[str],
             post_slugs: set[str]) -> dict:
    """Drop links/standards the editor invented — cheaper than a second call."""
    brief["cluster"] = "gost"
    links = [l.strip() for l in brief.get("internal_links", []) if isinstance(l, str)]
    brief["internal_links"] = [
        l for l in links
        if l in allowed_links or (l.startswith("/blog/") and l[6:].strip("/") in post_slugs)
    ][:4]
    norm = {g.lower().replace("—", "-"): g for g in allowed_gost}
    brief["gost_whitelist"] = [norm[g.lower()] for g in brief.get("gost_whitelist", [])
                               if isinstance(g, str) and g.lower() in norm]
    brief["keywords"] = [k.strip() for k in brief.get("keywords", []) if isinstance(k, str)][:7]
    return brief


def run(client: llm.LLMClient, cfg: dict, shortlist: list[dict], posts: list[dict],
        gost_whitelist: list[str], internal_links: list[str], tone: str,
        instructions: str, banned_rx: re.Pattern[str]) -> dict:
    if not shortlist:
        raise BriefInvalid("empty shortlist — nothing to brief")
    messages = build_prompt(shortlist, posts, gost_whitelist, internal_links, tone, instructions)
    raw = client.chat(cfg["editor"]["model"], messages,
                      max_tokens=cfg["editor"]["max_tokens"],
                      temperature=cfg["editor"]["temperature"])
    brief = llm.extract_json(raw)
    brief = sanitize(brief, internal_links, gost_whitelist, {p["slug"] for p in posts})
    errors = validate(brief, load_schema())
    if errors:
        raise BriefInvalid("; ".join(errors[:6]))
    blob = json.dumps(brief, ensure_ascii=False)
    if banned_rx.search(blob):
        raise BriefInvalid("banned_product_mention in brief")
    return brief
