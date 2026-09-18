"""Stage 3 — writer: one LLM call that turns the brief into an article."""

from __future__ import annotations

import json
import logging
import re

import llm

log = logging.getLogger("blog.writer")

SLUG_RE = re.compile(r"[^a-z0-9-]+")
# deepseek-style models put chain-of-thought into the same token budget
NO_REASONING = ("Отвечай сразу итоговым JSON. Не пиши рассуждений, плана и "
                "пояснений ни до, ни после JSON. Первый символ ответа — «{».")


def build_messages(brief: dict, tone: str, instructions: str,
                   feedback: list[str] | None = None) -> list[dict]:
    user = "Бриф:\n\n" + json.dumps(brief, ensure_ascii=False, indent=1)
    if feedback:
        user += ("\n\nПредыдущая версия не прошла проверки. Исправь и перепиши "
                 "статью целиком:\n- " + "\n- ".join(feedback))
    return [
        {"role": "system", "content": f"{instructions}\n\n{tone}\n\n{NO_REASONING}"},
        {"role": "user", "content": user},
    ]


def normalize_slug(value: str, fallback: str) -> str:
    slug = SLUG_RE.sub("-", (value or "").strip().lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:200] or fallback


def reading_time(text: str, wpm: int = 200) -> str:
    words = max(len(text.split()), 1)
    return f"{max(1, round(words / wpm))} мин"


def run(client: llm.LLMClient, cfg: dict, brief: dict, tone: str, instructions: str,
        feedback: list[str] | None = None) -> dict:
    model = cfg["writer"]["model"]
    max_tokens = cfg["writer"]["max_tokens"]
    if "deepseek" in model and max_tokens < 6000:
        log.warning("raising max_tokens to 6000 for %s (reasoning eats the budget)", model)
        max_tokens = 6000
    raw = client.chat(model, build_messages(brief, tone, instructions, feedback),
                      max_tokens=max_tokens, temperature=cfg["writer"]["temperature"])
    art = llm.extract_json(raw)
    art["title"] = (art.get("title") or brief["topic"]).strip()
    art["slug"] = normalize_slug(art.get("slug", ""), fallback="gost-article")
    art["description"] = (art.get("description") or "").strip()
    art["content_markdown"] = (art.get("content_markdown") or "").strip()
    kw = art.get("keywords") or brief["keywords"]
    art["keywords"] = [k.strip() for k in kw if isinstance(k, str) and k.strip()]
    art["reading_time"] = reading_time(art["content_markdown"])
    art["model"] = model
    return art
