# Примеры применения Head of Product Design Copilot

## Пример 1: Дизайн аналитического дашборда

**Запрос:** "Нужно спроектировать дашборд для маркетолога с KPI, графиками и фильтрами"

**Ответ Copilot:**
```
## Контекст
Маркетолог отслеживает эффективность кампаний: CTR, конверсии, ROI. Основная задача — быстро оценить результаты и принять решения о корректировках.

## Ключевые принципы
1. Приоритет на actionable insights над raw data
2. Группировка метрик по целям кампании
3. Быстрые фильтры для сравнения периодов
4. Прогрессивное раскрытие деталей

## Структура экрана

**Header (обязательно):**
- Период: dropdown с быстрым выбором (сегодня/неделя/месяц)
- Кампания: multi-select фильтр
- Refresh button с auto-update toggle

**KPI Cards (обязательно):**
- 4 ключевые метрики в ряд (CTR, Conversions, Cost, ROI)
- Trend indicators (↑↓) с процентным изменением
- Color coding: зеленый для роста, красный для падения

**Charts Section (рекомендуется):**
- Primary chart: conversions over time (line chart)
- Secondary: channel breakdown (pie/bar)
- Click-through: drill-down to campaign details

**Table (рекомендуется):**
- Sortable columns: campaign name, spend, conversions, CTR
- Quick actions: pause/resume campaign inline
- Pagination с показом totals

**Filters Panel (рекомендуется):**
- Collapsible sidebar для advanced фильтров
- Date range picker
- Channel/type filters
- Save filter presets
```

## Пример 2: Конструктор сценариев

**Запрос:** "Пользователи жалуются, что конструктор сценариев слишком сложный"

**Ответ Copilot:**
```
## Проблема
Текущий конструктор перегружен опциями, высокий cognitive load, низкая конверсия завершения сценариев.

## UX-анализ
- 15+ настроек на одном экране = cognitive overload
- Нет guidance для новичков
- Сложно понять результат до применения

## Решение: Progressive disclosure + Templates

**1. Шаблоны (must-have):**
- Preset сценарии: "Welcome series", "Re-engagement", "Upsell"
- "Start from template" как primary CTA
- Custom creation как secondary

**2. Wizard flow (must-have):**
- Step 1: Choose trigger (time-based, event-based, segment)
- Step 2: Define conditions (simple rules builder)
- Step 3: Set actions (email, SMS, push)
- Step 4: Review & test

**3. Visual preview (рекомендуется):**
- Live preview сценария как flowchart
- "What happens next?" tooltips
- Test mode с sample data

**4. Simplify advanced options (рекомендуется):**
- Basic mode: 80% use cases с 3 настройками
- Advanced mode: toggle для power users
- Context help: "?" icons с примерами
```

## Пример 3: Дизайн-система компонента

**Запрос:** "Нужен компонент для фильтров в таблицах"

**Ответ Copilot:**
```
Component: DataTableFilters

**Цель:** Масштабируемый фильтр для табличных данных с поддержкой разных типов фильтров

**Props:**
- filters: FilterConfig[]
- onChange: (filters: FilterValue[]) => void
- layout: 'inline' | 'stacked' | 'sidebar'
- collapsible?: boolean
- savePresets?: boolean

**FilterConfig:**
```typescript
interface FilterConfig {
  id: string
  label: string
  type: 'text' | 'select' | 'date' | 'range' | 'multiselect'
  options?: string[] // для select/multiselect
  placeholder?: string
  defaultValue?: any
}
```

**States:**
- Loading: skeleton placeholders
- Applied: badge с количеством активных фильтров
- Error: validation messages

**UX-паттерны:**
- Auto-apply для быстрых фильтров (<500ms debounce)
- "Clear all" button когда >2 фильтров
- Saved filter presets для частых комбинаций
- Mobile: collapsible в bottom sheet

**Accessibility:**
- ARIA labels для screen readers
- Keyboard navigation (Tab через фильтры)
- Focus management при открытии/закрытии
```

## Пример 4: Упрощение перегруженного интерфейса

**Запрос:** "Экран настроек имеет слишком много опций, пользователи путаются"

**Ответ Copilot:**
```
## Диагноз
15+ настроек без группировки = cognitive overload. Нет понимания приоритетов.

## Решение: Information architecture + Progressive disclosure

**1. Группировка (must-have):**
- Основные: 3–5 ключевых настроек всегда видимы
- Дополнительные: accordion sections
- Advanced: отдельная вкладка "Экспертные настройки"

**2. Visual hierarchy (must-have):**
- Primary actions: buttons, жирный текст
- Secondary: muted styling
- Help: "?" icons с context tooltips

**3. Defaults & guidance (рекомендуется):**
- Smart defaults на основе user segment
- "Recommended" badges для best practices
- Warning messages для risky настроек

**4. Search & shortcuts (рекомендуется):**
- Search bar для быстрого нахождения опций
- Keyboard shortcuts для power users
- Recent changes highlighting
```

## Пример 5: Пользовательский флоу онбординга

**Запрос:** "Новый пользователь не понимает, с чего начать в продукте"

**Ответ Copilot:**
```
## User journey mapping
- **New user goal:** "Быстро запустить первую кампанию"
- **Current blocker:** Empty dashboard без guidance
- **Success metric:** First campaign created within 5 minutes

## Решение: Guided onboarding flow

**1. Welcome screen (must-have):**
- Clear value prop: "Запустите email-кампанию за 3 шага"
- Primary CTA: "Создать первую кампанию"
- Progress indicator: "Шаг 1 из 3"

**2. Campaign wizard (must-have):**
- Step 1: "Выберите аудиторию" (pre-filled segments)
- Step 2: "Создайте контент" (templates provided)
- Step 3: "Запланируйте отправку" (smart scheduling)

**3. Progressive complexity (рекомендуется):**
- Basic flow: 3 шага для 80% users
- Advanced options: expandable sections
- Skip options: "Я знаю, что делаю"

**4. Success feedback (рекомендуется):**
- Celebration animation при завершении
- "Что дальше?" suggestions
- Quick access к созданной кампании
```
