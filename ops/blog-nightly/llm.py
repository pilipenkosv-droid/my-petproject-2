"""Minimal OpenAI-compatible chat client (stdlib only).

Used against Crominm (`CROMINM_BASE_URL` / `CROMINM_API_KEY`), but any
OpenAI-compatible endpoint works. Counts tokens and cost, enforces a hard
per-run call cap so a bug cannot burn budget.
"""

from __future__ import annotations

import json
import logging
import random
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

log = logging.getLogger("blog.llm")

RETRY_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


class LLMError(RuntimeError):
    pass


class CallCapExceeded(LLMError):
    pass


@dataclass
class Usage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def cost_usd(self, price_per_mtok: float) -> float:
        return self.total_tokens / 1_000_000 * price_per_mtok


def _default_transport(url: str, payload: dict, headers: dict, timeout: float) -> tuple[int, str]:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        raise TimeoutError(str(e.reason)) from e


@dataclass
class LLMClient:
    base_url: str
    api_key: str
    max_calls: int = 3
    price_per_mtok: float = 1.0
    timeout: float = 180.0
    max_retries: int = 3
    transport: object = _default_transport
    sleep: object = time.sleep
    usage: Usage = field(default_factory=Usage)

    def chat(self, model: str, messages: list[dict], *, max_tokens: int = 4000,
             temperature: float = 0.7, response_format: dict | None = None) -> str:
        if self.usage.calls >= self.max_calls:
            raise CallCapExceeded(f"max_llm_calls_per_run={self.max_calls} reached")
        payload: dict = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format
        url = self.base_url.rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        self.usage.calls += 1
        last_err = "unknown"
        for attempt in range(self.max_retries):
            try:
                status, body = self.transport(url, payload, headers, self.timeout)
            except TimeoutError as e:
                status, body = 0, f"timeout: {e}"
            if status == 200:
                return self._parse(body)
            last_err = f"status={status} body={body[:300]}"
            if status not in RETRY_STATUS and status != 0:
                raise LLMError(f"llm call failed: {last_err}")
            if attempt < self.max_retries - 1:
                delay = (2 ** attempt) * 2 + random.random()
                log.warning("llm retry %s/%s in %.1fs (%s)", attempt + 1,
                            self.max_retries, delay, last_err)
                self.sleep(delay)
        raise LLMError(f"llm call failed after {self.max_retries} attempts: {last_err}")

    def _parse(self, body: str) -> str:
        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            raise LLMError(f"bad json from provider: {e}") from e
        usage = data.get("usage") or {}
        self.usage.prompt_tokens += int(usage.get("prompt_tokens") or 0)
        self.usage.completion_tokens += int(usage.get("completion_tokens") or 0)
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError) as e:
            raise LLMError(f"no content in response: {body[:300]}") from e


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model answer (handles ```json fences)."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t[: t.rindex("```")]
        t = t.strip()
        if t.startswith("json"):
            t = t[4:].strip()
    start = t.find("{")
    if start == -1:
        raise LLMError("no JSON object in model answer")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(t)):
        ch = t[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(t[start : i + 1])
    raise LLMError("unbalanced JSON in model answer")
