# ADR-004: Formatter v2 — Unit Economics & Cost Analysis

**Date:** 2026-04-11
**Status:** Accepted
**Context:** Расширение formatter новыми AI-фичами (vision-подписи к рисункам, AI-подписи к таблицам). Нужно понять стоимость обработки документа.

## Average Document Profile

- ~300 параграфов, ~30-40 страниц (курсовая/диплом)
- ~5 таблиц, ~8 рисунков

## Token Budget Per Document

| Этап | Input tokens | Output tokens | Calls |
|------|-------------|---------------|-------|
| Block markup (2 chunks × 150 para) | 14,000 | 1,800 | 2 |
| Table captions AI (5 tables, batch) | 2,500 | 250 | 1 |
| Figure captions vision (8 images) | 7,600 | 400 | 8 |
| **Total** | **~24,100** | **~2,450** | **11** |

## Cost Per Document By Provider

| Provider | Input rate | Output rate | Cost/doc | Cost/doc ₽ |
|----------|-----------|-------------|----------|-----------|
| Gemini 2.5 Flash Lite | $0.075/1M | $0.30/1M | $0.0025 | 0.23 ₽ |
| Gemini 2.5 Flash | $0.15/1M | $0.60/1M | $0.005 | 0.45 ₽ |
| Vercel AI Gateway (same models) | Same | Same | Same | Same |
| AITUNNEL (fallback) | ~same | ~same | ~same | ~same |

## Scaling Projections

| Docs/month | Flash Lite | Flash | Via free tiers |
|------------|-----------|-------|----------------|
| 100 | 23 ₽ | 45 ₽ | 0 ₽ |
| 500 | 115 ₽ | 225 ₽ | ~0-50 ₽ |
| 1,000 | 230 ₽ | 450 ₽ | ~100-200 ₽ |
| 5,000 | 1,150 ₽ | 2,250 ₽ | paid required |

## Free Tier Capacity

- Google Gemini direct: 20 RPD → ~2 docs/day (bottleneck with 11 calls/doc)
- Vercel AI Gateway: $5/mo credit, 10K RPD → ~900 docs/day
- Cerebras (emergency fallback): free, no vision support
- AITUNNEL balance 1,150 ₽ → ~5,000 docs

## Bottleneck: RPD, Not Cost

Vision adds 8 calls per document. At 20 RPD (Gemini direct), only 2 docs/day.
Vercel Gateway (10K RPD) is the primary path — handles ~900 docs/day.

## Vercel Compute (Serverless)

- Per document: ~5-15 sec, ~0.002-0.004 GB-hours
- Hobby plan (100 GB-hours): ~25,000 docs/month capacity
- Not a bottleneck at current scale

## Decision

Vision-based captions are economically viable at any foreseeable scale.
Total cost per document with all features: **~0.2-0.5 ₽**.
Primary routing through Vercel AI Gateway for RPD headroom.

## Consequences

- Must batch table caption requests (1 call for all tables, not per-table)
- Must handle vision fallback (if image extraction fails → skip caption, don't block)
- Consider batching figure captions too (multiple images in one request) to reduce RPD pressure
- Monitor AITUNNEL balance depletion rate
