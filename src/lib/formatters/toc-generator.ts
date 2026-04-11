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
 * Вставляет или заменяет TOC в документе.
 *
 * Логика:
 * 1. Если есть блоки toc/toc_entry — удаляем их и вставляем field code на их место
 * 2. Если нет TOC — вставляем после title_page (или в начало)
 * 3. Добавляем разрыв страницы после TOC
 */
export async function applyTocGeneration(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[],
  rules: FormattingRules
): Promise<{ buffer: Buffer; tocInserted: boolean }> {
  // Проверяем, есть ли заголовки в документе (нужен хотя бы один heading)
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

  // Ищем существующий TOC (toc + toc_entry блоки)
  const tocIndices: number[] = [];
  for (const { paragraphIndex, bodyIndex } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched && (enriched.blockType === "toc" || enriched.blockType === "toc_entry")) {
      tocIndices.push(bodyIndex);
    }
  }

  // Создаём TOC элементы
  const tocHeading = buildTocHeadingParagraph(rules);
  const tocField = buildTocFieldParagraph(rules);
  const pageBreak = buildPageBreakParagraph();
  const tocElements = [tocHeading, tocField, pageBreak];

  if (tocIndices.length > 0) {
    // Заменяем существующий TOC на field code
    const firstTocIdx = Math.min(...tocIndices);
    const lastTocIdx = Math.max(...tocIndices);

    // Удаляем старые toc-параграфы (с конца, чтобы индексы не съехали)
    for (let i = lastTocIdx; i >= firstTocIdx; i--) {
      if (tocIndices.includes(i)) {
        bodyChildren.splice(i, 1);
      }
    }

    // Вставляем новые на место первого
    bodyChildren.splice(firstTocIdx, 0, ...tocElements);
  } else {
    // Вставляем TOC после title_page блоков
    let insertIdx = 0;
    for (const { paragraphIndex, bodyIndex } of paragraphs) {
      const enriched = enrichedMap.get(paragraphIndex);
      if (enriched && enriched.blockType === "title_page") {
        insertIdx = bodyIndex + 1;
      } else if (insertIdx > 0) {
        break; // Первый не-title_page после title_page блоков
      }
    }

    bodyChildren.splice(insertIdx, 0, ...tocElements);
  }

  // Добавляем настройку updateFields в document settings
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
