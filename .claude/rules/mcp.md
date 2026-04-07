---
paths: ["**"]
---

# MCP Tools

Always check MCP before asking the user or guessing.

## Code & repos
- **Git / GitHub** — commits, branches, diffs, PR context
- Inspect only relevant files/dirs
- Use Git for history, blame, diff
- Do NOT ask user to paste files reachable via MCP

## Databases & analytics
- **PostgreSQL (Supabase)** — schema, queries, migrations
- Always introspect schemas via MCP before designing
- Never assume table/column names — read via MCP

## CI/CD & infrastructure
- **GitHub Actions** — CI pipeline (lint, typecheck, test, build): `.github/workflows/ci.yml`
- **Vercel** — deployments, build logs, project config
- Inspect pipeline status and logs before proposing fixes
- Edit CI configs based on real failures, not assumptions

## Nginx + Vercel proxy (CRITICAL)
- Архитектура: `diplox.online → Nginx VDS → Vercel (ai-sformat.vercel.app)`
- Nginx передаёт `Host: ai-sformat.vercel.app` + `X-Forwarded-Host: diplox.online`
- **Два типа трафика на Vercel:** проксированный (через Nginx) и прямой (vercel.app напрямую)
- Различаем по `X-Forwarded-Host`: есть `diplox.online` = Nginx, нет/`vercel.app` = прямой доступ
- **Redirect по Host БЕЗ проверки X-Forwarded-Host** → redirect loop (Nginx→Vercel→301→Nginx→...)
- **Redirect по Host С проверкой X-Forwarded-Host** → безопасен, используется в middleware
- Прямой доступ к vercel.app ЛОМАЕТ авторизацию: cookies Supabase привязаны к diplox.online
- **Vercel автоматически ставит `X-Robots-Tag: noindex`** на non-production домены (*.vercel.app)
- Nginx ОБЯЗАН убирать этот заголовок: `proxy_hide_header X-Robots-Tag;` — иначе Google видит noindex на diplox.online
- **НЕЛЬЗЯ** использовать `X-Robots-Tag` в vercel.json — Vercel видит `Host: vercel.app` и от Nginx, заблокирует diplox.online тоже
- Защита от индексации vercel.app обеспечивается 301 redirect в middleware (Google следует редиректу)
- Перед любыми изменениями в middleware, связанными с Host/redirect — проверить Nginx конфиг через SSH
- Nginx конфиги: менять ОБА `sites-available` и `sites-enabled` (копия, не симлинк)

### Инцидент 2026-03-30: потеря конверсии из-за прямого трафика vercel.app
- После 10:30 MSK 86% трафика стало анонимным (vs 32% до) → 0 покупок за 8 часов
- Причина: пользователи заходили на ai-sformat.vercel.app напрямую, cookies не работали
- Фикс: 301 redirect в middleware (прямой vercel.app → diplox.online) + X-Robots-Tag noindex
- Урок: ВСЕГДА проверять, что vercel.app редиректит на основной домен
- Бонус-находка: Vercel ставил X-Robots-Tag: noindex, Nginx пробрасывал на diplox.online → Google не индексировал. Фикс: `proxy_hide_header X-Robots-Tag` в Nginx

## Frontend testing
- **Playwright** — e2e tests, screenshots, flow verification
- For critical UX: propose minimal Playwright smoke scenario

## UI Components
- **shadcn MCP** — search, view, install components from registry
- Always check registry before creating custom components

## Documentation
- Create/update docs for major features/architectural changes
- Final step of feature pipelines: verify docs

## Billing (Lava.top)
- Payment integration via Lava.top API
- Use only in test/sandbox until explicitly allowed for production
