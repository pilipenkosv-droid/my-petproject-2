/**
 * Генерация содержания (TOC) через Word Field Code
 *
 * Вставляет стандартный TOC field: { TOC \o "1-3" \h \z \u }
 * Word при открытии предложит обновить поля → покажет актуальное содержание
 * с правильными номерами страниц.
 *
 * Если TOC уже существует — заменяем его на field code.
 * Если TOC нет — вставляем после title_page (или в начало документа).
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
} from "../xml/docx-xml";
import { DocxParagraph } from "../pipeline/document-analyzer";
import { FormattingRules } from "@/types/formatting-rules";

const TWIPS_PER_MM = 56.7;
const HALF_POINTS_PER_PT = 2;

/**
 * Создаёт XML-параграф с заголовком "СОДЕРЖАНИЕ"
 */
function buildTocHeadingParagraph(rules: FormattingRules): OrderedXmlNode {
  const fontFamily = rules.headings.level1.fontFamily || rules.text.fontFamily;
  const fontSize = rules.headings.level1.fontSize || rules.text.fontSize;
  const sizeHalf = fontSize * HALF_POINTS_PER_PT;

  return createNode("w:p", undefined, [
    createNode("w:pPr", undefined, [
      createNode("w:jc", { "w:val": "center" }),
      createNode("w:spacing", {
        "w:after": String(Math.round(12 * TWIPS_PER_MM / 2.835)),
        "w:line": String(Math.round((rules.text.lineSpacing || 1.5) * 240)),
        "w:lineRule": "auto",
      }),
    ]),
    createNode("w:r", undefined, [
      createNode("w:rPr", undefined, [
        createNode("w:rFonts", {
          "w:ascii": fontFamily,
          "w:hAnsi": fontFamily,
          "w:cs": fontFamily,
        }),
        createNode("w:b"),
        createNode("w:sz", { "w:val": String(sizeHalf) }),
        createNode("w:szCs", { "w:val": String(sizeHalf) }),
      ]),
      createNode("w:t", { "xml:space": "preserve" }, [
        createTextNode("СОДЕРЖАНИЕ"),
      ]),
    ]),
  ]);
}

/**
 * Создаёт XML-параграф с TOC Field Code
 *
 * Структура: w:fldSimple или w:fldChar + w:instrText
 * Используем w:fldChar (complex field) — он лучше поддерживается.
 *
 * Field: TOC \o "1-3" \h \z \u
 * - \o "1-3" — включать заголовки уровней 1-3
 * - \h — гиперссылки
 * - \z — скрывать номера страниц в веб-режиме
 * - \u — использовать стили заголовков
 */
function buildTocFieldParagraph(rules: FormattingRules): OrderedXmlNode {
  const fontFamily = rules.text.fontFamily;
  const fontSize = rules.text.fontSize;
  const sizeHalf = fontSize * HALF_POINTS_PER_PT;

  const rPrNode = createNode("w:rPr", undefined, [
    createNode("w:rFonts", {
      "w:ascii": fontFamily,
      "w:hAnsi": fontFamily,
      "w:cs": fontFamily,
    }),
    createNode("w:sz", { "w:val": String(sizeHalf) }),
    createNode("w:szCs", { "w:val": String(sizeHalf) }),
  ]);

  return createNode("w:p", undefined, [
    createNode("w:pPr", undefined, [
      createNode("w:spacing", {
        "w:line": String(Math.round((rules.text.lineSpacing || 1.5) * 240)),
        "w:lineRule": "auto",
      }),
    ]),
    // fldChar begin
    createNode("w:r", undefined, [
      rPrNode,
      createNode("w:fldChar", { "w:fldCharType": "begin" }),
    ]),
    // instrText
    createNode("w:r", undefined, [
      createNode("w:rPr", undefined, [
        createNode("w:rFonts", {
          "w:ascii": fontFamily,
          "w:hAnsi": fontFamily,
          "w:cs": fontFamily,
        }),
        createNode("w:sz", { "w:val": String(sizeHalf) }),
        createNode("w:szCs", { "w:val": String(sizeHalf) }),
      ]),
      createNode("w:instrText", { "xml:space": "preserve" }, [
        createTextNode(' TOC \\o "1-3" \\h \\z \\u '),
      ]),
    ]),
    // fldChar separate
    createNode("w:r", undefined, [
      createNode("w:rPr", undefined, [
        createNode("w:rFonts", {
          "w:ascii": fontFamily,
          "w:hAnsi": fontFamily,
          "w:cs": fontFamily,
        }),
        createNode("w:sz", { "w:val": String(sizeHalf) }),
        createNode("w:szCs", { "w:val": String(sizeHalf) }),
      ]),
      createNode("w:fldChar", { "w:fldCharType": "separate" }),
    ]),
    // Placeholder text (будет заменён при обновлении полей)
    createNode("w:r", undefined, [
      createNode("w:rPr", undefined, [
        createNode("w:rFonts", {
          "w:ascii": fontFamily,
          "w:hAnsi": fontFamily,
          "w:cs": fontFamily,
        }),
        createNode("w:sz", { "w:val": String(sizeHalf) }),
        createNode("w:szCs", { "w:val": String(sizeHalf) }),
      ]),
      createNode("w:t", { "xml:space": "preserve" }, [
        createTextNode("Обновите поля для отображения содержания (Ctrl+A, F9)"),
      ]),
    ]),
    // fldChar end
    createNode("w:r", undefined, [
      createNode("w:rPr", undefined, [
        createNode("w:rFonts", {
          "w:ascii": fontFamily,
          "w:hAnsi": fontFamily,
          "w:cs": fontFamily,
        }),
        createNode("w:sz", { "w:val": String(sizeHalf) }),
        createNode("w:szCs", { "w:val": String(sizeHalf) }),
      ]),
      createNode("w:fldChar", { "w:fldCharType": "end" }),
    ]),
  ]);
}

/**
 * Создаёт разрыв страницы после TOC
 */
function buildPageBreakParagraph(): OrderedXmlNode {
  return createNode("w:p", undefined, [
    createNode("w:r", undefined, [
      createNode("w:br", { "w:type": "page" }),
    ]),
  ]);
}

/**
 * Извлекает текст из XML-параграфа (все w:t внутри w:r)
 */
function getParagraphText(node: OrderedXmlNode): string {
  const runs = findChildren(node, "w:r");
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
 * Проверяет, содержит ли параграф разрыв секции (w:sectPr внутри w:pPr).
 * Section break после title page — самый надёжный маркер конца титульной.
 */
function hasSectionBreak(node: OrderedXmlNode): boolean {
  const pPr = findChild(node, "w:pPr");
  return pPr ? !!findChild(pPr, "w:sectPr") : false;
}

/**
 * Находит диапазон bodyIndex существующего ручного TOC.
 *
 * Ищет по двум сигналам:
 * 1. AI block markup: toc / toc_entry блоки
 * 2. Текстовый поиск: параграф с текстом "СОДЕРЖАНИЕ" + следующие за ним
 *    строки с точками/номерами страниц (паттерн "…N стр" или "…N")
 */
function findExistingTocRange(
  paragraphs: { paragraphIndex: number; bodyIndex: number; node: OrderedXmlNode }[],
  enrichedMap: Map<number, DocxParagraph>
): { firstIdx: number; lastIdx: number } | null {
  // Сигнал 1: AI-размеченные toc/toc_entry
  const tocIndices: number[] = [];
  for (const { paragraphIndex, bodyIndex } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched && (enriched.blockType === "toc" || enriched.blockType === "toc_entry")) {
      tocIndices.push(bodyIndex);
    }
  }
  if (tocIndices.length > 0) {
    return { firstIdx: Math.min(...tocIndices), lastIdx: Math.max(...tocIndices) };
  }

  // Сигнал 2: текстовый поиск "СОДЕРЖАНИЕ" + записи с точками/табами/номерами
  for (let i = 0; i < paragraphs.length; i++) {
    const text = getParagraphText(paragraphs[i].node).trim().toUpperCase();
    if (text === "СОДЕРЖАНИЕ" || text === "ОГЛАВЛЕНИЕ") {
      const firstIdx = paragraphs[i].bodyIndex;
      let lastIdx = firstIdx;

      // Ищем записи TOC после заголовка
      for (let j = i + 1; j < paragraphs.length; j++) {
        const entryText = getParagraphText(paragraphs[j].node).trim();
        if (!entryText) {
          // Пустые параграфы внутри TOC — включаем
          lastIdx = paragraphs[j].bodyIndex;
          continue;
        }
        // TOC entry: точки-заполнители, "стр.", или номер в конце строки
        const isTocEntry =
          entryText.includes("…") ||
          entryText.includes("..") ||
          /\d+\s*стр/i.test(entryText) ||
          /\d+\s*$/.test(entryText); // строка заканчивается номером страницы
        if (isTocEntry) {
          lastIdx = paragraphs[j].bodyIndex;
        } else {
          break; // Первый не-TOC параграф
        }
      }

      return { firstIdx, lastIdx };
    }
  }

  return null;
}

/**
 * Находит bodyIndex для вставки TOC после титульной страницы.
 *
 * Приоритет сигналов:
 * 1. Section break (w:sectPr в pPr) — самый надёжный
 * 2. Последний title_page параграф + пропуск пустых строк
 * 3. Fallback: не вставляем TOC (возвращаем -1)
 */
function findTocInsertionPoint(
  paragraphs: { paragraphIndex: number; bodyIndex: number; node: OrderedXmlNode }[],
  enrichedMap: Map<number, DocxParagraph>
): number {
  let lastTitlePageBodyIdx = -1;

  for (const { paragraphIndex, bodyIndex, node } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);

    // Сигнал 1: section break после title_page* — вставляем сразу после
    if (enriched?.blockType?.startsWith("title_page") && hasSectionBreak(node)) {
      return bodyIndex + 1;
    }

    if (enriched?.blockType?.startsWith("title_page")) {
      lastTitlePageBodyIdx = bodyIndex;
    }
  }

  // Сигнал 2: после последнего title_page
  if (lastTitlePageBodyIdx >= 0) {
    // Пропускаем непустые параграфы после title_page, которые могут быть
    // продолжением многострочного заголовка. Ищем первый пустой параграф
    // или параграф с heading_1/heading_2 (начало новой главы).
    for (const { paragraphIndex, bodyIndex } of paragraphs) {
      if (bodyIndex <= lastTitlePageBodyIdx) continue;
      const enriched = enrichedMap.get(paragraphIndex);
      const bt = enriched?.blockType || "unknown";
      // Нашли заголовок — вставляем TOC перед ним
      if (bt.startsWith("heading_")) {
        return bodyIndex;
      }
    }
    // Fallback: сразу после title_page
    return lastTitlePageBodyIdx + 1;
  }

  // Fallback: не вставляем TOC — нет title_page блоков
  return -1;
}

/**
 * Вставляет или заменяет TOC в документе.
 *
 * Логика:
 * 1. Ищем существующий TOC (AI-разметка или текстовый поиск "СОДЕРЖАНИЕ")
 * 2. Если найден — заменяем весь диапазон на field code
 * 3. Если не найден — вставляем после title_page (section break или последний title_page)
 * 4. Если title_page не найден — пропускаем (не ломаем документ)
 */
export async function applyTocGeneration(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[],
  rules: FormattingRules
): Promise<{ buffer: Buffer; tocInserted: boolean }> {
  // Проверяем, есть ли заголовки в документе
  const hasHeadings = enrichedParagraphs.some((p) =>
    p.blockType?.startsWith("heading_")
  );
  if (!hasHeadings) return { buffer, tocInserted: false };

  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return { buffer, tocInserted: false };

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
  if (!body) return { buffer, tocInserted: false };

  const bodyChildren = children(body);
  const paragraphs = getParagraphsWithPositions(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));

  // Создаём TOC элементы
  const tocHeading = buildTocHeadingParagraph(rules);
  const tocField = buildTocFieldParagraph(rules);
  const pageBreak = buildPageBreakParagraph();
  const tocElements = [tocHeading, tocField, pageBreak];

  // 1. Удаляем table-based TOC (пользовательские таблицы-содержания)
  removeTableBasedToc(bodyChildren);

  // 2. Ищем и заменяем paragraph-based TOC
  // Переполучаем paragraphs после возможного удаления таблиц (индексы сдвинулись)
  const paragraphsAfter = getParagraphsWithPositions(body);
  const existingToc = findExistingTocRange(paragraphsAfter, enrichedMap);

  if (existingToc) {
    const count = existingToc.lastIdx - existingToc.firstIdx + 1;
    bodyChildren.splice(existingToc.firstIdx, count, ...tocElements);
    console.log(`[toc] Replaced existing TOC (bodyIndex ${existingToc.firstIdx}-${existingToc.lastIdx}) with field code`);
  } else {
    // Переполучаем paragraphs после удалений
    const paragraphsForInsert = getParagraphsWithPositions(body);
    const insertIdx = findTocInsertionPoint(paragraphsForInsert, enrichedMap);
    if (insertIdx < 0) {
      console.warn("[toc] No title_page found, skipping TOC insertion");
      return { buffer, tocInserted: false };
    }
    bodyChildren.splice(insertIdx, 0, ...tocElements);
    console.log(`[toc] Inserted new TOC at bodyIndex ${insertIdx}`);
  }

  // 3. Гарантируем Heading1-3 стили в styles.xml
  await ensureHeadingStyles(zip, rules);
  await ensureUpdateFieldsSetting(zip);

  const newXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newXml);

  const resultBuffer = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;

  return { buffer: resultBuffer, tocInserted: true };
}

/**
 * Удаляет table-based TOC — пользовательские содержания, оформленные как таблицы (w:tbl).
 *
 * Ищет таблицы (w:tbl), в которых есть текст типичного содержания:
 * - "Введение", "Заключение", "Список литературы", "Глава"
 * - Или строки вида "1.1 Текст" + числа (страницы)
 */
function removeTableBasedToc(bodyChildren: OrderedXmlNode[]): void {
  const tocKeywords = /(?:введение|заключение|список\s+(?:использованных\s+)?(?:источников|литературы)|глава\s+\d|содержание|оглавление)/i;
  const tocEntryPattern = /^\d+(?:\.\d+)*\s+\S/; // "1.1 Текст..."

  const toRemove: number[] = [];

  for (let i = 0; i < bodyChildren.length; i++) {
    const node = bodyChildren[i];
    if (!("w:tbl" in node)) continue;

    // Извлекаем весь текст из таблицы
    const tableText = extractTableText(node);
    if (!tableText) continue;

    // Проверяем: содержит ли таблица типичные TOC-маркеры?
    const keywordMatches = (tableText.match(tocKeywords) || []).length;
    const entryMatches = tableText.split("\n").filter((line) => tocEntryPattern.test(line.trim())).length;

    // TOC-таблица: 2+ ключевых слов, или 1 ключевое + 3 нумерованных записей
    // Без ключевых слов не удаляем — это могут быть обычные нумерованные таблицы
    if (keywordMatches >= 2 || (keywordMatches >= 1 && entryMatches >= 3)) {
      toRemove.push(i);
      console.log(`[toc] Found table-based TOC at bodyIndex ${i} (${keywordMatches} keywords, ${entryMatches} entries)`);
    }
  }

  // Удаляем в обратном порядке (чтобы не сбить индексы)
  for (let k = toRemove.length - 1; k >= 0; k--) {
    bodyChildren.splice(toRemove[k], 1);
  }

  if (toRemove.length > 0) {
    console.log(`[toc] Removed ${toRemove.length} table-based TOC(s)`);
  }
}

/**
 * Извлекает весь текст из w:tbl (через w:tr → w:tc → w:p → w:r → w:t)
 */
function extractTableText(tableNode: OrderedXmlNode): string {
  const lines: string[] = [];
  const rows = findChildren(tableNode, "w:tr");
  for (const row of rows) {
    const cells = findChildren(row, "w:tc");
    const cellTexts: string[] = [];
    for (const cell of cells) {
      const paras = findChildren(cell, "w:p");
      for (const p of paras) {
        const runs = findChildren(p, "w:r");
        let pText = "";
        for (const run of runs) {
          const tNodes = findChildren(run, "w:t");
          for (const t of tNodes) {
            pText += getText(t);
          }
        }
        if (pText.trim()) cellTexts.push(pText.trim());
      }
    }
    if (cellTexts.length > 0) lines.push(cellTexts.join(" "));
  }
  return lines.join("\n");
}

/**
 * Гарантирует наличие стилей Heading1-3 в styles.xml.
 * Без этих стилей TOC field code \u не сможет найти заголовки.
 */
async function ensureHeadingStyles(zip: JSZip, rules: FormattingRules): Promise<void> {
  const stylesPath = "word/styles.xml";
  const stylesXml = await zip.file(stylesPath)?.async("string");
  if (!stylesXml) return;

  const parsed = parseDocxXml(stylesXml);
  const stylesNode = parsed.find((n) => "w:styles" in n);
  if (!stylesNode) return;

  const stylesChildren = children(stylesNode);

  // Проверяем, какие Heading стили уже есть
  const existingIds = new Set<string>();
  for (const child of stylesChildren) {
    if ("w:style" in child && child[":@"]?.["@_w:styleId"]) {
      existingIds.add(child[":@"]["@_w:styleId"] as string);
    }
  }

  const headingConfigs = [
    { id: "Heading1", name: "heading 1", level: 1, rules: rules.headings.level1 },
    { id: "Heading2", name: "heading 2", level: 2, rules: rules.headings.level2 },
    { id: "Heading3", name: "heading 3", level: 3, rules: rules.headings.level3 },
  ];

  for (const cfg of headingConfigs) {
    if (existingIds.has(cfg.id)) continue;

    const fontFamily = cfg.rules.fontFamily || rules.text.fontFamily;
    const fontSize = cfg.rules.fontSize || rules.text.fontSize;
    const sizeHalf = fontSize * HALF_POINTS_PER_PT;

    const styleNode: OrderedXmlNode = {
      "w:style": [
        createNode("w:name", { "w:val": cfg.name }),
        createNode("w:basedOn", { "w:val": "Normal" }),
        createNode("w:next", { "w:val": "Normal" }),
        createNode("w:qFormat"),
        createNode("w:pPr", undefined, [
          createNode("w:keepNext"),
          createNode("w:keepLines"),
          createNode("w:outlineLvl", { "w:val": String(cfg.level - 1) }),
        ]),
        createNode("w:rPr", undefined, [
          createNode("w:rFonts", {
            "w:ascii": fontFamily,
            "w:hAnsi": fontFamily,
            "w:cs": fontFamily,
          }),
          createNode("w:b"),
          createNode("w:sz", { "w:val": String(sizeHalf) }),
          createNode("w:szCs", { "w:val": String(sizeHalf) }),
        ]),
      ],
      ":@": {
        "@_w:type": "paragraph",
        "@_w:styleId": cfg.id,
      },
    };

    stylesChildren.push(styleNode);
    console.log(`[toc] Added missing style: ${cfg.id}`);
  }

  const newStylesXml = buildDocxXml(parsed);
  zip.file(stylesPath, newStylesXml);
}

/**
 * Добавляет w:updateFields в settings.xml — Word автоматически обновит TOC при открытии
 */
async function ensureUpdateFieldsSetting(zip: JSZip): Promise<void> {
  const settingsPath = "word/settings.xml";
  const settingsXml = await zip.file(settingsPath)?.async("string");

  if (!settingsXml) return;

  const parsed = parseDocxXml(settingsXml);
  const settingsNode = parsed.find((n) => "w:settings" in n);
  if (!settingsNode) return;

  const settingsChildren = children(settingsNode);

  // Проверяем, есть ли уже updateFields
  const hasUpdateFields = settingsChildren.some((c) => "w:updateFields" in c);
  if (hasUpdateFields) return;

  // Добавляем w:updateFields val="true"
  settingsChildren.push(
    createNode("w:updateFields", { "w:val": "true" })
  );

  const newSettingsXml = buildDocxXml(parsed);
  zip.file(settingsPath, newSettingsXml);
}
