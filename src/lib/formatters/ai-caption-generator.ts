/**
 * AI-генерация подписей к таблицам и рисункам
 *
 * - Таблицы: извлекает текст из ячеек → AI генерирует описание
 * - Рисунки: извлекает изображение из docx → vision AI описывает содержимое
 *
 * Использует Gemini через Google Generative AI SDK (поддержка vision).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import JSZip from "jszip";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  getParagraphsWithPositions,
  findChildren,
  findChild,
  getText,
  getRuns,
  children,
  createNode,
  createTextNode,
} from "../xml/docx-xml";
import { DocxParagraph } from "../pipeline/document-analyzer";
import { FormattingRules } from "@/types/formatting-rules";

const HALF_POINTS_PER_PT = 2;

const CAPTION_SYSTEM_PROMPT = `Ты — помощник для оформления академических документов.
Тебе дают содержимое таблицы или описание рисунка. Верни краткую подпись на русском языке.

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
 * Извлекает изображение из docx по relationship ID
 */
async function extractImageFromDocx(
  zip: JSZip,
  relsXml: string,
  rId: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  const relsData = parseDocxXml(relsXml);
  const relsRoot = relsData.find((n) => "Relationships" in n);
  if (!relsRoot) return null;

  const rels = children(relsRoot);
  const rel = rels.find((r) => r[":@"]?.["@_Id"] === rId);
  if (!rel) return null;

  const target = rel[":@"]?.["@_Target"];
  if (typeof target !== "string") return null;

  const imagePath = target.startsWith("/") ? target.slice(1) : `word/${target}`;
  const imageFile = zip.file(imagePath);
  if (!imageFile) return null;

  const data = await imageFile.async("nodebuffer");

  // Определяем MIME-тип по расширению
  const ext = imagePath.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    emf: "image/emf",
    wmf: "image/wmf",
  };

  return { data: Buffer.from(data), mimeType: mimeMap[ext || ""] || "image/png" };
}

/**
 * Находит relationship ID изображения в параграфе
 */
function findImageRId(paragraph: OrderedXmlNode): string | null {
  const runs = findChildren(paragraph, "w:r");
  for (const run of runs) {
    const drawings = findChildren(run, "w:drawing");
    for (const drawing of drawings) {
      // Ищем в inline и anchor
      const inlines = findChildren(drawing, "wp:inline");
      const anchors = findChildren(drawing, "wp:anchor");

      for (const container of [...inlines, ...anchors]) {
        // a:graphic → a:graphicData → pic:pic → pic:blipFill → a:blip
        const graphic = findChild(container, "a:graphic");
        if (!graphic) continue;
        const graphicData = findChild(graphic, "a:graphicData");
        if (!graphicData) continue;
        const pic = findChild(graphicData, "pic:pic");
        if (!pic) continue;
        const blipFill = findChild(pic, "pic:blipFill");
        if (!blipFill) continue;
        const blip = findChild(blipFill, "a:blip");
        if (!blip) continue;

        const embed = blip[":@"]?.["@_r:embed"];
        if (typeof embed === "string") return embed;
      }
    }
  }
  return null;
}

/**
 * Генерирует подпись для таблицы через AI (текстовый режим)
 */
async function generateTableCaption(tableText: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        maxOutputTokens: 100,
      },
    });

    const prompt = `${CAPTION_SYSTEM_PROMPT}\n\nСодержимое таблицы:\n${tableText}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    return parsed.caption || null;
  } catch (e) {
    console.warn("[ai-caption] Table caption generation failed:", e);
    return null;
  }
}

/**
 * Генерирует подпись для рисунка через vision AI
 */
async function generateFigureCaption(
  imageData: Buffer,
  mimeType: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return null;

  // Пропускаем EMF/WMF — Gemini не поддерживает
  if (mimeType === "image/emf" || mimeType === "image/wmf") return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        maxOutputTokens: 100,
      },
    });

    const base64 = imageData.toString("base64");

    const result = await model.generateContent([
      CAPTION_SYSTEM_PROMPT + "\n\nОпиши содержимое рисунка для академического документа.",
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
    ]);

    const text = result.response.text();
    const parsed = JSON.parse(text);
    return parsed.caption || null;
  } catch (e) {
    console.warn("[ai-caption] Figure caption generation failed:", e);
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

  const relsPath = "word/_rels/document.xml.rels";
  const relsXml = await zip.file(relsPath)?.async("string");

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
  if (!body) return { buffer, captionsAdded: 0 };

  const bodyChildren = children(body);
  const paragraphs = getParagraphsWithPositions(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));

  // Собираем таблицы без подписей
  const tableTasks: { bodyIndex: number; tableNode: OrderedXmlNode; number: number }[] = [];
  const figureTasks: { bodyIndex: number; paragraphNode: OrderedXmlNode; number: number }[] = [];

  // Считаем существующие подписи для нумерации
  const existingTableCaptions = enrichedParagraphs.filter(
    (p) => p.blockType === "table_caption"
  ).length;
  const existingFigureCaptions = enrichedParagraphs.filter(
    (p) => p.blockType === "figure_caption"
  ).length;

  // Находим таблицы в body (w:tbl элементы)
  for (let i = 0; i < bodyChildren.length; i++) {
    if ("w:tbl" in bodyChildren[i]) {

      // Проверяем, есть ли подпись рядом (±3 параграфа)
      const hasCaption = paragraphs.some(({ paragraphIndex, bodyIndex }) => {
        const enriched = enrichedMap.get(paragraphIndex);
        if (enriched?.blockType === "table_caption") {
          return Math.abs(bodyIndex - i) <= 3;
        }
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

  // Находим рисунки без подписей
  for (const { paragraphIndex, bodyIndex, node } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched?.blockType !== "figure") continue;

    // Проверяем, есть ли подпись рядом (±2 параграфа)
    const hasCaption = paragraphs.some(({ paragraphIndex: pIdx }) => {
      const e = enrichedMap.get(pIdx);
      if (e?.blockType === "figure_caption") {
        return Math.abs(pIdx - paragraphIndex) <= 2;
      }
      return false;
    });

    if (!hasCaption) {
      figureTasks.push({
        bodyIndex,
        paragraphNode: node,
        number: existingFigureCaptions + figureTasks.length + 1,
      });
    }
  }

  if (tableTasks.length === 0 && figureTasks.length === 0) {
    return { buffer, captionsAdded: 0 };
  }

  // Генерируем подписи последовательно (batch по 5) чтобы не превысить rate limit
  type CaptionResult = {
    bodyIndex: number;
    type: "table" | "figure";
    number: number;
    caption: string | null;
    position: "before" | "after";
  };

  const tasks: (() => Promise<CaptionResult>)[] = [];

  for (const task of tableTasks) {
    const tableText = extractTableText(task.tableNode);
    tasks.push(async () => ({
      bodyIndex: task.bodyIndex,
      type: "table" as const,
      number: task.number,
      caption: await generateTableCaption(tableText),
      position: "before" as const,
    }));
  }

  for (const task of figureTasks) {
    const rId = findImageRId(task.paragraphNode);
    if (rId && relsXml) {
      tasks.push(async () => {
        const image = await extractImageFromDocx(zip, relsXml, rId);
        const caption = image
          ? await generateFigureCaption(image.data, image.mimeType)
          : null;
        return {
          bodyIndex: task.bodyIndex,
          type: "figure" as const,
          number: task.number,
          caption,
          position: "after" as const,
        };
      });
    }
  }

  // Process in batches of 5 to respect rate limits
  const BATCH_SIZE = 5;
  const results: CaptionResult[] = [];
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }

  // Вставляем подписи (с конца документа, чтобы индексы не съезжали)
  const insertions = results
    .filter((r) => r.caption !== null)
    .sort((a, b) => b.bodyIndex - a.bodyIndex);

  let captionsAdded = 0;

  for (const ins of insertions) {
    const captionParagraph = buildCaptionParagraph(
      ins.type,
      ins.number,
      ins.caption!,
      rules
    );

    const insertIdx = ins.position === "before" ? ins.bodyIndex : ins.bodyIndex + 1;
    bodyChildren.splice(insertIdx, 0, captionParagraph);
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
