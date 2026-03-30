# ADR-001: Nginx → Vercel proxy — подводные камни

**Дата:** 2026-03-30
**Статус:** Принято
**Контекст:** Инцидент с потерей конверсии и блокировкой Google-индексации

## Проблема

Архитектура `diplox.online → Nginx → Vercel (ai-sformat.vercel.app)` создаёт два класса проблем, которые неочевидны и дорого стоят.

### Проблема 1: Vercel ставит `X-Robots-Tag: noindex` на все *.vercel.app домены

Vercel автоматически добавляет заголовок `X-Robots-Tag: noindex` к ответам на non-production домены (включая `ai-sformat.vercel.app`). Nginx по умолчанию пробрасывает все заголовки от upstream, включая этот. Результат: **Google видит `noindex` на diplox.online** и не индексирует сайт.

**Симптомы:** Google не индексирует сайт. В Google Search Console нет ошибок, страницы просто не попадают в индекс. Проблема невидима без явной проверки HTTP-заголовков.

**Фикс:** `proxy_hide_header X-Robots-Tag;` в Nginx.

**Правило:** После любых изменений Nginx-конфига проверять:
```bash
curl -sI "https://diplox.online/" | grep -i "x-robots"
# Должно быть пусто
```

### Проблема 2: Прямой доступ к vercel.app ломает авторизацию

Пользователи, попавшие на `ai-sformat.vercel.app` напрямую (через поисковую выдачу, кеш браузера, шеринг), не имеют Supabase cookies (привязаны к `diplox.online`). Все такие пользователи — анонимные, не могут платить.

**Симптомы:** Резкое падение конверсии. Джобы создаются (анонимный триал работает), но покупок нет. В данных видно по полю `referrer` в таблице `jobs`: `ai-sformat.vercel.app/create` вместо `diplox.online/create`.

**Фикс:** 301 redirect в middleware для прямого доступа к vercel.app. Детект через кастомный заголовок `X-Nginx-Proxy: 1` (Nginx ставит, прямой доступ — нет).

**Правило:** НЕ использовать `X-Forwarded-Host` для детекта — Vercel перезаписывает его.

### Проблема 3: vercel.json headers/redirects не различают proxied и direct трафик

Vercel видит `Host: ai-sformat.vercel.app` от обоих типов трафика. Любые условия в vercel.json по `host` применяются КО ВСЕМУ трафику, включая проксированный через Nginx.

**Правило:** Никогда не использовать `vercel.json` headers/redirects с условием по host для разделения proxied/direct трафика. Только middleware с проверкой `X-Nginx-Proxy`.

## Чек-лист после изменений Nginx/middleware/Vercel

```bash
# 1. diplox.online работает (нет redirect loop)
curl -sI "https://diplox.online/" | grep "HTTP/1.1 200"

# 2. Нет X-Robots-Tag на diplox.online
curl -sI "https://diplox.online/" | grep -i "x-robots"
# Должно быть пусто

# 3. Нет noindex в HTML
curl -s "https://diplox.online/" | grep -i "noindex"
# Должно быть пусто

# 4. vercel.app редиректит
curl -sI "https://ai-sformat.vercel.app/" | grep "location"
# Должно быть: location: https://diplox.online/

# 5. Nginx заголовки на месте
ssh root@85.239.38.44 'grep -E "proxy_hide_header|X-Nginx-Proxy" /etc/nginx/sites-available/diplox.online'
```

## Текущая конфигурация (2026-03-30)

**Nginx** (`/etc/nginx/sites-available/diplox.online`):
- `proxy_set_header Host ai-sformat.vercel.app;`
- `proxy_set_header X-Nginx-Proxy 1;`
- `proxy_hide_header X-Robots-Tag;`

**Middleware** (`src/middleware.ts`):
- Redirect `host.includes("vercel.app") && !isNginxProxied` → `diplox.online`

**vercel.json**: Без headers/redirects (только crons).
