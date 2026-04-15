/**
 * Rule-based классификация и валидация блоков документа.
 *
 * Детерминистические правила для параграфов, которые НЕ требуют AI:
 * empty, page_number, heading по стилю, figure/table caption, list_item, секционные заголовки.
 *
 * Sequence validation: контекстная проверка последовательности блоков
 * (bibliography без title, isolated toc_entry, unknown между одинаковыми типами).
 */

import type { BlockType, BlockMarkupItem } from "./block-markup-schemas";

/** Маппинг частых AI-галлюцинаций → валидные blockType.
 * Предотвращает Zod-ошибку на весь чанк из-за одного невалидного значения. */
const HALLUCINATION_MAP: Record<string, BlockType> = {
  annotation: "title_page_annotation",
  header: "title_page_header",
  footer: "title_page_footer",
  title: "title_page_title",
  info: "title_page_info",
  reference: "bibliography_entry",
  references: "bibliography_entry",
  bibliography: "bibliography_entry",
  figure_text: "figure_caption",
  table_text: "table_caption",
  heading: "heading_1",
  text: "body_text",
  paragraph: "body_text",
  content: "body_text",
  appendix: "appendix_content",
  toc_heading: "toc",
};

/** Нормализует AI-ответ перед Zod-валидацией: исправляет невалидные blockType.
 * Safety net: после B3 (negative examples в промптах) срабатывает 0 раз на бенче,
 * но оставлен для защиты от регрессии при обновлении моделей. */
export function normalizeAiResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.blocks)) return raw;

  let fixCount = 0;

  obj.blocks = obj.blocks.map((block: unknown) => {
    if (!block || typeof block !== "object") return block;
    const b = block as Record<string, unknown>;
    const bt = b.blockType;
    if (typeof bt === "string" && bt in HALLUCINATION_MAP) {
      b.blockType = HALLUCINATION_MAP[bt];
      fixCount++;
    }
    return b;
  });

  if (fixCount > 0) {
    console.log(`[hallucination-map] Fixed ${fixCount} invalid blockType(s)`);
  }
  return raw;
}

/** Паттерны структурных границ документа */
const SECTION_BOUNDARY_RE =
  /^(?:введение|заключение|глава\s+\d|список\s+(?:использованных?\s+)?(?:источников|литературы)|библиограф|приложение\s+[а-яА-Яa-zA-Z]|содержание|оглавление|аннотация|abstract|список\s+сокращений)\s*$/i;

/** Паттерны заголовков библиографии */
const BIBLIO_TITLE_RE =
  /^список\s+(?:использованных?\s+)?(?:источников|литературы)|^библиограф/i;

/** Паттерн записи библиографии: "N. Автор..." или "N Автор..." */
const BIBLIO_ENTRY_RE = /^\d{1,3}[\.\)]\s*[А-ЯЁA-Z]/;

/** Паттерн заголовка приложения */
const APPENDIX_TITLE_RE = /^приложение\s+[а-яА-Яa-zA-Z]/i;

export interface RuleClassification {
  blockType: BlockType;
  confidence: number;
  metadata?: { language?: "ru" | "en" | "mixed"; headingLevel?: number; listLevel?: number };
}

/**
 * Детерминистическая классификация параграфа по rule-based правилам.
 * Возвращает null если параграф требует AI-классификации.
 */
export function classifyByRule(
  paragraph: { index: number; text: string; style?: string }
): RuleClassification | null {
  const text = paragraph.text.trim();
  const style = (paragraph.style || "").toLowerCase();

  // 1. Пустой параграф
  if (text === "") {
    return { blockType: "empty", confidence: 1.0 };
  }

  // 2. Только цифры 1-4 символа → page_number
  if (/^\d{1,4}$/.test(text)) {
    return { blockType: "page_number", confidence: 1.0 };
  }

  // 3. Word Heading стиль → heading_N
  if (style.startsWith("heading")) {
    const level = parseInt(style.replace(/\D/g, ""), 10);
    if (level >= 1 && level <= 4) {
      return {
        blockType: `heading_${level}` as BlockType,
        confidence: 0.98,
        metadata: { headingLevel: level },
      };
    }
  }

  // 4. "Рисунок N" / "Рис. N" → figure_caption
  if (/^Рисунок\s+\d|^Рис\.\s*\d/i.test(text)) {
    return { blockType: "figure_caption", confidence: 0.97 };
  }

  // 5. "Таблица N" / "Табл. N" → table_caption
  if (/^Таблица\s+(?:№\s*)?\d|^Табл\.\s*(?:№\s*)?\d/i.test(text)) {
    return { blockType: "table_caption", confidence: 0.97 };
  }

  // 6. Секционный заголовок (Введение, Заключение, Список литературы...)
  if (SECTION_BOUNDARY_RE.test(text)) {
    // Библиографический заголовок → bibliography_title
    if (BIBLIO_TITLE_RE.test(text)) {
      return { blockType: "bibliography_title", confidence: 0.95 };
    }
    // Приложение → appendix_title
    if (APPENDIX_TITLE_RE.test(text)) {
      return { blockType: "appendix_title", confidence: 0.95 };
    }
    return { blockType: "heading_1", confidence: 0.95, metadata: { headingLevel: 1 } };
  }

  // 7. Списочный маркер → list_item
  if (/^[–\-•*]\s/.test(text)) {
    return { blockType: "list_item", confidence: 0.9 };
  }
  if (/^[а-яa-z]\)\s|^\d+\)\s/i.test(text)) {
    return { blockType: "list_item", confidence: 0.9 };
  }

  // Не удалось определить rule-based → нужен AI
  return null;
}

export interface SequenceValidationResult {
  blocks: BlockMarkupItem[];
  fixes: string[];
}

/**
 * Контекстная валидация последовательности блоков.
 * Исправляет ошибки, которые видны только в контексте соседних блоков.
 */
export function sequenceValidateBlocks(
  blocks: BlockMarkupItem[],
  paragraphs: Array<{ index: number; text: string; style?: string }>
): SequenceValidationResult {
  const textMap = new Map(paragraphs.map((p) => [p.index, p]));
  const fixes: string[] = [];

  let inBibliography = false;
  let bibTitleSeen = false;
  let inAppendix = false;

  const fixed = blocks.map((block, i) => {
    const text = (textMap.get(block.paragraphIndex)?.text || "").trim();
    const prev = i > 0 ? blocks[i - 1] : null;
    const next = i < blocks.length - 1 ? blocks[i + 1] : null;
    let correctedType: BlockType | null = null;

    // Трекинг секций
    if (block.blockType === "bibliography_title") {
      inBibliography = true;
      bibTitleSeen = true;
    }
    if (block.blockType === "appendix_title") {
      inAppendix = true;
      inBibliography = false;
    }
    if (block.blockType === "heading_1") {
      inBibliography = false;
      inAppendix = false;
    }

    // R1: bibliography_entry без предшествующего bibliography_title → body_text
    if (block.blockType === "bibliography_entry" && !bibTitleSeen) {
      correctedType = "body_text";
    }

    // R2: body_text внутри секции библиографии + паттерн записи → bibliography_entry
    if (block.blockType === "body_text" && inBibliography && BIBLIO_ENTRY_RE.test(text)) {
      correctedType = "bibliography_entry";
    }

    // R3: unknown между двумя bibliography_entry → bibliography_entry
    if (block.blockType === "unknown" &&
        prev?.blockType === "bibliography_entry" &&
        next?.blockType === "bibliography_entry") {
      correctedType = "bibliography_entry";
    }

    // R4: unknown между двумя list_item → list_item
    if (block.blockType === "unknown" &&
        prev?.blockType === "list_item" &&
        next?.blockType === "list_item") {
      correctedType = "list_item";
    }

    // R5: toc_entry изолированный (нет toc/toc_entry рядом) → body_text
    if (block.blockType === "toc_entry") {
      const prevIsToc = prev?.blockType === "toc" || prev?.blockType === "toc_entry";
      const nextIsToc = next?.blockType === "toc" || next?.blockType === "toc_entry";
      if (!prevIsToc && !nextIsToc) {
        correctedType = "body_text";
      }
    }

    // R6: appendix_content без предшествующего appendix_title → body_text
    if (block.blockType === "appendix_content" && !inAppendix) {
      correctedType = "body_text";
    }

    // R7: heading с текстом >200 символов → скорее body_text
    if (block.blockType.startsWith("heading_") && text.length > 200) {
      correctedType = "body_text";
    }

    if (correctedType) {
      fixes.push(`[seq:${block.paragraphIndex}] ${block.blockType} → ${correctedType}`);
      return { ...block, blockType: correctedType, confidence: 0.8 };
    }

    return block;
  });

  return { blocks: fixed, fixes };
}

/**
 * Post-processing валидация: исправляет очевидные ошибки AI-разметки rule-based логикой.
 * Safety net после AI — ловит то, что AI мог пропустить.
 */
export function postValidateMarkup(
  blocks: BlockMarkupItem[],
  paragraphs: Array<{ index: number; text: string; style?: string }>
): { blocks: BlockMarkupItem[]; fixes: string[] } {
  const textMap = new Map(paragraphs.map((p) => [p.index, p]));
  const fixes: string[] = [];

  const fixed = blocks.map((block) => {
    const para = textMap.get(block.paragraphIndex);
    if (!para) return block;

    const text = para.text.trim();
    const style = para.style?.toLowerCase() ?? "";
    let correctedType: BlockType | null = null;

    // 1. Пустой параграф должен быть empty
    if (text === "" && block.blockType !== "empty") {
      correctedType = "empty";
    }

    // 2. Параграф с только числом (1-4 цифры) → page_number
    if (/^\d{1,4}$/.test(text) && block.blockType !== "page_number" && block.blockType !== "toc_entry") {
      correctedType = "page_number";
    }

    // 3. "Рисунок N" → figure_caption, не body_text
    if (/^Рисунок\s+\d|^Рис\.\s*\d/i.test(text) && block.blockType === "body_text") {
      correctedType = "figure_caption";
    }

    // 4. "Таблица N" / "Таблица №N" → table_caption, не body_text
    if (/^Таблица\s+(?:№\s*)?\d|^Табл\.\s*(?:№\s*)?\d/i.test(text) && block.blockType === "body_text") {
      correctedType = "table_caption";
    }

    // 5. Heading стиль в Word → заголовок, не body_text
    if (style.startsWith("heading") && block.blockType === "body_text") {
      const level = parseInt(style.replace(/\D/g, ""), 10);
      if (level >= 1 && level <= 4) {
        correctedType = `heading_${level}` as BlockType;
      }
    }

    // 6. Списочный маркер → list_item
    if (/^[–\-•*]\s/.test(text) && block.blockType === "body_text") {
      correctedType = "list_item";
    }
    if (/^[а-яa-z]\)\s|^\d+\)\s/i.test(text) && block.blockType === "body_text") {
      correctedType = "list_item";
    }

    // 7. title_page → подтипы
    if (block.blockType === "title_page") {
      if (/^\(.*\)$/.test(text)) {
        correctedType = "title_page_annotation";
      } else if (/^(?:г\.\s*)?[А-ЯЁ][а-яё\-]+\s+\d{4}\s*$/.test(text)) {
        correctedType = "title_page_footer";
      }
    }

    // 8. bibliography_entry без metadata.language → добавляем
    if (block.blockType === "bibliography_entry" && !block.metadata?.language) {
      const isEnglish = /[a-zA-Z]{3,}/.test(text) && !/[а-яА-Я]{3,}/.test(text);
      return {
        ...block,
        metadata: { ...block.metadata, language: isEnglish ? "en" as const : "ru" as const },
      };
    }

    if (correctedType) {
      fixes.push(`[${block.paragraphIndex}] ${block.blockType} → ${correctedType}`);
      return { ...block, blockType: correctedType, confidence: 0.8 };
    }

    return block;
  });

  return { blocks: fixed, fixes };
}

/**
 * Определяет подтип title_page по содержимому текста.
 */
function inferTitlePageSubtype(
  text: string,
  position: number,
  totalCount: number
): BlockType | null {
  // Город + год (последняя строка титульной)
  if (/^(?:г\.\s*)?[А-ЯЁ][а-яё\-]+\s+\d{4}\s*$/.test(text)) {
    return "title_page_footer";
  }
  // Подпись / дата / линия подчёркивания
  if (/(?:подпись|оценка|дата|_{4,})/.test(text) || /^\(.*\)$/.test(text)) {
    return "title_page_annotation";
  }
  // Название вуза / министерства / кафедры
  if (/(?:министерство|федеральное|университет|академия|институт|кафедра|факультет|департамент)/i.test(text)) {
    return "title_page_header";
  }
  // Короткий текст в середине → info (направление, специальность, группа)
  if (text.length < 50 && position > 0 && position < totalCount - 1) {
    return "title_page_info";
  }
  // Длинный текст в средней части → title (тема работы)
  if (text.length >= 50 && position > 0 && position < totalCount - 1) {
    return "title_page_title";
  }
  return "title_page";
}

/**
 * Пост-обработка: определяет title_page блоки по позиции.
 * Все параграфы до первого heading_1, которые не имеют heading/list/caption типа,
 * переклассифицируются как title_page* подтипы.
 */
export function classifyTitlePageBlocks(
  blocks: BlockMarkupItem[],
  paragraphs: Array<{ index: number; text: string; style?: string }>
): SequenceValidationResult {
  const textMap = new Map(paragraphs.map((p) => [p.index, p]));

  // Найти первый heading_1 (или bibliography_title, appendix_title — начало контента)
  const firstContentIdx = blocks.findIndex(
    (b) => b.blockType === "heading_1" || b.blockType === "bibliography_title"
  );
  if (firstContentIdx <= 0) return { blocks, fixes: [] };

  // Максимум 10 параграфов до первого заголовка рассматриваем как title_page
  const maxTitlePageRange = Math.min(firstContentIdx, 10);

  // Проверяем, что AI не классифицировал их уже как title_page
  const alreadyHasTitlePage = blocks
    .slice(0, maxTitlePageRange)
    .some((b) => b.blockType.startsWith("title_page"));
  if (alreadyHasTitlePage) return { blocks, fixes: [] };

  // Типы-кандидаты для переклассификации
  const candidateTypes = new Set<BlockType>([
    "body_text", "unknown",
  ]);

  const fixes: string[] = [];
  const fixed = [...blocks];
  let candidateCount = 0;

  // Подсчёт реальных кандидатов (не empty/page_number)
  for (let i = 0; i < maxTitlePageRange; i++) {
    if (candidateTypes.has(fixed[i].blockType)) candidateCount++;
  }

  // Минимум 2 кандидата — иначе это не титульная страница
  if (candidateCount < 2) return { blocks, fixes: [] };

  for (let i = 0; i < maxTitlePageRange; i++) {
    const block = fixed[i];
    if (!candidateTypes.has(block.blockType)) continue;

    const text = (textMap.get(block.paragraphIndex)?.text || "").trim();
    if (!text) continue;

    const newType = inferTitlePageSubtype(text, i, maxTitlePageRange);
    if (newType) {
      fixes.push(`[title_page:${block.paragraphIndex}] ${block.blockType} → ${newType}`);
      fixed[i] = { ...block, blockType: newType, confidence: 0.75 };
    }
  }

  return { blocks: fixed, fixes };
}
