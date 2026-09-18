"""TF-IDF cosine similarity over short Russian texts (titles + keywords).

Pure stdlib. ~200 documents, so a dense dict-based implementation is fine.
`embed_hook` is the seam for real embeddings later (ADR-015: voyage via AI
Gateway) — pass a callable that maps texts to vectors and the same cosine
math is reused.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Callable, Iterable, Sequence

WORD_RE = re.compile(r"[а-яёa-z0-9]+", re.IGNORECASE)
_STOP = {
    "и", "в", "на", "по", "для", "с", "как", "не", "что", "the", "a", "of",
    "к", "от", "из", "или", "это", "все", "за", "о", "у", "то", "же",
}


def tokenize(text: str) -> list[str]:
    words = [w.lower() for w in WORD_RE.findall(text or "")]
    # crude Russian stemming: strip common inflections, keep the stem >= 4 chars
    out = []
    for w in words:
        if w in _STOP or len(w) < 3:
            continue
        for suf in ("ами", "ями", "ого", "ему", "ой", "ые", "ая", "ую", "ом",
                    "ах", "ов", "ий", "ый", "ое", "ей", "ам", "ы", "и", "а", "е", "у"):
            if len(w) - len(suf) >= 4 and w.endswith(suf):
                w = w[: -len(suf)]
                break
        out.append(w)
    return out


def cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    small, big = (a, b) if len(a) < len(b) else (b, a)
    dot = sum(v * big.get(k, 0.0) for k, v in small.items())
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


class TfidfIndex:
    """Fit on a corpus, then score any query text against it."""

    def __init__(self, docs: Sequence[str], ids: Sequence[str] | None = None,
                 embed_hook: Callable[[Iterable[str]], list[dict[str, float]]] | None = None):
        self.ids = list(ids) if ids is not None else [str(i) for i in range(len(docs))]
        self.embed_hook = embed_hook
        self.tokens = [tokenize(d) for d in docs]
        n = max(len(self.tokens), 1)
        df: Counter[str] = Counter()
        for toks in self.tokens:
            df.update(set(toks))
        self.idf = {t: math.log((n + 1) / (c + 1)) + 1.0 for t, c in df.items()}
        self.vectors = [self._vector(toks) for toks in self.tokens]

    def _vector(self, toks: list[str]) -> dict[str, float]:
        if not toks:
            return {}
        tf = Counter(toks)
        total = len(toks)
        return {t: (c / total) * self.idf.get(t, 1.0) for t, c in tf.items()}

    def vector_for(self, text: str) -> dict[str, float]:
        return self._vector(tokenize(text))

    def similarities(self, text: str) -> list[tuple[str, float]]:
        q = self.vector_for(text)
        return [(self.ids[i], cosine(q, v)) for i, v in enumerate(self.vectors)]

    def max_similarity(self, text: str) -> tuple[str | None, float]:
        sims = self.similarities(text)
        if not sims:
            return None, 0.0
        return max(sims, key=lambda p: p[1])


def post_document(post: dict) -> str:
    kw = post.get("keywords") or []
    if isinstance(kw, str):
        kw = [kw]
    return " ".join([post.get("title", ""), " ".join(kw), post.get("description", "")])
