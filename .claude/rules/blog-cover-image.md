# Добавление иллюстрации к статье блога

## Когда использовать
Пользователь загрузил PNG-файл в `public/blog/` и просит привязать его к статье или запушить на прод.

## Шаги

### 1. Проверить файл
```bash
ls -la public/blog/{filename}.png
file public/blog/{filename}.png
```
Убедиться: файл существует, формат PNG, размер адекватный (100KB–3MB).

### 2. Найти пост по slug или названию
```bash
grep -n '{filename}' src/lib/blog/posts-gost.ts src/lib/blog/posts-second-brain.ts
```
Если совпадений нет — искать по ключевым словам из названия файла:
```bash
grep -n 'coverImage' src/lib/blog/posts-gost.ts src/lib/blog/posts-second-brain.ts
```
Найти пост с `coverImage: undefined` — это целевой пост.

### 3. Привязать обложку
Заменить `coverImage: undefined` на `coverImage: "/blog/{filename}.png"` в соответствующем файле постов.

### 4. Коммит и пуш
```bash
git add public/blog/{filename}.png src/lib/blog/posts-*.ts
git commit -m "assets(blog): add cover image for {post-description}"
git push
```

## Важно
- Файл изображения должен лежать в `public/blog/` — только этот путь используется для обложек
- Slug файла и slug поста часто совпадают, но не всегда — проверять через grep
- Один и тот же файл может использоваться для нескольких тематически близких постов
- Если `coverImage` уже задан (не `undefined`) — уточнить у пользователя, заменять ли
- После пуша деплой на Vercel занимает ~1-2 минуты
