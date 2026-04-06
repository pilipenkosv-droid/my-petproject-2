---
paths: ["src/app/**", "public/robots.txt", "src/lib/blog/**"]
---

# SEO & Indexing Rules

Индексация — основной источник трафика. Каждое изменение, влияющее на видимость в поисковиках, критично.

## При создании новой страницы (route)

Каждая новая публичная страница ОБЯЗАНА иметь:

1. **metadata с canonical URL** — через `generatePageMetadata({ path: "/new-page" })` или вручную в `alternates.canonical`
2. **Запись в sitemap** — добавить URL в соответствующий массив в `src/app/sitemap.ts`:
   - `mainPages` — основные страницы продукта
   - `workTypePages` — лендинги по типам работ (/diplom, /kursovaya, ...)
   - `toolPages` — страницы инструментов (/grammar, /rewrite, ...)
   - `secondBrainPage` — страницы бота
   - Блог добавляется автоматически через `getAllPosts()`
3. **robots.txt** — убедиться, что путь не подпадает под Disallow (проверить `public/robots.txt`)

## При добавлении статьи в блог

1. Добавить пост в `src/lib/blog/posts-*.ts` с обязательными полями: `slug`, `datePublished`, `dateModified`
2. **Sitemap обновится автоматически** — `getAllPosts()` подтягивает все посты
3. **Canonical** — `generatePageMetadata()` в `src/app/blog/[slug]/page.tsx` делает это автоматически
4. После деплоя — запросить индексацию нового поста в GSC URL Inspection (первые 1-2 недели для нового домена)

## Чеклист перед деплоем (SEO-critical changes)

- [ ] Новая страница есть в `sitemap.ts`
- [ ] Canonical URL настроен (проверить: `curl -s https://diplox.online/new-page | grep canonical`)
- [ ] Страница отдаёт `<meta name="robots" content="index, follow">`
- [ ] OpenGraph теги заполнены (title, description, url)
- [ ] Страница НЕ в Disallow в robots.txt

## Чего НЕЛЬЗЯ делать

- Добавлять нестандартные директивы в robots.txt (LLMs-Txt, кастомные поля) — Google парсит strict и кидает ошибки
- Использовать `X-Robots-Tag` в vercel.json — Vercel видит Host: vercel.app и для проксированного трафика тоже, заблокирует diplox.online
- Ставить `noindex` на страницы "временно" — Google кэширует и ревалидация занимает недели
- Менять URL страницы без 301 redirect со старого на новый

## Мониторинг

- Проверять GSC еженедельно по воскресеньям
- Отслеживать: indexed count, crawl stats, ошибки Coverage
- При добавлении 5+ страниц за раз — перезагрузить sitemap в GSC вручную
