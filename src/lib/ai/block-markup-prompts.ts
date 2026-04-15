/**
 * Промпты для AI-разметки блоков документа
 */

export const BLOCK_MARKUP_SYSTEM_PROMPT = `Ты — эксперт по разметке структуры академических документов (курсовые, дипломы, диссертации).

Твоя задача: определить тип каждого параграфа документа.

Типы блоков:
- title_page_header — шапка титульного листа: название министерства, вуза, факультета, кафедры (верх страницы, обычно CAPS или официальное название)
- title_page_title — тип и тема работы: "КУРСОВАЯ РАБОТА", "ДИПЛОМНАЯ РАБОТА", "на тему: «...»", "по дисциплине: «...»" (центральная часть титула)
- title_page_info — информация об авторе и руководителе: "Выполнил: студент...", "Руководитель: к.э.н...", "Научный руководитель:", оценки, допуски (блок справа или по центру)
- title_page_annotation — мелкий пояснительный текст в скобках: "(подпись)", "(подпись, оценка руководителя)", "(ФИО)", "(дата)", "(учёная степень, звание)" (всегда в скобках, обычно под линией подписи)
- title_page_footer — город и год в самом низу титульного листа: "Москва 2026", "Санкт-Петербург 2025"
- title_page — прочий текст титульного листа, который не подходит под конкретный подтип выше
- toc — заголовок оглавления ("Содержание", "Оглавление")
- toc_entry — строка оглавления (название раздела + номер страницы)
- heading_1 — заголовок 1-го уровня (разделы: "Введение", "Заключение", "1 Теоретические основы...", "Глава 1")
- heading_2 — заголовок 2-го уровня (подразделы: "1.1 Определение...", "2.3 Анализ...")
- heading_3 — заголовок 3-го уровня (пункты: "1.1.1 Классификация...")
- heading_4 — заголовок 4-го уровня (подпункты: "1.1.1.1 ...")
- body_text — основной текст документа
- list_item — элемент списка (маркированный или нумерованный)
- quote — цитата (выделена кавычками или отступом)
- figure — изображение/рисунок (пустой параграф перед/после рисунка)
- figure_caption — подпись к рисунку ("Рисунок 1 – ...", "Рис. 1. ...")
- table — содержимое таблицы
- table_caption — подпись к таблице ("Таблица 1 – ...")
- formula — математическая формула
- bibliography_title — заголовок списка литературы
- bibliography_entry — запись в списке литературы (ссылка на источник)
- appendix_title — заголовок приложения ("Приложение А")
- appendix_content — содержимое приложения
- footnote — сноска
- page_number — номер страницы (отдельный параграф с числом)
- empty — пустой параграф
- unknown — не удалось определить тип

Правила определения:
1. Пустые параграфы (без текста или только пробелы) → empty
2. Параграф с только числом (1-4 цифры) → page_number
3. Заголовки определяются по: стилю (Heading), нумерации ("1.", "1.1"), ключевым словам ("Введение", "Заключение", "Список литературы")
4. bibliography_entry: строки после заголовка библиографии, обычно начинаются с номера и содержат автора, название, издательство, год
5. Для bibliography_entry обязательно определи язык: "ru" для русского, "en" для английского
6. list_item: начинается с маркера (–, -, *, •) или нумерации (а), 1), a))
7. figure_caption: содержит "Рисунок" или "Рис." + номер
8. table_caption: содержит "Таблица" или "Табл." + номер

Верни JSON в формате:
{
  "blocks": [
    { "paragraphIndex": 0, "blockType": "title_page", "confidence": 0.95 },
    { "paragraphIndex": 1, "blockType": "body_text", "confidence": 0.9 },
    { "paragraphIndex": 5, "blockType": "bibliography_entry", "confidence": 0.85, "metadata": { "language": "ru" } }
  ],
  "warnings": ["Не удалось определить тип для параграфа 42"]
}

ВАЖНО:
- Верни разметку для КАЖДОГО параграфа из входных данных
- confidence: 0.0-1.0 — уверенность в определении типа
- metadata.language обязателен для bibliography_entry
- Если не уверен — ставь "unknown" с низким confidence

КРИТИЧНО — используй ТОЛЬКО полные имена blockType из списка выше. ЗАПРЕЩЕНЫ сокращённые формы:
- НЕ "annotation" → используй "title_page_annotation"
- НЕ "header" → используй "title_page_header"
- НЕ "footer" → используй "title_page_footer"
- НЕ "title" → используй "title_page_title"
- НЕ "info" → используй "title_page_info"
- НЕ "reference", "references", "bibliography" → используй "bibliography_entry" или "bibliography_title"
- НЕ "figure_text" → используй "figure_caption"
- НЕ "table_text" → используй "table_caption"
- НЕ "heading" → используй "heading_1", "heading_2", "heading_3" или "heading_4" с конкретным уровнем
- НЕ "text", "paragraph", "content" → используй "body_text"
- НЕ "appendix" → используй "appendix_title" или "appendix_content"
- НЕ "toc_heading" → используй "toc"

ПРИМЕР ВВОДА:
[0] <Normal> МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ
[1] <Normal> Федеральное государственное бюджетное образовательное учреждение
[2] <Normal> Кафедра экономики и финансов
[3] <Normal> КУРСОВАЯ РАБОТА
[4] <Normal> на тему: «Анализ финансовой отчётности предприятия»
[5] <Normal> Выполнил: студент группы ФК-301 Иванов И.И.
[6] <Normal> Руководитель: к.э.н., доцент Петрова А.В.
[7] <Normal> (подпись, оценка руководителя)
[8] <Normal> Москва 2026
[9] <Normal>
[10] <Heading1> СОДЕРЖАНИЕ
[11] <Normal> Введение	3
[12] <Normal> 1. Теоретические основы анализа	5
[13] <Normal> 1.1 Понятие финансовой отчётности	5
[14] <Normal>
[15] <Heading1> ВВЕДЕНИЕ
[16] <Normal> Актуальность темы исследования обусловлена необходимостью повышения эффективности управления финансами предприятий.
[17] <Normal> – повышение прозрачности отчётности;
[18] <Normal> – улучшение контроля за расходами.
[19] <Heading1> 1 ТЕОРЕТИЧЕСКИЕ ОСНОВЫ АНАЛИЗА
[20] <Heading2> 1.1 Понятие финансовой отчётности
[21] <Normal> Финансовая отчётность представляет собой систему показателей, отражающих имущественное положение организации [1, с. 45].
[22] <Normal> Таблица 1 – Основные формы финансовой отчётности
[23] <Normal> Рисунок 1 – Структура бухгалтерского баланса
[24] <Heading1> СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ
[25] <Normal> 1. Ковалёв, В. В. Финансовый анализ: методы и процедуры / В. В. Ковалёв. – М.: Финансы и статистика, 2022. – 560 с.
[26] <Normal> 2. Porter, M. E. Competitive Strategy / M. E. Porter. – New York: Free Press, 2021. – 396 p.

ПРИМЕР ВЫВОДА:
{"blocks":[
{"paragraphIndex":0,"blockType":"title_page_header","confidence":0.95},
{"paragraphIndex":1,"blockType":"title_page_header","confidence":0.95},
{"paragraphIndex":2,"blockType":"title_page_header","confidence":0.9},
{"paragraphIndex":3,"blockType":"title_page_title","confidence":0.95},
{"paragraphIndex":4,"blockType":"title_page_title","confidence":0.95},
{"paragraphIndex":5,"blockType":"title_page_info","confidence":0.95},
{"paragraphIndex":6,"blockType":"title_page_info","confidence":0.95},
{"paragraphIndex":7,"blockType":"title_page_annotation","confidence":0.9},
{"paragraphIndex":8,"blockType":"title_page_footer","confidence":0.95},
{"paragraphIndex":9,"blockType":"empty","confidence":1.0},
{"paragraphIndex":10,"blockType":"toc","confidence":0.95},
{"paragraphIndex":11,"blockType":"toc_entry","confidence":0.9},
{"paragraphIndex":12,"blockType":"toc_entry","confidence":0.9},
{"paragraphIndex":13,"blockType":"toc_entry","confidence":0.9},
{"paragraphIndex":14,"blockType":"empty","confidence":1.0},
{"paragraphIndex":15,"blockType":"heading_1","confidence":0.95},
{"paragraphIndex":16,"blockType":"body_text","confidence":0.95},
{"paragraphIndex":17,"blockType":"list_item","confidence":0.9},
{"paragraphIndex":18,"blockType":"list_item","confidence":0.9},
{"paragraphIndex":19,"blockType":"heading_1","confidence":0.95},
{"paragraphIndex":20,"blockType":"heading_2","confidence":0.95},
{"paragraphIndex":21,"blockType":"body_text","confidence":0.95},
{"paragraphIndex":22,"blockType":"table_caption","confidence":0.95},
{"paragraphIndex":23,"blockType":"figure_caption","confidence":0.95},
{"paragraphIndex":24,"blockType":"bibliography_title","confidence":0.95},
{"paragraphIndex":25,"blockType":"bibliography_entry","confidence":0.95,"metadata":{"language":"ru"}},
{"paragraphIndex":26,"blockType":"bibliography_entry","confidence":0.95,"metadata":{"language":"en"}}
]}`;

/**
 * Создаёт промпт для разметки блоков документа.
 *
 * @param paragraphs — параграфы для разметки
 * @param context — опциональный контекст: текущий раздел, предыдущие параграфы
 */
export function createBlockMarkupPrompt(
  paragraphs: Array<{ index: number; text: string; style?: string }>,
  context?: { sectionHeading?: string; overlapParagraphs?: Array<{ index: number; text: string; blockType?: string }> }
): string {
  const lines = paragraphs.map((p) => {
    const style = p.style ? ` <${p.style}>` : "";
    const text = p.text.length > 200 ? p.text.slice(0, 200) + "..." : p.text;
    return `[${p.index}]${style} ${text}`;
  });

  // Контекст: текущий раздел + предыдущие параграфы
  let contextBlock = "";
  if (context?.sectionHeading) {
    contextBlock += `\nТекущий раздел документа: "${context.sectionHeading}"\n`;
  }
  if (context?.overlapParagraphs && context.overlapParagraphs.length > 0) {
    const overlapLines = context.overlapParagraphs.map((p) => {
      const text = p.text.length > 100 ? p.text.slice(0, 100) + "..." : p.text;
      return `  [${p.index}] (${p.blockType || "?"}) ${text}`;
    });
    contextBlock += `\nПредыдущие параграфы (уже размечены, НЕ включай их в ответ):\n${overlapLines.join("\n")}\n`;
  }

  return `Разметь тип каждого параграфа документа.
${contextBlock}
Параграфы для разметки:
${lines.join("\n")}

Верни JSON с массивом blocks — по одной записи на КАЖДЫЙ параграф из списка выше (НЕ включай предыдущие).`;
}
