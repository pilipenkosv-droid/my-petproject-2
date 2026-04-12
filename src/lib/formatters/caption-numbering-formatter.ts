/**
 * Нумерация и нормализация подписей к таблицам и рисункам
 *
 * - Нормализация: "Рис." / "Рис" → "Рисунок", "Табл." / "Табл" → "Таблица"
 * - Перенумерация: присвоение последовательных номеров (1, 2, 3...)
 * - Обновление ссылок: "рисунок 5" → "рисунок 3" в body_text, если нумерация изменилась
 *
 * Работает на уровне всего документа через XML.
 */

import JSZip from "jszip";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  getParagraphsWithPositions,
  findChildren,
  getText,
  getRuns,
  children,
  createNode,
  createTextNode,
} from "../xml/docx-xml";
import { DocxParagraph } from "../pipeline/document-analyzer";

/** Собирает полный текст параграфа из всех runs */
function getFullParagraphText(p: OrderedXmlNode): string {
  const runs = getRuns(p);
  let text = "";
  for (const run of runs) {
    for (const t of findChildren(run, "w:t")) {
      text += getText(t);
    }
  }
  return text;
}

// Паттерны для подписей
const FIGURE_CAPTION_PATTERN = /^(Рисунок|Рис\.?)\s*(\d+(?:\.\d+)?)/i;
const TABLE_CAPTION_PATTERN = /^(Таблица|Табл\.?)\s*[№#]?\s*(\d+(?:\.\d+)?)/i;

// Паттерны для ссылок в тексте (не в начале строки)
const FIGURE_REF_PATTERN = /(рисунок|рисунке|рисунка|рисунком|рис\.?)\s*№?\s*(\d+(?:\.\d+)?)/gi;
const TABLE_REF_PATTERN = /(таблица|таблице|таблицы|таблицей|таблицу|табл\.?)\s*№?\s*(\d+(?:\.\d+)?)/gi;

interface NumberMapping {
  oldNumber: string;
  newNumber: number;
}

/**
 * Нормализует сокращение в подписи:
 * "Рис." / "Рис" → "Рисунок", "Табл." / "Табл" → "Таблица"
 */
function normalizeCaptionPrefix(text: string, type: "figure" | "table"): string {
  if (type === "figure") {
    return text.replace(
      /^(Рис\.?)\s*/i,
      "Рисунок "
    );
  }
  // Нормализуем "Табл." → "Таблица" и убираем "№" перед номером
  let result = text.replace(
    /^(Табл\.?)\s*/i,
    "Таблица "
  );
  // Артефакт run-split: "Таблица ица №9" / "Таблица лица №9" → "Таблица №9"
  result = result.replace(
    /^Таблица\s+[а-яё]*ица\s*/i,
    "Таблица "
  );
  // "Таблица №1" / "Таблица № 1" → "Таблица 1"
  result = result.replace(
    /^(Таблица)\s*[№#]\s*/i,
    "Таблица "
  );
  return result;
}

/**
 * Нормализует сокращения в ссылках внутри текста:
 * "рис. 1" → "рисунок 1", "табл. 2" → "таблица 2"
 */
function normalizeReferenceAbbreviations(text: string): string {
  // "рис." / "Рис." → "рисунок" / "Рисунок" (сохраняем регистр)
  text = text.replace(
    /\b(Р)(ис\.?)\s*(\d)/g,
    "$1исунок $3"
  );
  text = text.replace(
    /\b(р)(ис\.?)\s*(\d)/g,
    "$1исунок $3"
  );
  // "табл." / "Табл." → "таблица" / "Таблица"
  text = text.replace(
    /\b(Т)(абл\.?)\s*(\d)/g,
    "$1аблица $3"
  );
  text = text.replace(
    /\b(т)(абл\.?)\s*(\d)/g,
    "$1аблица $3"
  );
  return text;
}

/**
 * Обновляет номер в ссылке, учитывая маппинг старых → новых номеров
 */
function updateNumberInText(
  text: string,
  pattern: RegExp,
  mapping: Map<string, number>
): string {
  return text.replace(pattern, (match, prefix: string, oldNum: string) => {
    const newNum = mapping.get(oldNum);
    if (newNum !== undefined) {
      return `${prefix} ${newNum}`;
    }
    return match;
  });
}

/**
 * Применяет перенумерацию и нормализацию подписей ко всему документу.
 *
 * Проход 1: Собираем все подписи, строим маппинг old→new номеров
 * Проход 2: Обновляем подписи (нормализация + новый номер)
 * Проход 3: Обновляем ссылки в body_text
 *
 * Возвращает количество изменений.
 */
export async function applyCaptionNumbering(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[]
): Promise<{ buffer: Buffer; changesCount: number }> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) return { buffer, changesCount: 0 };

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
  if (!body) return { buffer, changesCount: 0 };

  const paragraphs = getParagraphsWithPositions(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));

  // Fallback lookup: по тексту, если index-based lookup не сработал (после cleanup индексы сдвигаются)
  const enrichedByText = new Map<string, DocxParagraph>();
  for (const p of enrichedParagraphs) {
    if (p.blockType === "table_caption" || p.blockType === "figure_caption" ||
        p.blockType === "body_text" || p.blockType === "list_item" || p.blockType === "quote") {
      const key = p.text.trim().substring(0, 80);
      if (key && !enrichedByText.has(key)) {
        enrichedByText.set(key, p);
      }
    }
  }

  function lookupEnriched(paragraphIndex: number, nodeText: string): DocxParagraph | undefined {
    const byIndex = enrichedMap.get(paragraphIndex);
    if (byIndex) return byIndex;
    const key = nodeText.trim().substring(0, 80);
    return key ? enrichedByText.get(key) : undefined;
  }

  // Проход 1: Собираем подписи в порядке появления, строим маппинг
  const figureMappings: NumberMapping[] = [];
  const tableMappings: NumberMapping[] = [];
  let figureCounter = 0;
  let tableCounter = 0;

  for (const { node, paragraphIndex } of paragraphs) {
    const nodeText = getFullParagraphText(node);
    const enriched = lookupEnriched(paragraphIndex, nodeText);
    if (!enriched) {
      // Fallback: определяем по тексту, даже без enriched
      const figMatch = nodeText.match(FIGURE_CAPTION_PATTERN);
      if (figMatch) {
        figureCounter++;
        figureMappings.push({ oldNumber: figMatch[2], newNumber: figureCounter });
      }
      const tblMatch = nodeText.match(TABLE_CAPTION_PATTERN);
      if (tblMatch) {
        tableCounter++;
        tableMappings.push({ oldNumber: tblMatch[2], newNumber: tableCounter });
      }
      continue;
    }

    if (enriched.blockType === "figure_caption") {
      const match = enriched.text.match(FIGURE_CAPTION_PATTERN);
      if (match) {
        figureCounter++;
        figureMappings.push({ oldNumber: match[2], newNumber: figureCounter });
      }
    }

    if (enriched.blockType === "table_caption") {
      const match = enriched.text.match(TABLE_CAPTION_PATTERN);
      if (match) {
        tableCounter++;
        tableMappings.push({ oldNumber: match[2], newNumber: tableCounter });
      }
    }
  }

  // Строим Map для быстрого lookup
  const figureMap = new Map(figureMappings.map((m) => [m.oldNumber, m.newNumber]));
  const tableMap = new Map(tableMappings.map((m) => [m.oldNumber, m.newNumber]));

  // Проверяем, нужны ли изменения
  const figureNeedsRenumber = figureMappings.some((m) => m.oldNumber !== String(m.newNumber));
  const tableNeedsRenumber = tableMappings.some((m) => m.oldNumber !== String(m.newNumber));

  // Проверяем, есть ли сокращения или №/точки для нормализации
  const hasAbbreviations = enrichedParagraphs.some((p) => {
    if (p.blockType === "figure_caption") return /^Рис\.?\s/i.test(p.text);
    if (p.blockType === "table_caption") {
      return /^Табл\.?\s/i.test(p.text) || /[№#]/i.test(p.text) || /\d+\.\s*$/i.test(p.text);
    }
    return false;
  });

  // Проверяем ссылки-сокращения в тексте
  const hasRefAbbreviations = enrichedParagraphs.some((p) => {
    if (p.blockType === "body_text" || p.blockType === "list_item") {
      return /\bрис\.?\s*\d/i.test(p.text) || /\bтабл\.?\s*\d/i.test(p.text);
    }
    return false;
  });

  if (!figureNeedsRenumber && !tableNeedsRenumber && !hasAbbreviations && !hasRefAbbreviations) {
    return { buffer, changesCount: 0 };
  }

  // Проход 2-3: Применяем изменения к XML
  let changesCount = 0;

  for (const { node, paragraphIndex } of paragraphs) {
    const nodeText = getFullParagraphText(node);
    const enriched = lookupEnriched(paragraphIndex, nodeText);

    // Определяем blockType: из enriched или по тексту
    let blockType = enriched?.blockType || "unknown";

    // Fallback: определяем caption по тексту если AI не классифицировал
    if (blockType !== "table_caption" && blockType !== "figure_caption") {
      if (TABLE_CAPTION_PATTERN.test(nodeText)) blockType = "table_caption";
      else if (FIGURE_CAPTION_PATTERN.test(nodeText)) blockType = "figure_caption";
    }

    if (blockType === "unknown") continue;

    // Подписи к рисункам — нормализация + перенумерация
    if (blockType === "figure_caption") {
      const changed = rewriteParagraphText(node, (text) => {
        let result = normalizeCaptionPrefix(text, "figure");
        if (figureNeedsRenumber) {
          result = result.replace(
            /^(Рисунок)\s*(\d+(?:\.\d+)?)/i,
            (_, prefix, oldNum) => {
              const newNum = figureMap.get(oldNum);
              return newNum !== undefined ? `${prefix} ${newNum}` : `${prefix} ${oldNum}`;
            }
          );
        }
        return result;
      });
      if (changed) changesCount++;
      continue;
    }

    // Подписи к таблицам — нормализация + перенумерация + формат разделителя
    if (blockType === "table_caption") {
      const changed = rewriteParagraphText(node, (text) => {
        let result = normalizeCaptionPrefix(text, "table");
        if (tableNeedsRenumber) {
          result = result.replace(
            /^(Таблица)\s*(\d+(?:\.\d+)?)/i,
            (_, prefix, oldNum) => {
              const newNum = tableMap.get(oldNum);
              return newNum !== undefined ? `${prefix} ${newNum}` : `${prefix} ${oldNum}`;
            }
          );
        }
        // Нормализуем разделитель: "Таблица N." / "Таблица N. " → "Таблица N"
        // "Таблица N. Title" → "Таблица N – Title"
        // "Таблица N - Title" / "Таблица N — Title" → "Таблица N – Title"
        result = result.replace(
          /^(Таблица\s+\d+(?:\.\d+)?)\s*[.]\s*$/,
          "$1"
        );
        result = result.replace(
          /^(Таблица\s+\d+(?:\.\d+)?)\s*[.\-–—]\s+/,
          "$1 – "
        );
        // Убираем trailing whitespace
        result = result.trimEnd();
        // Если после номера идёт текст (не тире) без разделителя — добавляем тире
        result = result.replace(
          /^(Таблица\s+\d+(?:\.\d+)?)\s+(?![–—\-])(\S)/,
          "$1 – $2"
        );
        return result;
      });
      if (changed) changesCount++;
      continue;
    }

    // Обычный текст — обновление ссылок + нормализация сокращений
    if (blockType === "body_text" || blockType === "list_item" || blockType === "quote") {
      const changed = rewriteParagraphText(node, (text) => {
        let result = text;
        // Сначала нормализуем сокращения
        result = normalizeReferenceAbbreviations(result);
        // Потом обновляем номера
        if (figureNeedsRenumber) {
          result = updateNumberInText(result, FIGURE_REF_PATTERN, figureMap);
        }
        if (tableNeedsRenumber) {
          result = updateNumberInText(result, TABLE_REF_PATTERN, tableMap);
        }
        return result;
      });
      if (changed) changesCount++;
    }
  }

  if (changesCount === 0) return { buffer, changesCount: 0 };

  const newXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newXml);

  const resultBuffer = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;

  return { buffer: resultBuffer, changesCount };
}

/**
 * Перезаписывает текст параграфа через transform-функцию.
 * Собирает весь текст из всех w:t, применяет трансформацию,
 * записывает результат в первый w:t (остальные очищает).
 *
 * Возвращает true если текст изменился.
 */
function rewriteParagraphText(
  paragraph: OrderedXmlNode,
  transform: (text: string) => string
): boolean {
  const runs = findChildren(paragraph, "w:r");
  if (runs.length === 0) return false;

  let fullText = "";
  for (const run of runs) {
    const tNodes = findChildren(run, "w:t");
    for (const tNode of tNodes) {
      fullText += getText(tNode);
    }
  }

  if (!fullText.trim()) return false;

  const newText = transform(fullText);
  if (newText === fullText) return false;

  let written = false;
  for (const run of runs) {
    const runCh = children(run);
    for (let i = 0; i < runCh.length; i++) {
      if (!("w:t" in runCh[i])) continue;
      if (!written) {
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(newText),
        ]);
        written = true;
      } else {
        runCh[i] = createNode("w:t", { "xml:space": "preserve" }, [
          createTextNode(""),
        ]);
      }
    }
  }

  return true;
}
