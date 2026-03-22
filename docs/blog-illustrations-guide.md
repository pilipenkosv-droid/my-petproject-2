# Гайд по созданию иллюстраций для блога Diplox

## Генератор
Nana Banana (или аналогичный генератор изображений).

## Единый стиль

Каждый промпт должен содержать эти обязательные параметры стиля:
- `flat illustration style`
- `soft blue and purple tones`
- `minimal clean composition`
- `no text on the image`

## Соотношение сторон

По умолчанию генератор делает квадратные изображения. Для статей блога нужен **landscape** — добавляй в конец промпта:
```
wide landscape format 16:9 aspect ratio
```

## Шаблон промпта

```
[описание сцены с конкретными деталями], flat illustration style, soft blue and purple tones, minimal clean composition, no text on the image, wide landscape format 16:9 aspect ratio
```

## Примеры

### Статья про распознавание фото
```
A student photographing a university whiteboard with their phone, the phone screen shows the photo being transformed into clean organized digital notes with formulas and diagrams, flat illustration style, soft blue and purple tones, minimal clean composition, no text on the image
```

### Статья про AI-напарника
```
A friendly robot assistant standing next to a student, both looking at a glowing phone screen together, the robot is handing the student a neatly formatted document, university campus background silhouette, flat illustration style, soft blue and purple tones, warm and approachable mood, no text on the image, wide landscape format 16:9 aspect ratio
```

### Статья про форматирование работ
```
A split-screen composition showing a messy unformatted academic paper on the left transforming into a perfectly formatted thesis on the right with proper margins headers and citations highlighted, digital transformation effect in the middle, flat illustration style, soft blue and purple tones, minimal clean composition, no text on the image, wide landscape format 16:9 aspect ratio
```

## Добавление в проект

1. Сохрани изображение в `public/blog/` с именем, совпадающим со `slug` статьи (например `ai-naparnik-telegram-bot-dlya-studentov.png`)
2. Добавь поле `coverImage` в объект статьи в `src/lib/blog/posts.ts`:
   ```ts
   coverImage: "/blog/ai-naparnik-telegram-bot-dlya-studentov.png",
   ```
