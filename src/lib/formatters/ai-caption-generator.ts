/**
 * AI-генерация подписей к таблицам и рисункам
 *
 * - Таблицы: извлекает текст из ячеек → AI через gateway генерирует описание
 * - Рисунки: пока отключены (EMF/WMF не поддерживаются, vision требует отдельного API)
 *
 * Использует AI Gateway для автоматического failover между моделями.
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
import { callAI } from "../ai/gateway";
import { DocxParagraph } from "../pipeline/document-analyzer";

/** Извлекает текст из параграфа */
function getParagraphText(node: OrderedXmlNode): string {
  const runs = getRuns(node);
  let text = "";
  for (const run of runs) {
    for (const t of findChildren(run, "w:t")) {
      text += getText(t);
    }
  }
  return text;
}
import { FormattingRules } from "@/types/formatting-rules";

const HALF_POINTS_PER_PT = 2;

/** Максимум AI-запросов на генерацию подписей (защита от перерасхода) */
const MAX_CAPTION_REQUESTS = 10;

const CAPTION_SYSTEM_PROMPT = `Ты — помощник для оформления академических документов.
Тебе дают содержимое таблицы. Верни краткую подпись на русском языке.

Правила:
- Подпись должна быть краткой (3-8 слов)
- НЕ начинай с "Таблица" или "Рисунок" — только описательная часть
- Используй именительный падеж
- Примеры хороших подписей: "Динамика продаж за 2025 год", "Структура управления организацией", "Классификация методов исследования"

Верни JSON: {"caption": "текст подписи"}`;

/**
 * Извлекает текст из таблицы (заголовки + первые 2 строки)
 */
function extractTableText(tableNode: OrderedXmlNode): string {
  const rows = findChildren(tableNode, "w:tr");
  const result: string[] = [];

  for (let rowIdx = 0; rowIdx < Math.min(rows.length, 3); rowIdx++) {
    const cells = findChildren(rows[rowIdx], "w:tc");
    const cellTexts: string[] = [];

    for (const cell of cells) {
      const paragraphs = findChildren(cell, "w:p");
      let cellText = "";
      for (const p of paragraphs) {
        const runs = getRuns(p);
        for (const run of runs) {
          const tNodes = findChildren(run, "w:t");
          for (const t of tNodes) {
            cellText += getText(t);
          }
        }
      }
      cellTexts.push(cellText.trim());
    }

    result.push(cellTexts.join(" | "));
  }

  return result.join("\n").slice(0, 500);
}


/**
 * Проверяет качество AI-сгенерированной подписи.
 * Отсекает мусор: "пустая таблица", слишком короткие, начинающиеся с "Таблица".
 */
function isValidCaption(caption: string): boolean {
  const lower = caption.toLowerCase().trim();
  if (lower.length < 5 || lower.length > 120) return false;
  // Reject generic/meaningless captions
  if (lower.includes("пустая таблица") || lower.includes("пустая")) return false;
  if (lower.includes("без названия") || lower.includes("без заголовка")) return false;
  if (lower === "таблица" || lower === "данные" || lower === "результаты") return false;
  // AI should return description only, not "Таблица N — ..."
  if (/^таблиц/i.test(lower)) return false;
  if (/^рисун/i.test(lower)) return false;
  return true;
}

/**
 * Генерирует подпись для таблицы через AI Gateway
 */
async function generateTableCaption(tableText: string): Promise<string | null> {
  try {
    const response = await callAI({
      systemPrompt: CAPTION_SYSTEM_PROMPT,
      userPrompt: `Содержимое таблицы:\n${tableText}`,
      temperature: 0.3,
      maxTokens: 100,
    });

    const result = response.json as { caption?: string };
    const caption = result.caption || null;

    if (caption && !isValidCaption(caption)) {
      console.warn(`[ai-caption] Rejected bad caption: "${caption}"`);
      return null;
    }

    console.log(`[ai-caption] Generated table caption via ${response.modelName}: "${caption}"`);
    return caption;
  } catch (e) {
    console.warn("[ai-caption] Table caption generation failed:", e);
    return null;
  }
}

/**
 * Создаёт XML-параграф с подписью
 */
function buildCaptionParagraph(
  type: "table" | "figure",
  number: number,
  caption: string,
  rules: FormattingRules
): OrderedXmlNode {
  const fontFamily = rules.text.fontFamily;
  const fontSize = rules.text.fontSize;
  const sizeHalf = fontSize * HALF_POINTS_PER_PT;

  const prefix = type === "table" ? "Таблица" : "Рисунок";
  const separator = type === "table" ? " \u2013 " : " \u2013 "; // среднее тире

  const pPr = createNode("w:pPr", undefined, [
    createNode("w:jc", { "w:val": "center" }),
    createNode("w:spacing", {
      "w:line": String(Math.round((rules.text.lineSpacing || 1.5) * 240)),
      "w:lineRule": "auto",
    }),
  ]);

  const rPr = createNode("w:rPr", undefined, [
    createNode("w:rFonts", {
      "w:ascii": fontFamily,
      "w:hAnsi": fontFamily,
      "w:cs": fontFamily,
    }),
    createNode("w:sz", { "w:val": String(sizeHalf) }),
    createNode("w:szCs", { "w:val": String(sizeHalf) }),
  ]);

  return createNode("w:p", undefined, [
    pPr,
    createNode("w:r", undefined, [
      rPr,
      createNode("w:t", { "xml:space": "preserve" }, [
        createTextNode(`${prefix} ${number}${separator}${caption}`),
      ]),
    ]),
  ]);
}

/**
 * Применяет AI-генерацию подписей к документу.
 *
 * Находит таблицы/рисунки без подписей, генерирует подписи через AI,
 * вставляет новые параграфы с подписями.
 *
 * Таблица — подпись ДО таблицы. Рисунок — подпись ПОСЛЕ рисунка.
 */
export async function applyAiCaptions(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[],
  rules: FormattingRules
): Promise<{ buffer: Buffer; captionsAdded: number }> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return { buffer, captionsAdded: 0 };

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
  if (!body) return { buffer, captionsAdded: 0 };

  const bodyChildren = children(body);
  const paragraphs = getParagraphsWithPositions(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));

  // Собираем таблицы без подписей
  const tableTasks: { bodyIndex: number; tableNode: OrderedXmlNode; number: number }[] = [];

  // Считаем существующие подписи для нумерации
  const existingTableCaptions = enrichedParagraphs.filter(
    (p) => p.blockType === "table_caption"
  ).length;

  // Находим таблицы в body (w:tbl элементы)
  for (let i = 0; i < bodyChildren.length; i++) {
    if ("w:tbl" in bodyChildren[i]) {
      // Проверяем, есть ли подпись рядом (±3 параграфа)
      const hasCaption = paragraphs.some(({ paragraphIndex, bodyIndex, node }) => {
        if (Math.abs(bodyIndex - i) > 3) return false;
        const enriched = enrichedMap.get(paragraphIndex);
        // Проверка 1: AI-размеченные table_caption
        if (enriched?.blockType === "table_caption") return true;
        // Проверка 2: текст начинается с "Таблица" (fallback для нераспознанных подписей)
        const text = getParagraphText(node).trim();
        if (/^Таблица\s*(?:№\s*)?\d/i.test(text)) return true;
        return false;
      });

      if (!hasCaption) {
        tableTasks.push({
          bodyIndex: i,
          tableNode: bodyChildren[i],
          number: existingTableCaptions + tableTasks.length + 1,
        });
      }
    }
  }

  if (tableTasks.length === 0) {
    return { buffer, captionsAdded: 0 };
  }

  // Ограничиваем количество AI-запросов
  const tasksToProcess = tableTasks.slice(0, MAX_CAPTION_REQUESTS);
  if (tableTasks.length > MAX_CAPTION_REQUESTS) {
    console.log(`[ai-caption] Limiting to ${MAX_CAPTION_REQUESTS} captions (${tableTasks.length} tables without captions)`);
  }

  // Генерируем подписи последовательно (batch по 3) чтобы не превысить rate limit
  type CaptionResult = {
    bodyIndex: number;
    number: number;
    caption: string | null;
  };

  const BATCH_SIZE = 3;
  const results: CaptionResult[] = [];

  for (let i = 0; i < tasksToProcess.length; i += BATCH_SIZE) {
    const batch = tasksToProcess.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (task) => {
        const tableText = extractTableText(task.tableNode);
        return {
          bodyIndex: task.bodyIndex,
          number: task.number,
          caption: await generateTableCaption(tableText),
        };
      })
    );
    results.push(...batchResults);
  }

  // Вставляем подписи (с конца документа, чтобы индексы не съезжали)
  const insertions = results
    .filter((r) => r.caption !== null)
    .sort((a, b) => b.bodyIndex - a.bodyIndex);

  let captionsAdded = 0;

  for (const ins of insertions) {
    const captionParagraph = buildCaptionParagraph(
      "table",
      ins.number,
      ins.caption!,
      rules
    );

    // Подпись таблицы вставляется ДО таблицы
    bodyChildren.splice(ins.bodyIndex, 0, captionParagraph);
    captionsAdded++;
  }

  if (captionsAdded === 0) return { buffer, captionsAdded: 0 };

  const newXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newXml);

  const resultBuffer = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;

  return { buffer: resultBuffer, captionsAdded };
}
