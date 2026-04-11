/**
 * Форматирование списков: Word numbering (w:numPr) + ГОСТ нормализация
 *
 * Создаёт proper Word numbering definitions в numbering.xml
 * и привязывает list_item параграфы через w:numPr.
 *
 * ГОСТ 7.32-2017 п.4.4 / п.5.3:
 * - Маркированные (–): уровень 1, отступ 12.5мм
 * - Буквенные (а), б), в)): уровень 2, отступ 12.5мм, исключить ё,з,й,о,ч,ъ,ы,ь
 * - Цифровые (1), 2), 3)): уровень 3, отступ 12.5мм
 */

import JSZip from "jszip";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  getParagraphsWithPositions,
  createNode,
  createTextNode,
  children,
  findChild,
  findChildren,
  getText,
  getRuns,
  ensurePPr,
  setOrderedProp,
  removeChild,
} from "../xml/docx-xml";
import { DocxParagraph } from "../pipeline/document-analyzer";
import { FormattingRules } from "@/types/formatting-rules";

const TWIPS_PER_MM = 56.7;
const HALF_POINTS_PER_PT = 2;

// ── List Type Detection ──

export type ListType = "bulleted" | "numbered_digit" | "numbered_letter";

/** Маркеры маркированных списков */
const BULLET_MARKERS = /^[–\-•*]\s+/;

/** Цифровая нумерация: 1), 2), 1., 2. */
const DIGIT_MARKERS = /^\d+[.)]\s+/;

/** Кириллическая буквенная нумерация: а), б), в) */
const CYRILLIC_LETTER_MARKERS = /^[а-яё]\)\s+/i;

/** Латинская буквенная нумерация: a), b), c) */
const LATIN_LETTER_MARKERS = /^[a-z]\)\s+/i;

/**
 * Определяет тип списка по тексту параграфа
 */
export function detectListType(text: string): ListType | null {
  const trimmed = text.trim();
  if (BULLET_MARKERS.test(trimmed)) return "bulleted";
  if (CYRILLIC_LETTER_MARKERS.test(trimmed)) return "numbered_letter";
  if (LATIN_LETTER_MARKERS.test(trimmed)) return "numbered_letter";
  if (DIGIT_MARKERS.test(trimmed)) return "numbered_digit";
  return null;
}

/**
 * Удаляет ручной маркер из начала текста
 */
export function stripListMarker(text: string): string {
  return text
    .replace(BULLET_MARKERS, "")
    .replace(DIGIT_MARKERS, "")
    .replace(CYRILLIC_LETTER_MARKERS, "")
    .replace(LATIN_LETTER_MARKERS, "");
}

// ── Numbering XML Definitions ──

/**
 * Уникальные ID для наших numbering definitions.
 * Используем высокие числа, чтобы не конфликтовать с существующими.
 */
const ABSTRACT_NUM_BULLET = 9001;
const ABSTRACT_NUM_DIGIT = 9002;
const ABSTRACT_NUM_LETTER = 9003;
/** Стартовый numId для групп списков (каждая группа получает уникальный) */
const NUM_ID_BASE = 9001;

/**
 * Создаёт abstractNum для маркированного списка (–)
 */
function buildBulletAbstractNum(rules: FormattingRules): OrderedXmlNode {
  const indent = Math.round((rules.lists?.indent || 12.5) * TWIPS_PER_MM);
  const hanging = Math.round(5 * TWIPS_PER_MM); // ~5mm для маркера
  const fontFamily = rules.text.fontFamily;
  const fontSize = rules.text.fontSize;
  const sizeHalf = fontSize * HALF_POINTS_PER_PT;

  return {
    "w:abstractNum": [
      {
        "w:lvl": [
          createNode("w:start", { "w:val": "1" }),
          createNode("w:numFmt", { "w:val": "bullet" }),
          createNode("w:lvlText", { "w:val": "\u2013" }), // en-dash –
          createNode("w:lvlJc", { "w:val": "left" }),
          createNode("w:pPr", undefined, [
            createNode("w:ind", {
              "w:left": String(indent + hanging),
              "w:hanging": String(hanging),
            }),
          ]),
          createNode("w:rPr", undefined, [
            createNode("w:rFonts", {
              "w:ascii": fontFamily,
              "w:hAnsi": fontFamily,
              "w:cs": fontFamily,
              "w:hint": "default",
            }),
            createNode("w:sz", { "w:val": String(sizeHalf) }),
            createNode("w:szCs", { "w:val": String(sizeHalf) }),
          ]),
        ],
        ":@": { "@_w:ilvl": "0" },
      },
    ],
    ":@": {
      "@_w:abstractNumId": String(ABSTRACT_NUM_BULLET),
    },
  };
}

/**
 * Создаёт abstractNum для цифровой нумерации (1), 2), 3))
 */
function buildDigitAbstractNum(rules: FormattingRules): OrderedXmlNode {
  const indent = Math.round((rules.lists?.indent || 12.5) * TWIPS_PER_MM);
  const hanging = Math.round(5 * TWIPS_PER_MM);

  return {
    "w:abstractNum": [
      {
        "w:lvl": [
          createNode("w:start", { "w:val": "1" }),
          createNode("w:numFmt", { "w:val": "decimal" }),
          createNode("w:lvlText", { "w:val": "%1)" }),
          createNode("w:lvlJc", { "w:val": "left" }),
          createNode("w:pPr", undefined, [
            createNode("w:ind", {
              "w:left": String(indent + hanging),
              "w:hanging": String(hanging),
            }),
          ]),
        ],
        ":@": { "@_w:ilvl": "0" },
      },
    ],
    ":@": {
      "@_w:abstractNumId": String(ABSTRACT_NUM_DIGIT),
    },
  };
}

/**
 * Создаёт abstractNum для буквенной нумерации (а), б), в))
 * Используем russianLower для кириллических букв.
 */
function buildLetterAbstractNum(rules: FormattingRules): OrderedXmlNode {
  const indent = Math.round((rules.lists?.indent || 12.5) * TWIPS_PER_MM);
  const hanging = Math.round(5 * TWIPS_PER_MM);

  return {
    "w:abstractNum": [
      {
        "w:lvl": [
          createNode("w:start", { "w:val": "1" }),
          createNode("w:numFmt", { "w:val": "russianLower" }),
          createNode("w:lvlText", { "w:val": "%1)" }),
          createNode("w:lvlJc", { "w:val": "left" }),
          createNode("w:pPr", undefined, [
            createNode("w:ind", {
              "w:left": String(indent + hanging),
              "w:hanging": String(hanging),
            }),
          ]),
        ],
        ":@": { "@_w:ilvl": "0" },
      },
    ],
    ":@": {
      "@_w:abstractNumId": String(ABSTRACT_NUM_LETTER),
    },
  };
}

// ── Bibliography Detection ──

/** Паттерны заголовков библиографии */
const BIBLIO_TITLE_PATTERNS = /^(?:список\s+(?:использованных?\s+)?(?:источников|литературы)|библиографи|литература)\s*$/i;

/**
 * Находит paragraphIndex, с которого начинается библиография.
 * Все параграфы с этого индекса и далее НЕ должны обрабатываться как списки.
 */
function findBibliographyStart(
  paragraphs: { paragraphIndex: number; node: OrderedXmlNode }[],
  enrichedMap: Map<number, DocxParagraph>
): number {
  // Сигнал 1: AI-разметка bibliography_title
  for (const { paragraphIndex } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched?.blockType === "bibliography_title") {
      return paragraphIndex;
    }
  }

  // Сигнал 2: текстовый поиск заголовка библиографии
  // ВАЖНО: пропускаем toc/toc_entry — там тоже может быть текст "Список литературы"
  for (const { paragraphIndex, node } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    const bt = enriched?.blockType || "unknown";
    if (bt === "toc" || bt === "toc_entry" || bt.startsWith("heading_")) continue;
    const text = getFullText(node).trim();
    if (BIBLIO_TITLE_PATTERNS.test(text)) {
      return paragraphIndex;
    }
  }

  return -1; // не найдено
}

// ── Main Pipeline ──

/**
 * Применяет ГОСТ-форматирование списков: Word numbering + нормализация маркеров.
 *
 * 1. Создаёт/обновляет numbering.xml с определениями для 3 типов списков
 * 2. Группирует list items в непрерывные блоки (каждый блок = отдельный Word-список)
 * 3. Исключает параграфы в секции библиографии
 */
export async function applyListFormatting(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[],
  rules: FormattingRules
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return buffer;

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
  if (!body) return buffer;

  const paragraphs = getParagraphsWithPositions(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));

  // Определяем границу библиографии — все параграфы после неё НЕ обрабатываем
  const bibliographyStartIdx = findBibliographyStart(paragraphs, enrichedMap);

  // Типы блоков, где ищем списки
  const LIST_CANDIDATE_TYPES = new Set(["list_item", "body_text", "unknown"]);

  // Phase 1: найти все list items и разбить на группы (каждый непрерывный блок = отдельный список)
  interface ListGroup {
    type: ListType;
    items: { paragraphIndex: number; node: OrderedXmlNode }[];
  }
  const groups: ListGroup[] = [];
  let currentGroup: ListGroup | null = null;

  for (const { paragraphIndex, node } of paragraphs) {
    // Не обрабатываем параграфы в секции библиографии
    if (bibliographyStartIdx >= 0 && paragraphIndex >= bibliographyStartIdx) {
      if (currentGroup) { groups.push(currentGroup); currentGroup = null; }
      continue;
    }

    const enriched = enrichedMap.get(paragraphIndex);
    const blockType = enriched?.blockType || "unknown";

    if (!LIST_CANDIDATE_TYPES.has(blockType)) {
      if (currentGroup) { groups.push(currentGroup); currentGroup = null; }
      continue;
    }

    const text = getFullText(node);
    const listType = detectListType(text);

    if (!listType) {
      if (currentGroup) { groups.push(currentGroup); currentGroup = null; }
      continue;
    }

    // Продолжаем текущую группу если тип совпадает
    if (currentGroup && currentGroup.type === listType) {
      currentGroup.items.push({ paragraphIndex, node });
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { type: listType, items: [{ paragraphIndex, node }] };
    }
  }
  if (currentGroup) groups.push(currentGroup);

  if (groups.length === 0) {
    console.log(`[list] No list items detected (checked ${paragraphs.length} paragraphs, biblio starts at ${bibliographyStartIdx})`);
    return buffer;
  }

  // Phase 2: назначаем уникальные numId для каждой группы
  const usedTypes = new Set<ListType>();
  let nextNumId = NUM_ID_BASE;
  let processedCount = 0;
  const numIdToAbstractId: Map<number, number> = new Map();

  for (const group of groups) {
    usedTypes.add(group.type);
    const groupNumId = nextNumId++;
    const abstractId = group.type === "bulleted" ? ABSTRACT_NUM_BULLET
      : group.type === "numbered_digit" ? ABSTRACT_NUM_DIGIT
      : ABSTRACT_NUM_LETTER;
    numIdToAbstractId.set(groupNumId, abstractId);

    for (const { node } of group.items) {
      stripMarkerFromXmlParagraph(node, group.type);

      const pPr = ensurePPr(node);
      removeChild(pPr, "w:numPr");

      const numPrNode = createNode("w:numPr", undefined, [
        createNode("w:ilvl", { "w:val": "0" }),
        createNode("w:numId", { "w:val": String(groupNumId) }),
      ]);
      children(pPr).unshift(numPrNode);

      removeChild(pPr, "w:ind");
      processedCount++;
    }
  }

  // Создаём/обновляем numbering.xml с уникальными numId
  await ensureNumberingXmlWithGroups(zip, usedTypes, numIdToAbstractId, rules);
  await ensureNumberingRelationship(zip);

  const newXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newXml);

  const resultBuffer = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;

  console.log(`[list] Formatted ${processedCount} items in ${groups.length} groups (types: ${[...usedTypes].join(", ")})`);
  return resultBuffer;
}

// ── Helpers ──

/**
 * Извлекает полный текст из параграфа
 */
function getFullText(node: OrderedXmlNode): string {
  const runs = getRuns(node);
  let text = "";
  for (const run of runs) {
    const tNodes = findChildren(run, "w:t");
    for (const t of tNodes) {
      text += getText(t);
    }
  }
  return text;
}

/**
 * Удаляет маркер списка из XML-параграфа.
 * Работает с первым w:t в первом w:r.
 */
function stripMarkerFromXmlParagraph(node: OrderedXmlNode, listType: ListType): void {
  const runs = getRuns(node);
  if (runs.length === 0) return;

  // Собираем полный текст для определения маркера
  let fullText = "";
  for (const run of runs) {
    const tNodes = findChildren(run, "w:t");
    for (const t of tNodes) {
      fullText += getText(t);
    }
  }

  const stripped = stripListMarker(fullText);
  if (stripped === fullText) return;

  // Записываем обратно — весь текст в первый w:t
  let written = false;
  for (const run of runs) {
    const runCh = children(run);
    for (let i = 0; i < runCh.length; i++) {
      if (!("w:t" in runCh[i])) continue;

      if (!written) {
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(stripped),
        ]);
        written = true;
      } else {
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(""),
        ]);
      }
    }
  }
}

/**
 * Создаёт или обновляет word/numbering.xml с уникальными numId для каждой группы списков.
 *
 * abstractNum — шаблон (один на тип: bullet, digit, letter).
 * num — конкретный список (уникальный numId для каждой группы, ссылается на abstractNum).
 */
async function ensureNumberingXmlWithGroups(
  zip: JSZip,
  usedTypes: Set<ListType>,
  numIdToAbstractId: Map<number, number>,
  rules: FormattingRules
): Promise<void> {
  const numberingPath = "word/numbering.xml";
  const numberingXml = await zip.file(numberingPath)?.async("string");

  let numChildren: OrderedXmlNode[];
  let parsed: OrderedXmlNode[] | null = null;

  if (numberingXml) {
    parsed = parseDocxXml(numberingXml);
    const numberingNode = parsed.find((n) => "w:numbering" in n);
    if (!numberingNode) return;
    numChildren = children(numberingNode);
  } else {
    numChildren = [];
  }

  // Добавляем abstractNum для каждого используемого типа (если ещё нет)
  const existingAbstractIds = new Set<string>();
  for (const child of numChildren) {
    if ("w:abstractNum" in child && child[":@"]?.["@_w:abstractNumId"]) {
      existingAbstractIds.add(child[":@"]["@_w:abstractNumId"] as string);
    }
  }

  const builders: Record<string, (rules: FormattingRules) => OrderedXmlNode> = {
    [ABSTRACT_NUM_BULLET]: buildBulletAbstractNum,
    [ABSTRACT_NUM_DIGIT]: buildDigitAbstractNum,
    [ABSTRACT_NUM_LETTER]: buildLetterAbstractNum,
  };

  for (const abstractId of new Set(numIdToAbstractId.values())) {
    if (!existingAbstractIds.has(String(abstractId))) {
      numChildren.push(builders[abstractId](rules));
    }
  }

  // Добавляем num для каждой группы (уникальный numId → abstractNumId)
  for (const [numId, abstractId] of numIdToAbstractId) {
    numChildren.push({
      "w:num": [
        createNode("w:abstractNumId", { "w:val": String(abstractId) }),
      ],
      ":@": { "@_w:numId": String(numId) },
    });
  }

  if (parsed) {
    zip.file(numberingPath, buildDocxXml(parsed));
  } else {
    const numberingNode: OrderedXmlNode = {
      "w:numbering": numChildren,
      ":@": {
        "@_xmlns:w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "@_xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      },
    };
    const xmlDecl: OrderedXmlNode = {
      "?xml": [],
      ":@": { "@_version": "1.0", "@_encoding": "UTF-8", "@_standalone": "yes" },
    };
    zip.file(numberingPath, buildDocxXml([xmlDecl, numberingNode]));
  }
}

/**
 * Обеспечивает ссылку на numbering.xml в .rels и [Content_Types].xml
 */
async function ensureNumberingRelationship(zip: JSZip): Promise<void> {
  // 1. word/_rels/document.xml.rels — добавляем relationship
  const relsPath = "word/_rels/document.xml.rels";
  let relsXml = await zip.file(relsPath)?.async("string");
  if (!relsXml) return;

  if (!relsXml.includes("numbering.xml")) {
    // Добавляем relationship перед закрывающим тегом
    const relId = `rId${Date.now()}`;
    const newRel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`;
    relsXml = relsXml.replace("</Relationships>", `${newRel}</Relationships>`);
    zip.file(relsPath, relsXml);
  }

  // 2. [Content_Types].xml — добавляем Override для numbering.xml
  const contentTypesPath = "[Content_Types].xml";
  let contentTypesXml = await zip.file(contentTypesPath)?.async("string");
  if (!contentTypesXml) return;

  if (!contentTypesXml.includes("numbering.xml")) {
    const override = `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`;
    contentTypesXml = contentTypesXml.replace("</Types>", `${override}</Types>`);
    zip.file(contentTypesPath, contentTypesXml);
  }
}
