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
const NUM_ID_BULLET = 9001;
const NUM_ID_DIGIT = 9002;
const NUM_ID_LETTER = 9003;

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

// ── Main Pipeline ──

/**
 * Применяет ГОСТ-форматирование списков: Word numbering + нормализация маркеров.
 *
 * 1. Создаёт/обновляет numbering.xml с определениями для 3 типов списков
 * 2. Для каждого list_item: определяет тип, убирает ручной маркер, привязывает w:numPr
 * 3. Обеспечивает правильную ссылку в [Content_Types].xml и document.xml.rels
 */
export async function applyListFormatting(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[],
  rules: FormattingRules
): Promise<Buffer> {
  // Есть ли list_item вообще?
  const hasLists = enrichedParagraphs.some((p) => p.blockType === "list_item");
  if (!hasLists) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return buffer;

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
  if (!body) return buffer;

  const paragraphs = getParagraphsWithPositions(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));

  // Определяем, какие типы списков нужны
  const usedTypes = new Set<ListType>();
  let processedCount = 0;

  for (const { paragraphIndex, node } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched?.blockType !== "list_item") continue;

    const text = getFullText(node);
    const listType = detectListType(text);
    if (!listType) continue;

    usedTypes.add(listType);

    // Убираем ручной маркер из текста
    stripMarkerFromXmlParagraph(node, listType);

    // Добавляем w:numPr в pPr
    const pPr = ensurePPr(node);
    // Удаляем существующий numPr если есть
    removeChild(pPr, "w:numPr");

    const numId = listType === "bulleted" ? NUM_ID_BULLET
      : listType === "numbered_digit" ? NUM_ID_DIGIT
      : NUM_ID_LETTER;

    // w:numPr должен быть одним из первых элементов в pPr
    const numPrNode = createNode("w:numPr", undefined, [
      createNode("w:ilvl", { "w:val": "0" }),
      createNode("w:numId", { "w:val": String(numId) }),
    ]);
    children(pPr).unshift(numPrNode);

    // Удаляем firstLineIndent — Word numbering управляет отступом
    removeChild(pPr, "w:ind");

    processedCount++;
  }

  if (processedCount === 0) return buffer;

  // Создаём/обновляем numbering.xml
  await ensureNumberingXml(zip, usedTypes, rules);

  // Обеспечиваем ссылку на numbering.xml
  await ensureNumberingRelationship(zip);

  const newXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newXml);

  const resultBuffer = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;

  console.log(`[list] Formatted ${processedCount} list items (types: ${[...usedTypes].join(", ")})`);
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
 * Создаёт или обновляет word/numbering.xml
 */
async function ensureNumberingXml(
  zip: JSZip,
  usedTypes: Set<ListType>,
  rules: FormattingRules
): Promise<void> {
  const numberingPath = "word/numbering.xml";
  let numberingXml = await zip.file(numberingPath)?.async("string");

  if (numberingXml) {
    // numbering.xml существует — добавляем наши определения
    const parsed = parseDocxXml(numberingXml);
    const numberingNode = parsed.find((n) => "w:numbering" in n);
    if (!numberingNode) return;

    const numChildren = children(numberingNode);
    addNumberingDefinitions(numChildren, usedTypes, rules);

    const newXml = buildDocxXml(parsed);
    zip.file(numberingPath, newXml);
  } else {
    // Создаём numbering.xml с нуля
    const numChildren: OrderedXmlNode[] = [];
    addNumberingDefinitions(numChildren, usedTypes, rules);

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

    const newXml = buildDocxXml([xmlDecl, numberingNode]);
    zip.file(numberingPath, newXml);
  }
}

/**
 * Добавляет abstractNum + num определения для указанных типов
 */
function addNumberingDefinitions(
  numChildren: OrderedXmlNode[],
  usedTypes: Set<ListType>,
  rules: FormattingRules
): void {
  // Проверяем, есть ли уже наши определения (по abstractNumId)
  const existingAbstractIds = new Set<string>();
  for (const child of numChildren) {
    if ("w:abstractNum" in child && child[":@"]?.["@_w:abstractNumId"]) {
      existingAbstractIds.add(child[":@"]["@_w:abstractNumId"] as string);
    }
  }

  const definitions: Array<{
    type: ListType;
    abstractId: number;
    numId: number;
    builder: (rules: FormattingRules) => OrderedXmlNode;
  }> = [
    { type: "bulleted", abstractId: ABSTRACT_NUM_BULLET, numId: NUM_ID_BULLET, builder: buildBulletAbstractNum },
    { type: "numbered_digit", abstractId: ABSTRACT_NUM_DIGIT, numId: NUM_ID_DIGIT, builder: buildDigitAbstractNum },
    { type: "numbered_letter", abstractId: ABSTRACT_NUM_LETTER, numId: NUM_ID_LETTER, builder: buildLetterAbstractNum },
  ];

  for (const def of definitions) {
    if (!usedTypes.has(def.type)) continue;
    if (existingAbstractIds.has(String(def.abstractId))) continue;

    // Добавляем abstractNum
    numChildren.push(def.builder(rules));

    // Добавляем num (ссылка на abstractNum)
    numChildren.push({
      "w:num": [
        createNode("w:abstractNumId", { "w:val": String(def.abstractId) }),
      ],
      ":@": { "@_w:numId": String(def.numId) },
    });
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
