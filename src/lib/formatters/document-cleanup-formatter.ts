/**
 * Пост-обработка документа: очистка и нормализация структуры
 *
 * 1. Удаление лишних пустых параграфов (>2 подряд → 1)
 * 2. Очистка пустых параграфов внутри ячеек таблиц
 * 3. Ограничение размеров drawing-элементов (EMF/WMF overflow)
 * 4. Нумерация заголовков (1. / 1.1. / 1.1.1.)
 *
 * Работает с ordered-форматом fast-xml-parser (preserveOrder: true).
 */

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
  setText,
  getRuns,
  children,
} from "../xml/docx-xml";
import { DocxParagraph } from "../pipeline/document-analyzer";
import { FormattingRules } from "@/types/formatting-rules";

// A4 полезная ширина: 210мм - 30мм(left) - 15мм(right) = 165мм
// В EMU: 1мм = 36000 EMU
const MAX_DRAWING_WIDTH_EMU = 165 * 36000; // 5_940_000 EMU

/**
 * Применяет все операции очистки к документу.
 */
export async function applyDocumentCleanup(
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

  const bodyChildren = children(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));
  const paragraphs = getParagraphsWithPositions(body);

  // 1. Нумерация заголовков
  applyHeadingNumbering(paragraphs, enrichedMap, rules);

  // 2. Очистка пустых параграфов внутри ячеек таблиц
  cleanTableCellEmptyParagraphs(bodyChildren);

  // 3. Ограничение размеров drawing (overflow prevention)
  clampDrawingSizes(bodyChildren);

  // 4. Удаление лишних пустых параграфов в body (>2 подряд → 1)
  // Выполняем ПОСЛЕДНИМ, т.к. меняет индексы
  collapseConsecutiveEmptyParagraphs(bodyChildren, paragraphs, enrichedMap);

  const newXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newXml);

  return (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;
}

/**
 * Нумерация заголовков: добавляет/исправляет номера в тексте заголовков.
 *
 * heading_1: 1, 2, 3...
 * heading_2: 1.1, 1.2, 2.1...
 * heading_3: 1.1.1, 1.1.2...
 * heading_4: 1.1.1.1...
 *
 * Пропускает структурные заголовки: ВВЕДЕНИЕ, ЗАКЛЮЧЕНИЕ, СПИСОК и т.п.
 */
function applyHeadingNumbering(
  paragraphs: { paragraphIndex: number; bodyIndex: number; node: OrderedXmlNode }[],
  enrichedMap: Map<number, DocxParagraph>,
  rules: FormattingRules
): void {
  // Проверяем, нужна ли нумерация
  if (!rules.headings.level1.numbering) return;

  // Структурные заголовки — не нумеруются
  const structuralHeadings = new Set([
    "введение", "заключение", "список литературы", "список использованных источников",
    "список источников", "содержание", "оглавление", "аннотация", "реферат",
    "приложение", "приложения", "abstract", "библиография",
    "список использованной литературы",
  ]);

  const counters = [0, 0, 0, 0]; // level1, level2, level3, level4

  for (const { paragraphIndex, node } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (!enriched?.blockType?.startsWith("heading_")) continue;

    const level = parseInt(enriched.blockType.split("_")[1]) - 1; // 0-based
    if (level < 0 || level > 3) continue;

    // Извлекаем текст
    const text = getFullParagraphText(node).trim();
    if (!text) continue;

    // Пропускаем структурные заголовки
    const textLower = text.replace(/^\d[\d.]*\s*/, "").trim().toLowerCase();
    if (structuralHeadings.has(textLower)) continue;

    // Обновляем счётчики
    counters[level]++;
    // Сбрасываем все уровни ниже текущего
    for (let i = level + 1; i < counters.length; i++) {
      counters[i] = 0;
    }

    // Формируем номер: 1, 1.1, 1.1.1, 1.1.1.1
    const numberParts = counters.slice(0, level + 1);
    const number = numberParts.join(".");

    // Удаляем существующий номер из текста (если есть)
    const cleanText = text.replace(/^\d[\d.]*\s*/, "").trim();

    // Записываем номер + текст в первый run
    setFirstRunText(node, `${number} ${cleanText}`);
  }

  const numbered = counters[0];
  if (numbered > 0) {
    console.log(`[cleanup] Numbered ${numbered} top-level headings (${counters.slice(0, 4).join("/")} at levels 1-4)`);
  }
}

/**
 * Очищает лишние пустые параграфы внутри ячеек таблиц.
 * Таблицы часто содержат пустые параграфы до/после контента.
 * Оставляем максимум 1 пустой параграф на границе контента.
 */
function cleanTableCellEmptyParagraphs(bodyChildren: OrderedXmlNode[]): void {
  let cleaned = 0;

  for (const node of bodyChildren) {
    if (!("w:tbl" in node)) continue;

    const rows = findChildren(node, "w:tr");
    for (const row of rows) {
      const cells = findChildren(row, "w:tc");
      for (const cell of cells) {
        const cellChildren = children(cell);
        const paragraphs = cellChildren.filter((c) => "w:p" in c);

        if (paragraphs.length <= 1) continue;

        // Находим индексы пустых параграфов
        const toRemove: number[] = [];
        let consecutiveEmpty = 0;

        for (let i = 0; i < cellChildren.length; i++) {
          if (!("w:p" in cellChildren[i])) continue;

          if (isParagraphEmpty(cellChildren[i])) {
            consecutiveEmpty++;
            // Удаляем 2+ подряд пустых
            if (consecutiveEmpty > 1) {
              toRemove.push(i);
            }
          } else {
            consecutiveEmpty = 0;
          }
        }

        // Удаляем лишние пустые (с конца, чтобы индексы не съехали)
        for (let i = toRemove.length - 1; i >= 0; i--) {
          // В ячейке таблицы должен остаться хотя бы 1 параграф
          const remainingP = cellChildren.filter((c) => "w:p" in c).length;
          if (remainingP > 1) {
            cellChildren.splice(toRemove[i], 1);
            cleaned++;
          }
        }
      }
    }
  }

  if (cleaned > 0) {
    console.log(`[cleanup] Removed ${cleaned} empty paragraphs from table cells`);
  }
}

/**
 * Ограничивает размеры drawing-элементов (картинки, графики).
 * Предотвращает overflow за пределы полей страницы.
 *
 * Ищет wp:extent с cx > MAX_DRAWING_WIDTH_EMU и масштабирует пропорционально.
 */
function clampDrawingSizes(bodyChildren: OrderedXmlNode[]): void {
  let clamped = 0;

  function processNode(node: OrderedXmlNode): void {
    // Ищем w:drawing в runs
    const childArr = children(node);
    for (const child of childArr) {
      if ("w:drawing" in child) {
        clampDrawing(child);
      } else if ("w:r" in child) {
        processNode(child);
      } else if ("w:p" in child) {
        processNode(child);
      } else if ("w:tbl" in child) {
        // Таблицы тоже могут содержать рисунки
        const rows = findChildren(child, "w:tr");
        for (const row of rows) {
          const cells = findChildren(row, "w:tc");
          for (const cell of cells) {
            const ps = findChildren(cell, "w:p");
            for (const p of ps) processNode(p);
          }
        }
      }
    }
  }

  function clampDrawing(drawing: OrderedXmlNode): void {
    // Ищем wp:inline и wp:anchor
    const inlines = findChildren(drawing, "wp:inline");
    const anchors = findChildren(drawing, "wp:anchor");

    for (const container of [...inlines, ...anchors]) {
      const extent = findChild(container, "wp:extent");
      if (!extent?.[":@"]) continue;

      const cx = parseInt(String(extent[":@"]["@_cx"] || "0"));
      if (cx <= MAX_DRAWING_WIDTH_EMU || cx === 0) continue;

      // Масштабируем пропорционально
      const cy = parseInt(String(extent[":@"]["@_cy"] || "0"));
      const scale = MAX_DRAWING_WIDTH_EMU / cx;
      const newCy = Math.round(cy * scale);

      extent[":@"]["@_cx"] = String(MAX_DRAWING_WIDTH_EMU);
      extent[":@"]["@_cy"] = String(newCy);

      // Также обновляем a:ext внутри a:xfrm (если есть)
      updateGraphicExtent(container, MAX_DRAWING_WIDTH_EMU, newCy);

      clamped++;
    }
  }

  for (const node of bodyChildren) {
    if ("w:p" in node) {
      processNode(node);
    } else if ("w:tbl" in node) {
      processNode(node);
    }
  }

  if (clamped > 0) {
    console.log(`[cleanup] Clamped ${clamped} oversized drawings to page width`);
  }
}

/**
 * Обновляет a:ext внутри a:xfrm → pic:spPr для синхронизации размеров.
 */
function updateGraphicExtent(
  container: OrderedXmlNode,
  cx: number,
  cy: number
): void {
  // a:graphic → a:graphicData → pic:pic → pic:spPr → a:xfrm → a:ext
  const graphic = findChild(container, "a:graphic");
  if (!graphic) return;
  const graphicData = findChild(graphic, "a:graphicData");
  if (!graphicData) return;
  const pic = findChild(graphicData, "pic:pic");
  if (!pic) return;
  const spPr = findChild(pic, "pic:spPr");
  if (!spPr) return;
  const xfrm = findChild(spPr, "a:xfrm");
  if (!xfrm) return;
  const ext = findChild(xfrm, "a:ext");
  if (ext?.[":@"]) {
    ext[":@"]["@_cx"] = String(cx);
    ext[":@"]["@_cy"] = String(cy);
  }
}

/**
 * Удаляет подряд идущие пустые параграфы (>2 → оставляет 1).
 * Не трогает title_page область и пространство перед heading_1.
 */
function collapseConsecutiveEmptyParagraphs(
  bodyChildren: OrderedXmlNode[],
  paragraphs: { paragraphIndex: number; bodyIndex: number; node: OrderedXmlNode }[],
  enrichedMap: Map<number, DocxParagraph>
): void {
  // Строим set bodyIndex для title_page (не трогаем)
  const titlePageIndices = new Set<number>();
  for (const { paragraphIndex, bodyIndex } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched?.blockType === "title_page") {
      titlePageIndices.add(bodyIndex);
    }
  }

  // Находим heading_1 bodyIndices (не удаляем пустые перед ними — spaceBefore)
  const heading1Indices = new Set<number>();
  for (const { paragraphIndex, bodyIndex } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched?.blockType === "heading_1") {
      heading1Indices.add(bodyIndex);
    }
  }

  const toRemove: number[] = [];
  let consecutiveEmpty = 0;

  for (let i = 0; i < bodyChildren.length; i++) {
    // Пропускаем не-параграфы (таблицы и т.д.)
    if (!("w:p" in bodyChildren[i])) {
      consecutiveEmpty = 0;
      continue;
    }

    // Не трогаем title_page область
    if (titlePageIndices.has(i)) {
      consecutiveEmpty = 0;
      continue;
    }

    if (isParagraphEmpty(bodyChildren[i])) {
      consecutiveEmpty++;
      // Удаляем 3+ подряд пустых (оставляем максимум 2)
      if (consecutiveEmpty > 2) {
        // Но не удаляем если следующий — heading_1 (ему нужно пространство)
        const nextNonEmpty = findNextNonEmpty(bodyChildren, i + 1);
        if (nextNonEmpty !== undefined && heading1Indices.has(nextNonEmpty)) {
          continue;
        }
        toRemove.push(i);
      }
    } else {
      consecutiveEmpty = 0;
    }
  }

  // Удаляем с конца
  for (let i = toRemove.length - 1; i >= 0; i--) {
    bodyChildren.splice(toRemove[i], 1);
  }

  if (toRemove.length > 0) {
    console.log(`[cleanup] Removed ${toRemove.length} excessive empty paragraphs`);
  }
}

// ── Helpers ──

function isParagraphEmpty(node: OrderedXmlNode): boolean {
  if (!("w:p" in node)) return false;
  const runs = findChildren(node, "w:r");
  if (runs.length === 0) return true;

  let text = "";
  for (const run of runs) {
    const tNodes = findChildren(run, "w:t");
    for (const t of tNodes) {
      text += getText(t);
    }
  }
  return text.trim().length === 0;
}

function getFullParagraphText(node: OrderedXmlNode): string {
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
 * Записывает текст в первый w:t первого w:r, очищает остальные w:t.
 */
function setFirstRunText(node: OrderedXmlNode, newText: string): void {
  const runs = getRuns(node);
  let written = false;

  for (const run of runs) {
    const tNodes = findChildren(run, "w:t");
    for (const t of tNodes) {
      if (!written) {
        setText(t, newText);
        // Устанавливаем xml:space="preserve" для сохранения пробелов
        if (!t[":@"]) t[":@"] = {};
        t[":@"]["@_xml:space"] = "preserve";
        written = true;
      } else {
        setText(t, "");
      }
    }
  }
}

function findNextNonEmpty(
  bodyChildren: OrderedXmlNode[],
  startIdx: number
): number | undefined {
  for (let i = startIdx; i < bodyChildren.length; i++) {
    if ("w:p" in bodyChildren[i] && !isParagraphEmpty(bodyChildren[i])) {
      return i;
    }
  }
  return undefined;
}
