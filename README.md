# SmartFormatter

Веб-сервис автоматического форматирования научных работ по требованиям заказчика.

## Возможности

- Загрузка исходного документа (.docx) и требований к оформлению (.docx, .pdf, .txt)
- AI-анализ требований и извлечение правил форматирования
- Проверка документа на соответствие требованиям
- Автоматическое исправление форматирования
- Выделение нарушений (красным) и исправлений (зелёным)
- Статистика документа и список нарушений

## Технологии

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4
- **UI**: shadcn/ui, Radix UI
- **AI**: Google Gemini (бесплатный) / OpenAI GPT-4o / Anthropic Claude
- **Документы**: mammoth (чтение), docx (создание), pdf-parse (PDF)

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка окружения

Скопируйте `.env.example` в `.env.local` и добавьте API-ключ:

```bash
cp .env.example .env.local
```

#### Рекомендуется: Google Gemini (бесплатный)

1. Откройте [aistudio.google.com](https://aistudio.google.com/)
2. Войдите с Google аккаунтом
3. Нажмите "Get API key" → "Create API key"
4. Скопируйте ключ в `.env.local`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=ваш_ключ_здесь
```

#### Альтернативы (платные)

```env
# OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Запуск в режиме разработки

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

### 4. Сборка для production

```bash
npm run build
npm run start
```

## Структура проекта

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Landing page
│   ├── constructor/       # Страница загрузки документов
│   ├── result/[jobId]/    # Страница результатов
│   └── api/               # API routes
├── features/              # Фичи (Feature-based architecture)
│   ├── constructor/       # Компоненты загрузки
│   └── result/            # Компоненты результатов
├── lib/                   # Бизнес-логика
│   ├── ai/                # AI-провайдер и промпты
│   ├── documents/         # Чтение документов
│   ├── pipeline/          # Анализ и форматирование
│   └── storage/           # Хранение файлов
├── components/ui/         # UI-компоненты (shadcn)
└── types/                 # TypeScript типы
```

## API

### POST /api/process

Загрузка и обработка документов.

**Request**: FormData
- `sourceDocument` — исходный документ (.docx)
- `requirementsDocument` — требования к оформлению (.docx, .pdf, .txt)

**Response**:
```json
{
  "jobId": "abc123",
  "status": "completed",
  "statistics": {
    "totalCharacters": 50000,
    "pageCount": 25
  },
  "violationsCount": 42
}
```

### GET /api/status/[jobId]

Получение статуса задачи.

### GET /api/download/[fileId]

Скачивание результата. `fileId` в формате `{jobId}_original` или `{jobId}_formatted`.

## Правила форматирования

Система поддерживает проверку:
- Размеры полей документа
- Шрифт и размер текста
- Межстрочный интервал
- Абзацный отступ
- Выравнивание текста
- Неразрывные пробелы перед единицами измерения
- И другие параметры

По умолчанию используются требования ГОСТ (Times New Roman 14pt, интервал 1.5, поля 20-30 мм).

## Деплой на Vercel

1. Подключите репозиторий к Vercel
2. Добавьте переменные окружения в настройках проекта:
   - `AI_PROVIDER` = `gemini` (или `openai` / `anthropic`)
   - `GEMINI_API_KEY` (или `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`)
3. Деплой произойдёт автоматически

**Важно**: На Vercel файлы хранятся в `/tmp` (эфемерное хранилище). Для персистентного хранения интегрируйте Vercel Blob или внешнее S3-хранилище.

## Лицензия

MIT
