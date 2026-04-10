/**
 * Промпты для AI-разметки блоков документа
 */

export const BLOCK_MARKUP_SYSTEM_PROMPT = `Ты — эксперт по разметке структуры академических документов (курсовые, дипломы, диссертации).

Твоя задача: определить тип каждого параграфа документа.

Типы блоков:
- title_page — текст титульного листа (название вуза, кафедра, тема работы, автор, руководитель, город, год)
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

ПРИМЕР ВВОДА:
[0] <Normal> МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ
[1] <Normal> Федеральное государственное бюджетное образовательное учреждение
[2] <Normal> КУРСОВАЯ РАБОТА
[3] <Normal> на тему: «Анализ финансовой отчётности предприятия»
[4] <Normal> Выполнил: студент группы ФК-301 Иванов И.И.
[5] <Normal> Москва 2026
[6] <Normal>
[7] <Heading1> СОДЕРЖАНИЕ
[8] <Normal> Введение	3
[9] <Normal> 1. Теоретические основы анализа	5
[10] <Normal> 1.1 Понятие финансовой отчётности	5
[11] <Normal>
[12] <Heading1> ВВЕДЕНИЕ
[13] <Normal> Актуальность темы исследования обусловлена необходимостью повышения эффективности управления финансами предприятий.
[14] <Normal> – повышение прозрачности отчётности;
[15] <Normal> – улучшение контроля за расходами.
[16] <Heading1> 1 ТЕОРЕТИЧЕСКИЕ ОСНОВЫ АНАЛИЗА
[17] <Heading2> 1.1 Понятие финансовой отчётности
[18] <Normal> Финансовая отчётность представляет собой систему показателей, отражающих имущественное положение организации [1, с. 45].
[19] <Normal> Таблица 1 – Основные формы финансовой отчётности
[20] <Normal> Рисунок 1 – Структура бухгалтерского баланса
[21] <Heading1> СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ
[22] <Normal> 1. Ковалёв, В. В. Финансовый анализ: методы и процедуры / В. В. Ковалёв. – М.: Финансы и статистика, 2022. – 560 с.
[23] <Normal> 2. Porter, M. E. Competitive Strategy / M. E. Porter. – New York: Free Press, 2021. – 396 p.

ПРИМЕР ВЫВОДА:
{"blocks":[
{"paragraphIndex":0,"blockType":"title_page","confidence":0.95},
{"paragraphIndex":1,"blockType":"title_page","confidence":0.95},
{"paragraphIndex":2,"blockType":"title_page","confidence":0.95},
{"paragraphIndex":3,"blockType":"title_page","confidence":0.95},
{"paragraphIndex":4,"blockType":"title_page","confidence":0.95},
{"paragraphIndex":5,"blockType":"title_page","confidence":0.9},
{"paragraphIndex":6,"blockType":"empty","confidence":1.0},
{"paragraphIndex":7,"blockType":"toc","confidence":0.95},
{"paragraphIndex":8,"blockType":"toc_entry","confidence":0.9},
{"paragraphIndex":9,"blockType":"toc_entry","confidence":0.9},
{"paragraphIndex":10,"blockType":"toc_entry","confidence":0.9},
{"paragraphIndex":11,"blockType":"empty","confidence":1.0},
{"paragraphIndex":12,"blockType":"heading_1","confidence":0.95},
{"paragraphIndex":13,"blockType":"body_text","confidence":0.95},
{"paragraphIndex":14,"blockType":"list_item","confidence":0.9},
{"paragraphIndex":15,"blockType":"list_item","confidence":0.9},
{"paragraphIndex":16,"blockType":"heading_1","confidence":0.95},
{"paragraphIndex":17,"blockType":"heading_2","confidence":0.95},
{"paragraphIndex":18,"blockType":"body_text","confidence":0.95},
{"paragraphIndex":19,"blockType":"table_caption","confidence":0.95},
{"paragraphIndex":20,"blockType":"figure_caption","confidence":0.95},
{"paragraphIndex":21,"blockType":"bibliography_title","confidence":0.95},
{"paragraphIndex":22,"blockType":"bibliography_entry","confidence":0.95,"metadata":{"language":"ru"}},
{"paragraphIndex":23,"blockType":"bibliography_entry","confidence":0.95,"metadata":{"language":"en"}}
]}`;

/**
 * Создаёт промпт для разметки блоков документа
 */
export function createBlockMarkupPrompt(
  paragraphs: Array<{ index: number; text: string; style?: string }>
): string {
  const lines = paragraphs.map((p) => {
    const style = p.style ? ` <${p.style}>` : "";
    const text = p.text.length > 200 ? p.text.slice(0, 200) + "..." : p.text;
    return `[${p.index}]${style} ${text}`;
  });

  return `Разметь тип каждого параграфа документа.

Параграфы:
${lines.join("\n")}

Верни JSON с массивом blocks — по одной записи на каждый параграф.`;
}
