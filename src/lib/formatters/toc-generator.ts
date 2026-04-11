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

  // Сигнал 2: текстовый поиск "СОДЕРЖАНИЕ" + записи с точками
  for (let i = 0; i < paragraphs.length; i++) {
    const text = getParagraphText(paragraphs[i].node).trim().toUpperCase();
    if (text === "СОДЕРЖАНИЕ" || text === "ОГЛАВЛЕНИЕ") {
      const firstIdx = paragraphs[i].bodyIndex;
      let lastIdx = firstIdx;

      // Ищем записи TOC после заголовка (строки с "…" или номерами страниц)
      for (let j = i + 1; j < paragraphs.length; j++) {
        const entryText = getParagraphText(paragraphs[j].node).trim();
        // TOC entry: содержит точки-заполнители или "стр." и номера
        if (entryText && (entryText.includes("…") || entryText.includes("..") || /\d+\s*стр/i.test(entryText))) {
          lastIdx = paragraphs[j].bodyIndex;
        } else if (entryText.length > 0) {
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

    // Сигнал 1: section break после title_page — вставляем сразу после
    if (enriched?.blockType === "title_page" && hasSectionBreak(node)) {
      return bodyIndex + 1;
    }

    if (enriched?.blockType === "title_page") {
      lastTitlePageBodyIdx = bodyIndex;
    }
  }

  // Сигнал 2: после последнего title_page + пропуск пустых
  if (lastTitlePageBodyIdx >= 0) {
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

  // Ищем существующий TOC
  const existingToc = findExistingTocRange(paragraphs, enrichedMap);

  if (existingToc) {
    // Заменяем существующий TOC на field code (одной операцией splice)
    const count = existingToc.lastIdx - existingToc.firstIdx + 1;
    bodyChildren.splice(existingToc.firstIdx, count, ...tocElements);
    console.log(`[toc] Replaced existing TOC (bodyIndex ${existingToc.firstIdx}-${existingToc.lastIdx}) with field code`);
  } else {
    // Вставляем новый TOC после title_page
    const insertIdx = findTocInsertionPoint(paragraphs, enrichedMap);
    if (insertIdx < 0) {
      console.warn("[toc] No title_page found, skipping TOC insertion");
      return { buffer, tocInserted: false };
    }
    bodyChildren.splice(insertIdx, 0, ...tocElements);
    console.log(`[toc] Inserted new TOC at bodyIndex ${insertIdx}`);
  }

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
