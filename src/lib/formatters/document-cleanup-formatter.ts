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
  createNode,
  ensurePPr,
  removeChild,
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

  // 0. Объединение многострочных заголовков (до нумерации!)
  mergeMultilineHeadings(bodyChildren, paragraphs, enrichedMap);

  // 1. Нумерация заголовков
  applyHeadingNumbering(paragraphs, enrichedMap, rules);

  // 2. Очистка пустых параграфов внутри ячеек таблиц
  cleanTableCellEmptyParagraphs(bodyChildren);

  // 3. Ограничение размеров drawing (overflow prevention)
  clampDrawingSizes(bodyChildren);

  // 4. Универсальное схлопывание пробелов и двойных точек во ВСЕХ параграфах
  // (включая title_page, toc, table cells — текстовые фиксы пропускают их)
  collapseSpacesEverywhere(bodyChildren);

  // 5. Разрыв секции после титульной страницы (ГОСТ: нумерация начинается со 2-й стр.)
  insertSectionBreakAfterTitle(paragraphs, enrichedMap, bodyChildren);

  // 6. Удаление page breaks из пустых параграфов перед заголовками
  // heading_1 уже имеет pageBreakBefore — ручные page breaks создают пустую страницу
  removeRedundantPageBreaks(bodyChildren, paragraphs, enrichedMap);

  // 7. Удаление лишних пустых параграфов в body (>2 подряд → 1)
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
 * Объединяет многострочные заголовки.
 *
 * Проблема: пользователь нажал Enter внутри заголовка → два параграфа.
 * AI разметил первый как heading_N, второй как body_text.
 * В TOC попадёт только первая строка.
 *
 * Эвристика для определения продолжения:
 * - Следующий параграф идёт сразу после heading_N (bodyIndex + 1)
 * - blockType = body_text или unknown
 * - Текст заголовка не заканчивается типичным завершением (.!?)
 * - Следующий текст начинается с маленькой буквы, предлога, или союза
 * - Следующий текст короткий (<120 символов)
 * - Следующий параграф не содержит характерных признаков body_text (ссылки [1], формулы)
 */
/** Проверяет, может ли параграф быть продолжением heading */
function isContinuationCandidate(
  combinedText: string,
  nextText: string,
  nextType: string,
  headingIsUpperCase: boolean
): boolean {
  if (nextType !== "body_text" && nextType !== "unknown") return false;
  if (!nextText || nextText.length > 120) return false;
  if (/[.!?:;]$/.test(combinedText)) return false;
  if (/\[\d+/.test(nextText) || /^\d+\.\d+/.test(nextText)) return false;

  const startsLowerOrConnector = /^[а-яёa-z\-(]/.test(nextText) ||
    /^(?:и|в|на|с|по|из|к|о|об|от|у|для|при|без|над|под|до|за|через|между|а|но|или|что|как|где|который|которая|которое|которые)\s/i.test(nextText);
  if (startsLowerOrConnector) return true;
  if (headingIsUpperCase && /^[А-ЯЁA-Z]/.test(nextText)) return true;
  return false;
}

function mergeMultilineHeadings(
  bodyChildren: OrderedXmlNode[],
  paragraphs: { paragraphIndex: number; bodyIndex: number; node: OrderedXmlNode }[],
  enrichedMap: Map<number, DocxParagraph>
): void {
  const bodyIndexMap = new Map<number, typeof paragraphs[0]>();
  for (const p of paragraphs) bodyIndexMap.set(p.bodyIndex, p);

  const mergeGroups: Array<{ headingIdx: number; contIndices: number[] }> = [];

  for (const { paragraphIndex, bodyIndex, node } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (!enriched?.blockType?.startsWith("heading_")) continue;

    const headingText = getFullParagraphText(node).trim();
    if (!headingText || /[.!?:;]$/.test(headingText)) continue;

    const headingIsUpper = headingText === headingText.toUpperCase();
    const contIndices: number[] = [];
    let combined = headingText;
    let checkIdx = bodyIndex + 1;
    let emptyStreak = 0;

    while (checkIdx < bodyChildren.length) {
      const nextInfo = bodyIndexMap.get(checkIdx);
      if (!nextInfo) { checkIdx++; continue; }

      const nextText = getFullParagraphText(nextInfo.node).trim();
      if (!nextText) {
        emptyStreak++;
        if (emptyStreak > 1) break; // max 1 пустой подряд
        contIndices.push(checkIdx);
        checkIdx++;
        continue;
      }
      emptyStreak = 0;

      const nextEnriched = enrichedMap.get(nextInfo.paragraphIndex);
      const nextType = nextEnriched?.blockType || "unknown";
      if (!isContinuationCandidate(combined, nextText, nextType, headingIsUpper)) break;

      contIndices.push(checkIdx);
      combined += " " + nextText;
      checkIdx++;
    }

    // Убираем trailing пустые параграфы
    while (contIndices.length > 0 && !getFullParagraphText(bodyChildren[contIndices[contIndices.length - 1]]).trim()) {
      contIndices.pop();
    }
    if (contIndices.length > 0) mergeGroups.push({ headingIdx: bodyIndex, contIndices });
  }

  // Объединяем в обратном порядке (чтобы не сбить индексы)
  let totalMerged = 0;
  for (let i = mergeGroups.length - 1; i >= 0; i--) {
    const { headingIdx, contIndices } = mergeGroups[i];
    const headingNode = bodyChildren[headingIdx];
    if (!headingNode) continue;

    const headingRuns = getRuns(headingNode);
    if (headingRuns.length === 0) continue;

    const firstRPr = findChild(headingRuns[0], "w:rPr");
    const hChildren = children(headingNode);

    for (const contIdx of contIndices) {
      const contNode = bodyChildren[contIdx];
      if (!contNode) continue;
      const contRuns = getRuns(contNode);
      if (contRuns.length === 0) continue;

      hChildren.push(createNode("w:r", undefined, [
        ...(firstRPr ? [structuredCloneNode(firstRPr)] : []),
        createNode("w:t", { "xml:space": "preserve" }, [{ "#text": " " }]),
      ]));
      for (const run of contRuns) hChildren.push(run);
    }

    // Удаляем continuation в обратном порядке
    for (let j = contIndices.length - 1; j >= 0; j--) {
      bodyChildren.splice(contIndices[j], 1);
    }

    totalMerged++;
    const mergedText = getFullParagraphText(headingNode).trim();
    console.log(`[cleanup] Merged multiline heading at bodyIndex ${headingIdx}: "${mergedText.substring(0, 60)}..."`);
  }

  if (totalMerged > 0) console.log(`[cleanup] Merged ${totalMerged} multiline heading(s)`);
}

/**
 * Глубокое копирование XML-узла (для клонирования rPr)
 */
function structuredCloneNode(node: OrderedXmlNode): OrderedXmlNode {
  return JSON.parse(JSON.stringify(node));
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
    "список использованной литературы", "выводы",
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

    // Пропускаем структурные заголовки (убираем номер, точки, пробелы)
    const textLower = text.replace(/^(?:глава\s+)?\d[\d.\s]*/i, "").trim().replace(/\.+$/, "").toLowerCase();
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
    // Обрабатываем сложные форматы: "1. 1 Текст", "1.1. Текст", "Глава 1 Текст"
    const cleanText = text
      .replace(/^(?:глава\s+)?\d[\d.\s]*(?:\.\s*)?/i, "")
      .trim();

    // Записываем номер + текст в первый run
    setFirstRunText(node, `${number} ${cleanText}`);
  }

  const numbered = counters[0];
  if (numbered > 0) {
    console.log(`[cleanup] Numbered ${numbered} top-level headings (${counters.slice(0, 4).join("/")} at levels 1-4)`);
  }
}

/**
 * Очищает ВСЕ пустые параграфы внутри ячеек таблиц.
 *
 * Удаляет любой пустой параграф: leading, trailing и внутри контента.
 * В ячейке всегда остаётся минимум 1 параграф (требование Word).
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
        const paraIndices: number[] = [];
        for (let i = 0; i < cellChildren.length; i++) {
          if ("w:p" in cellChildren[i]) paraIndices.push(i);
        }

        if (paraIndices.length <= 1) continue;

        // Собираем ВСЕ пустые параграфы для удаления
        const toRemove: number[] = [];
        for (const idx of paraIndices) {
          if (isParagraphEmpty(cellChildren[idx])) {
            toRemove.push(idx);
          }
        }

        // Удаляем с конца, сохраняя минимум 1 параграф
        const sorted = toRemove.sort((a, b) => b - a);
        for (const idx of sorted) {
          const remainingP = cellChildren.filter((c) => "w:p" in c).length;
          if (remainingP > 1) {
            cellChildren.splice(idx, 1);
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
 * Вставляет разрыв секции (w:sectPr) в последний параграф title_page.
 * ГОСТ: нумерация страниц начинается со 2-й страницы,
 * для этого нужен section break после титульной.
 *
 * Титульная страница получает равные боковые поля (20мм/20мм) для корректного
 * центрирования текста. Основной документ использует стандартные ГОСТ-поля (30/15).
 */
function insertSectionBreakAfterTitle(
  paragraphs: { paragraphIndex: number; bodyIndex: number; node: OrderedXmlNode }[],
  enrichedMap: Map<number, DocxParagraph>,
  bodyChildren: OrderedXmlNode[]
): void {
  // Находим последний title_page* параграф (включая подтипы)
  let lastTitlePara: OrderedXmlNode | null = null;
  for (const { paragraphIndex, node } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched?.blockType?.startsWith("title_page")) {
      lastTitlePara = node;
    }
  }
  if (!lastTitlePara) return;

  // Проверяем, есть ли уже sectPr
  const pPr = findChild(lastTitlePara, "w:pPr");
  if (pPr && findChild(pPr, "w:sectPr")) return; // Уже есть

  // Секция титульной страницы: равные боковые поля для визуального центрирования
  // top=20мм, bottom=20мм, left=20мм, right=20мм
  const TITLE_MARGIN_MM = 20;
  const titleMarginTwips = String(Math.round(TITLE_MARGIN_MM * 56.7));

  const sectPrNode: OrderedXmlNode = {
    "w:sectPr": [
      {
        "w:pgSz": [],
        ":@": { "@_w:w": "11906", "@_w:h": "16838" }, // A4
      },
      {
        "w:pgMar": [],
        ":@": {
          "@_w:top": titleMarginTwips,
          "@_w:right": titleMarginTwips,
          "@_w:bottom": titleMarginTwips,
          "@_w:left": titleMarginTwips,
          "@_w:header": "709",
          "@_w:footer": "709",
          "@_w:gutter": "0",
        },
      },
      {
        "w:pgNumType": [],
        ":@": { "@_w:start": "1" },
      },
    ],
    ":@": { "@_w:type": "nextPage" },
  };

  // Вставляем в pPr последнего title_page параграфа
  const targetPPr = ensurePPr(lastTitlePara);
  children(targetPPr).push(sectPrNode);
  console.log("[cleanup] Inserted section break after title page (equal margins: 20mm all sides)");
}

/**
 * Удаляет ручные page breaks (w:br type="page") из пустых параграфов
 * и из последних параграфов перед heading_1.
 *
 * Проблема: heading_1 уже имеет w:pageBreakBefore (newPageForEach).
 * Если перед ним есть пустой параграф с w:br type="page",
 * получается пустая страница между разделами.
 */
function removeRedundantPageBreaks(
  bodyChildren: OrderedXmlNode[],
  paragraphs: { paragraphIndex: number; bodyIndex: number; node: OrderedXmlNode }[],
  enrichedMap: Map<number, DocxParagraph>
): void {
  // Строим set heading bodyIndices
  const headingIndices = new Set<number>();
  for (const { paragraphIndex, bodyIndex } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    if (enriched?.blockType?.startsWith("heading_")) {
      headingIndices.add(bodyIndex);
    }
  }

  let removed = 0;

  for (let i = 0; i < bodyChildren.length; i++) {
    if (!("w:p" in bodyChildren[i])) continue;

    // Проверяем: это пустой параграф или последний перед heading?
    const isBeforeHeading = headingIndices.has(i + 1) || headingIndices.has(i + 2);

    if (!isParagraphEmpty(bodyChildren[i]) && !isBeforeHeading) continue;

    // Ищем и удаляем w:br type="page" из runs
    const runs = findChildren(bodyChildren[i], "w:r");
    for (const run of runs) {
      const runCh = children(run);
      for (let j = runCh.length - 1; j >= 0; j--) {
        if ("w:br" in runCh[j]) {
          const brType = runCh[j][":@"]?.["@_w:type"];
          if (brType === "page") {
            runCh.splice(j, 1);
            removed++;
          }
        }
      }
    }

    // Также удаляем w:pageBreakBefore из pPr (если это не heading)
    if (!headingIndices.has(i)) {
      const pPr = findChild(bodyChildren[i], "w:pPr");
      if (pPr) {
        removeChild(pPr, "w:pageBreakBefore");
      }
    }
  }

  if (removed > 0) {
    console.log(`[cleanup] Removed ${removed} redundant page breaks before headings`);
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
    if (enriched?.blockType?.startsWith("title_page")) {
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

/**
 * Схлопывает множественные пробелы и двойные точки во ВСЕХ параграфах документа.
 *
 * Применяется ко ВСЕМ параграфам без исключения (включая title_page, toc, таблицы),
 * потому что множественные пробелы — всегда артефакт, никогда не намеренное форматирование.
 *
 * Обрабатывает: body-level параграфы + параграфы внутри таблиц.
 */
function collapseSpacesEverywhere(bodyChildren: OrderedXmlNode[]): void {
  let fixed = 0;

  function fixParagraph(node: OrderedXmlNode): void {
    if (!("w:p" in node)) return;
    const runs = getRuns(node);
    for (const run of runs) {
      const tNodes = findChildren(run, "w:t");
      for (const t of tNodes) {
        const text = getText(t);
        if (!text) continue;

        let newText = text;
        // Множественные обычные пробелы → один
        newText = newText.replace(/ {2,}/g, " ");
        // Двойные точки (не часть троеточия) → одна
        newText = newText.replace(/(?<!\.)\.\.(?!\.)/g, ".");

        if (newText !== text) {
          setText(t, newText);
          fixed++;
        }
      }
    }
  }

  for (const node of bodyChildren) {
    if ("w:p" in node) {
      fixParagraph(node);
    } else if ("w:tbl" in node) {
      const rows = findChildren(node, "w:tr");
      for (const row of rows) {
        const cells = findChildren(row, "w:tc");
        for (const cell of cells) {
          const cellParas = findChildren(cell, "w:p");
          for (const p of cellParas) {
            fixParagraph(p);
          }
        }
      }
    }
  }

  if (fixed > 0) {
    console.log(`[cleanup] Collapsed spaces/dots in ${fixed} text nodes`);
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
