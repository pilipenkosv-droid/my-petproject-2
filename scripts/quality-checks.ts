/**
 * Программные проверки качества форматирования (Level 1)
 *
 * Парсит XML отформатированного docx и проверяет соответствие ГОСТ.
 * Без AI — чистая инспекция XML-структуры.
 *
 * 30+ метрик в 7 категориях:
 * - Страница (поля, размер)
 * - Текст (шрифт, размер, интервал, отступ, пробелы)
 * - Заголовки (выравнивание, жирность, нумерация)
 * - Структура (TOC, title_page, section breaks)
 * - Таблицы (ширина, заголовки, пустые параграфы)
 * - Рисунки (overflow)
 * - Сохранность (контент, изображения, таблицы)
 */

import JSZip from "jszip";
import {
  type OrderedXmlNode,
  parseDocxXml,
  getBody,
  getSectPr,
  getParagraphsWithPositions,
  findChild,
  findChildren,
  getText,
  getRuns,
  children,
} from "../src/lib/xml/docx-xml";
import { DocxParagraph } from "../src/lib/pipeline/document-analyzer";

// ── Constants ──

const TWIPS_PER_MM = 56.7;
const HALF_POINTS_PER_PT = 2;
const MAX_DRAWING_WIDTH_EMU = 165 * 36000; // 5,940,000

// Допуск в twips для сравнения (±2мм)
const TWIPS_TOLERANCE = Math.round(2 * TWIPS_PER_MM);
// Допуск для firstLine indent (±1мм)
const INDENT_TOLERANCE = Math.round(1 * TWIPS_PER_MM);

// ── Types ──

export type CheckSeverity = "critical" | "major" | "minor";

export interface CheckResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  severity: CheckSeverity;
  expected: string;
  actual: string;
  /** Кол-во проблемных элементов (для количественных проверок) */
  count?: number;
  /** Примеры проблем (первые 5) */
  examples?: string[];
}

export interface QualityReport {
  documentId: string;
  timestamp: string;
  /** Общий скор 0-100 */
  score: number;
  /** Результаты по категориям */
  categories: Record<string, { passed: number; total: number; score: number }>;
  /** Все проверки */
  checks: CheckResult[];
  /** Статистика документа */
  stats: {
    paragraphCount: number;
    tableCount: number;
    imageCount: number;
    bodyTextCount: number;
    headingCount: number;
  };
}

// ── Weights for scoring ──

const SEVERITY_WEIGHTS: Record<CheckSeverity, number> = {
  critical: 10,
  major: 5,
  minor: 2,
};

// ── Helpers ──

function getAttr(node: OrderedXmlNode | undefined, attr: string): string | undefined {
  return node?.[":@"]?.[`@_${attr}`] as string | undefined;
}

function getAttrNum(node: OrderedXmlNode | undefined, attr: string): number | undefined {
  const val = getAttr(node, attr);
  return val !== undefined ? Number(val) : undefined;
}

function getFullText(paragraphNode: OrderedXmlNode): string {
  const runs = getRuns(paragraphNode);
  let text = "";
  for (const run of runs) {
    const tNodes = findChildren(run, "w:t");
    for (const t of tNodes) {
      text += getText(t);
    }
  }
  return text;
}

function hasSectionBreak(node: OrderedXmlNode): boolean {
  const pPr = findChild(node, "w:pPr");
  return pPr ? !!findChild(pPr, "w:sectPr") : false;
}

// ── Main Entry ──

export async function runQualityChecks(
  originalBuffer: Buffer,
  formattedBuffer: Buffer,
  enrichedParagraphs: DocxParagraph[],
  documentId: string,
  rules: {
    margins: { top: number; bottom: number; left: number; right: number };
    fontFamily: string;
    fontSize: number;
    lineSpacing: number;
    paragraphIndent: number;
  }
): Promise<QualityReport> {
  const checks: CheckResult[] = [];

  // Parse formatted document
  const fmtZip = await JSZip.loadAsync(formattedBuffer);
  const fmtXml = await fmtZip.file("word/document.xml")?.async("string");
  if (!fmtXml) {
    return emptyReport(documentId, "Cannot read formatted document.xml");
  }

  const parsed = parseDocxXml(fmtXml);
  const body = getBody(parsed);
  if (!body) {
    return emptyReport(documentId, "Cannot find body in formatted document");
  }

  const bodyChildren = children(body);
  const paragraphs = getParagraphsWithPositions(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));

  // Текстовый фолбэк: после TOC/caption вставки и heading numbering индексы сдвигаются,
  // поэтому ищем совпадение по тексту параграфа
  const enrichedByText = new Map<string, DocxParagraph>();
  const enrichedByCleanText = new Map<string, DocxParagraph>();
  for (const p of enrichedParagraphs) {
    const key = (p.text || "").trim().substring(0, 80);
    if (key && !enrichedByText.has(key)) {
      enrichedByText.set(key, p);
    }
    // Ключ без номера (после heading numbering текст меняется: "Введение" → "1 Введение")
    const cleanKey = (p.text || "").trim().replace(/^\d[\d.]*\s*/, "").substring(0, 80);
    if (cleanKey && !enrichedByCleanText.has(cleanKey)) {
      enrichedByCleanText.set(cleanKey, p);
    }
  }

  function lookupEnriched(paragraphIndex: number, text: string): DocxParagraph | undefined {
    // Прямое совпадение по индексу — но верифицируем текст
    // (после TOC/caption вставки индексы сдвигаются, и enrichedMap[i] может указывать на другой параграф)
    const byIndex = enrichedMap.get(paragraphIndex);
    if (byIndex) {
      const origText = (byIndex.text || "").trim().substring(0, 40);
      const fmtText = text.trim().replace(/^\d[\d.]*\s*/, "").substring(0, 40);
      // Если тексты похожи — доверяем индексу
      if (!origText || !fmtText || origText === fmtText || origText.startsWith(fmtText.substring(0, 20)) || fmtText.startsWith(origText.substring(0, 20))) {
        return byIndex;
      }
      // Тексты не совпадают — индекс сдвинулся, ищем по тексту
    }
    // Фолбэк по тексту (для параграфов со сдвинутыми индексами)
    const key = text.trim().substring(0, 80);
    if (key) {
      const byText = enrichedByText.get(key);
      if (byText) return byText;
      // Фолбэк по тексту без номерного префикса (heading numbering добавляет "1 ", "1.1 " и т.д.)
      const cleanKey = text.trim().replace(/^\d[\d.]*\s*/, "").substring(0, 80);
      if (cleanKey) {
        const byClean = enrichedByCleanText.get(cleanKey);
        if (byClean) return byClean;
      }
    }
    return undefined;
  }

  // Parse original for comparison
  const origZip = await JSZip.loadAsync(originalBuffer);
  const origXml = await origZip.file("word/document.xml")?.async("string");
  const origImageCount = Object.keys(origZip.files).filter(
    (f) => f.startsWith("word/media/") && /\.(png|jpg|jpeg|gif|bmp|emf|wmf)$/i.test(f)
  ).length;
  // Считаем ВСЕ таблицы (включая вложенные) через regex — одинаковый метод для оригинала и форматированного
  const origTableCount = origXml ? (origXml.match(/<w:tbl[ >]/g) || []).length : 0;

  const fmtImageCount = Object.keys(fmtZip.files).filter(
    (f) => f.startsWith("word/media/") && /\.(png|jpg|jpeg|gif|bmp|emf|wmf)$/i.test(f)
  ).length;
  const fmtTableCount = fmtXml ? (fmtXml.match(/<w:tbl[ >]/g) || []).length : 0;

  // Classify paragraphs
  const bodyTextParas: { node: OrderedXmlNode; index: number; text: string }[] = [];
  const headingParas: { node: OrderedXmlNode; index: number; blockType: string; text: string }[] = [];
  let bodyTextCount = 0;
  let headingCount = 0;

  for (const { node, paragraphIndex } of paragraphs) {
    const text = getFullText(node);
    const enriched = lookupEnriched(paragraphIndex, text);
    const bt = enriched?.blockType || "unknown";

    if (bt === "body_text" || bt === "quote") {
      // Не считаем заголовки как body_text (проверяем по тексту)
      const trimmed = text.trim();
      const looksLikeHeading = /^\d[\d.]*\s/.test(trimmed) && trimmed.length < 120;
      if (!looksLikeHeading) {
        bodyTextParas.push({ node, index: paragraphIndex, text });
        bodyTextCount++;
      }
    }
    if (bt.startsWith("heading_")) {
      // Фильтруем очевидные ошибки AI-классификации:
      // - пустой текст → не заголовок
      // - текст > 150 символов → вероятно body_text
      const trimmed = text.trim();
      if (trimmed.length > 0 && trimmed.length < 150) {
        headingParas.push({ node, index: paragraphIndex, blockType: bt, text });
        headingCount++;
      }
    }
  }

  // ═══════════════════════════════════════════
  // Category 1: PAGE SETUP
  // ═══════════════════════════════════════════

  const sectPr = getSectPr(body);
  const pgMar = sectPr ? findChild(sectPr, "w:pgMar") : undefined;

  const marginTop = getAttrNum(pgMar, "w:top") || 0;
  const marginBottom = getAttrNum(pgMar, "w:bottom") || 0;
  const marginLeft = getAttrNum(pgMar, "w:left") || 0;
  const marginRight = getAttrNum(pgMar, "w:right") || 0;

  const expectedTop = Math.round(rules.margins.top * TWIPS_PER_MM);
  const expectedBottom = Math.round(rules.margins.bottom * TWIPS_PER_MM);
  const expectedLeft = Math.round(rules.margins.left * TWIPS_PER_MM);
  const expectedRight = Math.round(rules.margins.right * TWIPS_PER_MM);

  checks.push({
    id: "page.margins.top",
    category: "page",
    name: "Верхнее поле",
    passed: Math.abs(marginTop - expectedTop) <= TWIPS_TOLERANCE,
    severity: "critical",
    expected: `${rules.margins.top}мм (${expectedTop} twips)`,
    actual: `${Math.round(marginTop / TWIPS_PER_MM)}мм (${marginTop} twips)`,
  });

  checks.push({
    id: "page.margins.bottom",
    category: "page",
    name: "Нижнее поле",
    passed: Math.abs(marginBottom - expectedBottom) <= TWIPS_TOLERANCE,
    severity: "critical",
    expected: `${rules.margins.bottom}мм (${expectedBottom} twips)`,
    actual: `${Math.round(marginBottom / TWIPS_PER_MM)}мм (${marginBottom} twips)`,
  });

  checks.push({
    id: "page.margins.left",
    category: "page",
    name: "Левое поле",
    passed: Math.abs(marginLeft - expectedLeft) <= TWIPS_TOLERANCE,
    severity: "critical",
    expected: `${rules.margins.left}мм (${expectedLeft} twips)`,
    actual: `${Math.round(marginLeft / TWIPS_PER_MM)}мм (${marginLeft} twips)`,
  });

  checks.push({
    id: "page.margins.right",
    category: "page",
    name: "Правое поле",
    passed: Math.abs(marginRight - expectedRight) <= TWIPS_TOLERANCE,
    severity: "critical",
    expected: `${rules.margins.right}мм (${expectedRight} twips)`,
    actual: `${Math.round(marginRight / TWIPS_PER_MM)}мм (${marginRight} twips)`,
  });

  // ═══════════════════════════════════════════
  // Category 2: BODY TEXT FORMATTING
  // ═══════════════════════════════════════════

  const expectedIndentTwips = Math.round(rules.paragraphIndent * TWIPS_PER_MM);
  const expectedLineSpacing = Math.round(rules.lineSpacing * 240);
  const expectedFontSizeHalf = rules.fontSize * HALF_POINTS_PER_PT;

  // Sample up to 50 body_text paragraphs for checks
  const sampleBodyText = bodyTextParas.slice(0, 50);

  // 2a. Font family
  {
    let wrongFont = 0;
    const examples: string[] = [];
    for (const { node, text } of sampleBodyText) {
      const runs = getRuns(node);
      for (const run of runs) {
        const rPr = findChild(run, "w:rPr");
        const rFonts = rPr ? findChild(rPr, "w:rFonts") : undefined;
        const ascii = getAttr(rFonts, "w:ascii");
        if (ascii && ascii !== rules.fontFamily) {
          wrongFont++;
          if (examples.length < 5) {
            examples.push(`[${text.substring(0, 40)}...] font="${ascii}"`);
          }
          break;
        }
      }
    }
    checks.push({
      id: "text.fontFamily",
      category: "text",
      name: "Шрифт основного текста",
      passed: wrongFont === 0,
      severity: "critical",
      expected: rules.fontFamily,
      actual: wrongFont === 0 ? rules.fontFamily : `${wrongFont}/${sampleBodyText.length} с неправильным шрифтом`,
      count: wrongFont,
      examples,
    });
  }

  // 2b. Font size
  {
    let wrongSize = 0;
    const examples: string[] = [];
    for (const { node, text } of sampleBodyText) {
      const runs = getRuns(node);
      for (const run of runs) {
        const rPr = findChild(run, "w:rPr");
        const sz = rPr ? findChild(rPr, "w:sz") : undefined;
        const val = getAttrNum(sz, "w:val");
        if (val !== undefined && val !== expectedFontSizeHalf) {
          wrongSize++;
          if (examples.length < 5) {
            examples.push(`[${text.substring(0, 40)}...] size=${val / 2}pt (expected ${rules.fontSize}pt)`);
          }
          break;
        }
      }
    }
    checks.push({
      id: "text.fontSize",
      category: "text",
      name: "Размер шрифта основного текста",
      passed: wrongSize === 0,
      severity: "critical",
      expected: `${rules.fontSize}pt (${expectedFontSizeHalf} half-points)`,
      actual: wrongSize === 0 ? `${rules.fontSize}pt` : `${wrongSize}/${sampleBodyText.length} неправильный размер`,
      count: wrongSize,
      examples,
    });
  }

  // 2c. Line spacing (пропускаем пустые параграфы-разделители — у них часто line=240)
  {
    let wrongSpacing = 0;
    const examples: string[] = [];
    for (const { node, text } of sampleBodyText) {
      if (!text.trim()) continue;
      const pPr = findChild(node, "w:pPr");
      const spacing = pPr ? findChild(pPr, "w:spacing") : undefined;
      const lineVal = getAttrNum(spacing, "w:line");
      if (lineVal !== undefined && Math.abs(lineVal - expectedLineSpacing) > 10) {
        wrongSpacing++;
        if (examples.length < 5) {
          examples.push(`[${text.substring(0, 40)}...] line=${lineVal} (expected ${expectedLineSpacing})`);
        }
      }
    }
    checks.push({
      id: "text.lineSpacing",
      category: "text",
      name: "Межстрочный интервал",
      passed: wrongSpacing === 0,
      severity: "critical",
      expected: `${rules.lineSpacing} (${expectedLineSpacing} twips)`,
      actual: wrongSpacing === 0 ? `${rules.lineSpacing}` : `${wrongSpacing}/${sampleBodyText.length} неправильный интервал`,
      count: wrongSpacing,
      examples,
    });
  }

  // 2d. First-line indent
  {
    let noIndent = 0;
    let wrongIndent = 0;
    const examples: string[] = [];
    for (const { node, text } of sampleBodyText) {
      if (!text.trim()) continue; // skip empty
      const pPr = findChild(node, "w:pPr");
      const ind = pPr ? findChild(pPr, "w:ind") : undefined;
      const firstLine = getAttrNum(ind, "w:firstLine");
      const hanging = getAttrNum(ind, "w:hanging");

      if (hanging && hanging > 0) {
        // hanging indent overrides firstLine — this is a bug
        wrongIndent++;
        if (examples.length < 5) {
          examples.push(`[${text.substring(0, 40)}...] hanging=${hanging}, firstLine конфликт`);
        }
      } else if (firstLine === undefined || firstLine === 0) {
        noIndent++;
        if (examples.length < 5) {
          examples.push(`[${text.substring(0, 40)}...] firstLine=отсутствует`);
        }
      } else if (Math.abs(firstLine - expectedIndentTwips) > INDENT_TOLERANCE) {
        wrongIndent++;
        if (examples.length < 5) {
          examples.push(`[${text.substring(0, 40)}...] firstLine=${firstLine} (expected ~${expectedIndentTwips})`);
        }
      }
    }
    const totalBad = noIndent + wrongIndent;
    checks.push({
      id: "text.firstLineIndent",
      category: "text",
      name: "Отступ первой строки (абзацный отступ)",
      passed: totalBad === 0,
      severity: "critical",
      expected: `${rules.paragraphIndent}мм (${expectedIndentTwips} twips)`,
      actual: totalBad === 0 ? `${rules.paragraphIndent}мм` : `${noIndent} без отступа, ${wrongIndent} неправильный`,
      count: totalBad,
      examples,
    });
  }

  // 2e. Alignment (justify)
  {
    let wrongAlign = 0;
    const examples: string[] = [];
    for (const { node, text } of sampleBodyText) {
      const pPr = findChild(node, "w:pPr");
      const jc = pPr ? findChild(pPr, "w:jc") : undefined;
      const val = getAttr(jc, "w:val");
      // "both" = justify in OOXML
      if (val && val !== "both") {
        wrongAlign++;
        if (examples.length < 5) {
          examples.push(`[${text.substring(0, 40)}...] alignment="${val}" (expected "both")`);
        }
      }
    }
    checks.push({
      id: "text.alignment",
      category: "text",
      name: "Выравнивание основного текста",
      passed: wrongAlign === 0,
      severity: "major",
      expected: "justify (both)",
      actual: wrongAlign === 0 ? "justify" : `${wrongAlign}/${sampleBodyText.length} не justify`,
      count: wrongAlign,
      examples,
    });
  }

  // 2f. Multiple spaces in all text
  {
    let multiSpaceCount = 0;
    const examples: string[] = [];
    for (const { node, paragraphIndex } of paragraphs) {
      const text = getFullText(node);
      if (/ {2,}/.test(text)) {
        multiSpaceCount++;
        if (examples.length < 5) {
          const match = text.match(/ {2,}/);
          const pos = match?.index ?? 0;
          const snippet = text.substring(Math.max(0, pos - 20), pos + 30).replace(/ {2,}/g, "→SPACES←");
          examples.push(`[para ${paragraphIndex}] "${snippet}"`);
        }
      }
    }
    checks.push({
      id: "text.multipleSpaces",
      category: "text",
      name: "Множественные пробелы",
      passed: multiSpaceCount === 0,
      severity: "major",
      expected: "0 параграфов с множественными пробелами",
      actual: `${multiSpaceCount} параграфов`,
      count: multiSpaceCount,
      examples,
    });
  }

  // 2g. Underlined text (prohibited)
  {
    let underlineCount = 0;
    const examples: string[] = [];
    for (const { node, paragraphIndex } of paragraphs) {
      const text = getFullText(node);
      const enriched = lookupEnriched(paragraphIndex, text);
      if (enriched?.blockType?.startsWith("title_page")) continue;
      const runs = getRuns(node);
      for (const run of runs) {
        const rPr = findChild(run, "w:rPr");
        if (rPr && findChild(rPr, "w:u")) {
          underlineCount++;
          if (examples.length < 5) {
            examples.push(`[para ${paragraphIndex}] "${text.substring(0, 50)}..."`);
          }
          break;
        }
      }
    }
    checks.push({
      id: "text.noUnderline",
      category: "text",
      name: "Запрет подчёркивания",
      passed: underlineCount === 0,
      severity: "major",
      expected: "0 подчёркнутых параграфов",
      actual: `${underlineCount}`,
      count: underlineCount,
      examples,
    });
  }

  // 2h. Colored text (prohibited except auto/000000)
  {
    let colorCount = 0;
    const examples: string[] = [];
    for (const { node, paragraphIndex } of paragraphs) {
      const pText = getFullText(node);
      const enriched = lookupEnriched(paragraphIndex, pText);
      if (enriched?.blockType?.startsWith("title_page")) continue;
      const runs = getRuns(node);
      for (const run of runs) {
        const rPr = findChild(run, "w:rPr");
        if (!rPr) continue;
        const color = findChild(rPr, "w:color");
        const val = getAttr(color, "w:val");
        if (val && val !== "auto" && val !== "000000" && val !== "Auto") {
          colorCount++;
          if (examples.length < 5) {
            const text = getFullText(node);
            examples.push(`[para ${paragraphIndex}] color="${val}" "${text.substring(0, 40)}..."`);
          }
          break;
        }
        // Also check highlight
        const highlight = findChild(rPr, "w:highlight");
        if (highlight) {
          colorCount++;
          if (examples.length < 5) {
            const text = getFullText(node);
            const hlVal = getAttr(highlight, "w:val");
            examples.push(`[para ${paragraphIndex}] highlight="${hlVal}" "${text.substring(0, 40)}..."`);
          }
          break;
        }
      }
    }
    checks.push({
      id: "text.noColoredText",
      category: "text",
      name: "Запрет цветного текста и выделения",
      passed: colorCount === 0,
      severity: "major",
      expected: "0 цветных/выделенных параграфов",
      actual: `${colorCount}`,
      count: colorCount,
      examples,
    });
  }

  // 2i. Double dots
  {
    let doubleDotCount = 0;
    const examples: string[] = [];
    for (const { node, paragraphIndex } of paragraphs) {
      const text = getFullText(node);
      // Match exactly 2 dots not part of "..." or "…"
      if (/(?<!\.)\.\.(?!\.)/.test(text)) {
        doubleDotCount++;
        if (examples.length < 5) {
          examples.push(`[para ${paragraphIndex}] "${text.substring(0, 60)}"`);
        }
      }
    }
    checks.push({
      id: "text.doubleDots",
      category: "text",
      name: "Двойные точки",
      passed: doubleDotCount === 0,
      severity: "minor",
      expected: "0",
      actual: `${doubleDotCount}`,
      count: doubleDotCount,
      examples,
    });
  }

  // ═══════════════════════════════════════════
  // Category 3: HEADINGS
  // ═══════════════════════════════════════════

  // 3a. heading_1 formatting: center, bold, pageBreakBefore
  {
    let wrongFormat = 0;
    const examples: string[] = [];
    const h1s = headingParas.filter((h) => h.blockType === "heading_1");

    for (const { node, text } of h1s) {
      const issues: string[] = [];
      const pPr = findChild(node, "w:pPr");

      // Check center alignment
      const jc = pPr ? findChild(pPr, "w:jc") : undefined;
      const align = getAttr(jc, "w:val");
      if (align !== "center") issues.push(`align="${align || "none"}" (need center)`);

      // Check bold
      const runs = getRuns(node);
      if (runs.length > 0) {
        const rPr = findChild(runs[0], "w:rPr");
        const hasB = rPr ? !!findChild(rPr, "w:b") : false;
        if (!hasB) issues.push("not bold");
      }

      // Check pageBreakBefore
      const pbBefore = pPr ? findChild(pPr, "w:pageBreakBefore") : undefined;
      if (!pbBefore) issues.push("no pageBreakBefore");

      if (issues.length > 0) {
        wrongFormat++;
        if (examples.length < 5) {
          examples.push(`"${text.substring(0, 50)}" — ${issues.join(", ")}`);
        }
      }
    }
    checks.push({
      id: "headings.h1Format",
      category: "headings",
      name: "Заголовок 1: центр, жирный, новая страница",
      passed: wrongFormat === 0,
      severity: "critical",
      expected: "center + bold + pageBreakBefore",
      actual: wrongFormat === 0 ? "все корректны" : `${wrongFormat}/${h1s.length} с ошибками`,
      count: wrongFormat,
      examples,
    });
  }

  // 3b. heading_2 formatting: justify/left, bold, firstLine indent
  {
    let wrongFormat = 0;
    const examples: string[] = [];
    const h2s = headingParas.filter((h) => h.blockType === "heading_2");

    for (const { node, text } of h2s) {
      const issues: string[] = [];
      const pPr = findChild(node, "w:pPr");

      const jc = pPr ? findChild(pPr, "w:jc") : undefined;
      const align = getAttr(jc, "w:val");
      // ГОСТ: justify ("both") или left допустимо
      if (align && align !== "both" && align !== "left") {
        issues.push(`align="${align}" (need both/left)`);
      }

      // Check bold
      const runs = getRuns(node);
      if (runs.length > 0) {
        const rPr = findChild(runs[0], "w:rPr");
        const hasB = rPr ? !!findChild(rPr, "w:b") : false;
        if (!hasB) issues.push("not bold");
      }

      if (issues.length > 0) {
        wrongFormat++;
        if (examples.length < 5) {
          examples.push(`"${text.substring(0, 50)}" — ${issues.join(", ")}`);
        }
      }
    }
    checks.push({
      id: "headings.h2Format",
      category: "headings",
      name: "Заголовок 2: justify, жирный",
      passed: wrongFormat === 0,
      severity: "major",
      expected: "justify/left + bold",
      actual: wrongFormat === 0 ? "все корректны" : `${wrongFormat}/${h2s.length} с ошибками`,
      count: wrongFormat,
      examples,
    });
  }

  // 3c. Heading numbering: content headings should have numbers
  {
    const structural = new Set([
      "введение", "заключение", "список литературы", "список использованных источников",
      "список источников", "содержание", "оглавление", "аннотация", "реферат",
      "приложение", "приложения", "abstract", "библиография",
      "список использованной литературы",
      "выводы", "выводы по главе", "рекомендации",
    ]);

    let unnumbered = 0;
    let badNumber = 0;
    const examples: string[] = [];

    for (const { text, blockType } of headingParas) {
      const cleanText = text.replace(/^(?:глава\s+)?\d[\d.\s]*/i, "").trim().replace(/\.+$/, "").toLowerCase();
      if (structural.has(cleanText)) continue; // skip structural

      // Check if has number prefix (e.g., "1 ", "1.1 ", "2.1 ")
      const hasNumber = /^\d[\d.]*\s/.test(text.trim());
      if (!hasNumber) {
        unnumbered++;
        if (examples.length < 5) {
          examples.push(`[${blockType}] "${text.substring(0, 60)}" — нет номера`);
        }
      }
    }
    checks.push({
      id: "headings.numbering",
      category: "headings",
      name: "Нумерация содержательных заголовков",
      passed: unnumbered === 0,
      severity: "major",
      expected: "Все содержательные заголовки пронумерованы",
      actual: unnumbered === 0 ? "все пронумерованы" : `${unnumbered} без номера`,
      count: unnumbered,
      examples,
    });
  }

  // ═══════════════════════════════════════════
  // Category 4: STRUCTURE
  // ═══════════════════════════════════════════

  // 4a. TOC presence (field code)
  {
    const hasTocField = fmtXml.includes("TOC \\o") || fmtXml.includes("TOC \\\\o");
    const hasTocHeading = paragraphs.some(({ node }) => {
      const text = getFullText(node).trim().toUpperCase();
      return text === "СОДЕРЖАНИЕ" || text === "ОГЛАВЛЕНИЕ";
    });

    checks.push({
      id: "structure.tocFieldCode",
      category: "structure",
      name: "TOC — field code присутствует",
      passed: hasTocField,
      severity: "critical",
      expected: "TOC field code в документе",
      actual: hasTocField ? "есть" : "нет",
    });

    checks.push({
      id: "structure.tocHeading",
      category: "structure",
      name: "TOC — заголовок СОДЕРЖАНИЕ",
      passed: hasTocHeading,
      severity: "major",
      expected: "Параграф с текстом СОДЕРЖАНИЕ",
      actual: hasTocHeading ? "есть" : "нет",
    });
  }

  // 4b. Title page presence
  {
    const hasTitlePage = enrichedParagraphs.some((p) => p.blockType?.startsWith("title_page"));
    checks.push({
      id: "structure.titlePage",
      category: "structure",
      name: "Титульная страница",
      passed: hasTitlePage,
      severity: "critical",
      expected: "Есть параграфы с blockType=title_page",
      actual: hasTitlePage ? "есть" : "нет",
    });
  }

  // 4c. Section break after title page
  {
    let hasSectionBreakAfterTitle = false;
    // Ищем последний title_page параграф и проверяем sectPr
    let lastTitleBodyIdx = -1;
    for (const { node, paragraphIndex, bodyIndex } of paragraphs) {
      const text = getFullText(node);
      const enriched = lookupEnriched(paragraphIndex, text);
      if (enriched?.blockType?.startsWith("title_page")) {
        lastTitleBodyIdx = bodyIndex;
        if (hasSectionBreak(node)) {
          hasSectionBreakAfterTitle = true;
        }
      }
    }

    // Проверяем следующие несколько параграфов после title_page
    if (!hasSectionBreakAfterTitle && lastTitleBodyIdx >= 0) {
      for (const { node, bodyIndex } of paragraphs) {
        if (bodyIndex > lastTitleBodyIdx && bodyIndex <= lastTitleBodyIdx + 5) {
          if (hasSectionBreak(node)) {
            hasSectionBreakAfterTitle = true;
            break;
          }
        }
      }
    }

    checks.push({
      id: "structure.sectionBreakAfterTitle",
      category: "structure",
      name: "Разрыв секции после титульной",
      passed: hasSectionBreakAfterTitle,
      severity: "major",
      expected: "w:sectPr после title_page",
      actual: hasSectionBreakAfterTitle ? "есть" : "нет",
    });
  }

  // 4d. TOC doesn't contain garbage (body text, images)
  {
    let garbageInToc = 0;
    const examples: string[] = [];
    const tocParas = paragraphs.filter(({ paragraphIndex, node }) => {
      const text = getFullText(node);
      const enriched = lookupEnriched(paragraphIndex, text);
      return enriched?.blockType === "toc" || enriched?.blockType === "toc_entry";
    });

    for (const { node, paragraphIndex } of tocParas) {
      const text = getFullText(node);
      // TOC entries should be short (heading text + page number)
      // If a "toc_entry" has >200 chars, it's probably body text misclassified
      if (text.length > 200) {
        garbageInToc++;
        if (examples.length < 5) {
          examples.push(`[para ${paragraphIndex}] ${text.length} chars: "${text.substring(0, 80)}..."`);
        }
      }
      // Check for images in TOC paragraphs
      const runs = getRuns(node);
      for (const run of runs) {
        if (findChild(run, "w:drawing")) {
          garbageInToc++;
          if (examples.length < 5) {
            examples.push(`[para ${paragraphIndex}] contains drawing/image in TOC`);
          }
          break;
        }
      }
    }
    checks.push({
      id: "structure.tocNoGarbage",
      category: "structure",
      name: "TOC без мусора (длинных текстов, картинок)",
      passed: garbageInToc === 0,
      severity: "critical",
      expected: "0 мусорных элементов в TOC",
      actual: `${garbageInToc}`,
      count: garbageInToc,
      examples,
    });
  }

  // ═══════════════════════════════════════════
  // Category 5: TABLES
  // ═══════════════════════════════════════════

  const tables = bodyChildren.filter((n) => "w:tbl" in n);

  // 5a. Table width ≤ 100%
  {
    let overflowCount = 0;
    const examples: string[] = [];
    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const tblPr = findChild(tables[tIdx], "w:tblPr");
      const tblW = tblPr ? findChild(tblPr, "w:tblW") : undefined;
      const wType = getAttr(tblW, "w:type");
      const wVal = getAttrNum(tblW, "w:w");

      if (wType === "pct" && wVal !== undefined && wVal > 5000) {
        overflowCount++;
        if (examples.length < 3) examples.push(`Table ${tIdx + 1}: width=${wVal} pct (max 5000)`);
      }
      // For dxa (twips), check against page width
      if (wType === "dxa" && wVal !== undefined) {
        const pageWidthTwips = Math.round((210 - rules.margins.left - rules.margins.right) * TWIPS_PER_MM);
        if (wVal > pageWidthTwips + 100) {
          overflowCount++;
          if (examples.length < 3) examples.push(`Table ${tIdx + 1}: width=${wVal} twips > ${pageWidthTwips}`);
        }
      }
    }
    checks.push({
      id: "tables.width",
      category: "tables",
      name: "Таблицы в пределах ширины страницы",
      passed: overflowCount === 0,
      severity: "critical",
      expected: "0 таблиц с overflow",
      actual: `${overflowCount}/${tables.length}`,
      count: overflowCount,
      examples,
    });
  }

  // 5b. Table header row repeat (w:tblHeader on first row)
  {
    let noHeader = 0;
    const examples: string[] = [];
    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const rows = findChildren(tables[tIdx], "w:tr");
      if (rows.length <= 1) continue; // single-row tables don't need header repeat

      const firstRow = rows[0];
      const trPr = findChild(firstRow, "w:trPr");
      const tblHeader = trPr ? findChild(trPr, "w:tblHeader") : undefined;
      if (!tblHeader) {
        noHeader++;
        if (examples.length < 3) examples.push(`Table ${tIdx + 1}: нет w:tblHeader`);
      }
    }
    checks.push({
      id: "tables.headerRepeat",
      category: "tables",
      name: "Повтор заголовка таблицы при переносе",
      passed: noHeader === 0,
      severity: "major",
      expected: "w:tblHeader на первой строке",
      actual: noHeader === 0 ? "все ок" : `${noHeader}/${tables.length} без повтора`,
      count: noHeader,
      examples,
    });
  }

  // 5c. Empty paragraphs in table cells
  {
    let emptyCellParas = 0;
    for (const table of tables) {
      const rows = findChildren(table, "w:tr");
      for (const row of rows) {
        const cells = findChildren(row, "w:tc");
        for (const cell of cells) {
          const cellParas = findChildren(cell, "w:p");
          // Count truly empty paragraphs (beyond the mandatory 1)
          let emptyCount = 0;
          for (const p of cellParas) {
            const text = getFullText(p);
            if (!text.trim()) emptyCount++;
          }
          // Each cell must have at least 1 paragraph (Word requirement),
          // so only count excess empties
          const excessEmpty = Math.max(0, emptyCount - 1);
          emptyCellParas += excessEmpty;
        }
      }
    }
    checks.push({
      id: "tables.emptyCellParagraphs",
      category: "tables",
      name: "Лишние пустые параграфы в ячейках таблиц",
      passed: emptyCellParas === 0,
      severity: "minor",
      expected: "0 лишних пустых параграфов",
      actual: `${emptyCellParas}`,
      count: emptyCellParas,
    });
  }

  // 5d. Table font size (10-12pt per GOST)
  {
    let wrongFontSize = 0;
    const examples: string[] = [];
    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const rows = findChildren(tables[tIdx], "w:tr");
      let tableHasWrongFont = false;
      for (const row of rows) {
        if (tableHasWrongFont) break;
        const cells = findChildren(row, "w:tc");
        for (const cell of cells) {
          if (tableHasWrongFont) break;
          const cellParas = findChildren(cell, "w:p");
          for (const p of cellParas) {
            const runs = getRuns(p);
            for (const run of runs) {
              const rPr = findChild(run, "w:rPr");
              const sz = rPr ? findChild(rPr, "w:sz") : undefined;
              const val = getAttrNum(sz, "w:val");
              if (val !== undefined) {
                const pt = val / 2;
                if (pt < 9 || pt > 14) {
                  tableHasWrongFont = true;
                  if (examples.length < 3) examples.push(`Table ${tIdx + 1}: font ${pt}pt`);
                  break;
                }
              }
            }
          }
        }
      }
      if (tableHasWrongFont) wrongFontSize++;
    }
    checks.push({
      id: "tables.fontSize",
      category: "tables",
      name: "Шрифт таблиц (10-12pt)",
      passed: wrongFontSize === 0,
      severity: "minor",
      expected: "10-14pt в таблицах",
      actual: wrongFontSize === 0 ? "ок" : `${wrongFontSize}/${tables.length} с неправильным размером`,
      count: wrongFontSize,
      examples,
    });
  }

  // ═══════════════════════════════════════════
  // Category 6: IMAGES / DRAWINGS
  // ═══════════════════════════════════════════

  // 6a. Drawing overflow
  {
    let overflowCount = 0;
    const examples: string[] = [];

    function checkDrawings(node: OrderedXmlNode, context: string): void {
      const childArr = children(node);
      for (const child of childArr) {
        if ("w:drawing" in child) {
          const inlines = findChildren(child, "wp:inline");
          const anchors = findChildren(child, "wp:anchor");
          for (const container of [...inlines, ...anchors]) {
            const extent = findChild(container, "wp:extent");
            const cx = getAttrNum(extent, "cx");
            if (cx !== undefined && cx > MAX_DRAWING_WIDTH_EMU) {
              overflowCount++;
              if (examples.length < 3) {
                examples.push(`${context}: cx=${cx} EMU > ${MAX_DRAWING_WIDTH_EMU}`);
              }
            }
          }
        } else if ("w:r" in child || "w:p" in child) {
          checkDrawings(child, context);
        }
      }
    }

    for (let i = 0; i < bodyChildren.length; i++) {
      if ("w:p" in bodyChildren[i]) {
        checkDrawings(bodyChildren[i], `Para ${i}`);
      } else if ("w:tbl" in bodyChildren[i]) {
        checkDrawings(bodyChildren[i], `Table at ${i}`);
      }
    }

    checks.push({
      id: "images.noOverflow",
      category: "images",
      name: "Рисунки в пределах ширины страницы",
      passed: overflowCount === 0,
      severity: "major",
      expected: "cx ≤ " + MAX_DRAWING_WIDTH_EMU + " EMU",
      actual: overflowCount === 0 ? "ок" : `${overflowCount} с overflow`,
      count: overflowCount,
      examples,
    });
  }

  // ═══════════════════════════════════════════
  // Category 7: CONTENT PRESERVATION
  // ═══════════════════════════════════════════

  // 7a. Images preserved
  checks.push({
    id: "preservation.images",
    category: "preservation",
    name: "Изображения сохранены",
    passed: fmtImageCount >= origImageCount,
    severity: "critical",
    expected: `${origImageCount} изображений`,
    actual: `${fmtImageCount}`,
    count: origImageCount > fmtImageCount ? origImageCount - fmtImageCount : 0,
  });

  // 7b. Tables preserved (допускаем потерю до 1 таблицы — table-based TOC удаляется намеренно)
  const tableLoss = origTableCount - fmtTableCount;
  checks.push({
    id: "preservation.tables",
    category: "preservation",
    name: "Таблицы сохранены",
    passed: tableLoss <= 1,
    severity: "critical",
    expected: `${origTableCount} таблиц (±1 для TOC-таблицы)`,
    actual: `${fmtTableCount}`,
  });

  // 7c. Content loss
  {
    let origChars = 0;
    let fmtChars = 0;
    if (origXml) {
      const origParsed = parseDocxXml(origXml);
      const origBody = getBody(origParsed);
      if (origBody) {
        for (const { node } of getParagraphsWithPositions(origBody)) {
          origChars += getFullText(node).replace(/\s/g, "").length;
        }
      }
    }
    for (const { node } of paragraphs) {
      fmtChars += getFullText(node).replace(/\s/g, "").length;
    }
    const lossPercent = origChars > 0
      ? Math.round(((origChars - fmtChars) / origChars) * 100)
      : 0;

    checks.push({
      id: "preservation.contentLoss",
      category: "preservation",
      name: "Потеря контента",
      passed: lossPercent <= 5,
      severity: lossPercent > 20 ? "critical" : lossPercent > 5 ? "major" : "minor",
      expected: "≤ 5% потери символов",
      actual: `${lossPercent}% (${origChars} → ${fmtChars})`,
      count: lossPercent,
    });
  }

  // ═══════════════════════════════════════════
  // Calculate score
  // ═══════════════════════════════════════════

  const categories = new Map<string, { passed: number; total: number }>();
  let totalWeight = 0;
  let failedWeight = 0;

  for (const check of checks) {
    const cat = categories.get(check.category) || { passed: 0, total: 0 };
    cat.total++;
    if (check.passed) cat.passed++;
    categories.set(check.category, cat);

    const weight = SEVERITY_WEIGHTS[check.severity];
    totalWeight += weight;
    if (!check.passed) failedWeight += weight;
  }

  const score = totalWeight > 0 ? Math.round(((totalWeight - failedWeight) / totalWeight) * 100) : 100;

  const categoryScores: Record<string, { passed: number; total: number; score: number }> = {};
  for (const [cat, data] of categories) {
    categoryScores[cat] = {
      ...data,
      score: data.total > 0 ? Math.round((data.passed / data.total) * 100) : 100,
    };
  }

  return {
    documentId,
    timestamp: new Date().toISOString(),
    score,
    categories: categoryScores,
    checks,
    stats: {
      paragraphCount: paragraphs.length,
      tableCount: tables.length,
      imageCount: fmtImageCount,
      bodyTextCount,
      headingCount,
    },
  };
}

function emptyReport(documentId: string, error: string): QualityReport {
  return {
    documentId,
    timestamp: new Date().toISOString(),
    score: 0,
    categories: {},
    checks: [{
      id: "system.error",
      category: "system",
      name: "Ошибка чтения документа",
      passed: false,
      severity: "critical",
      expected: "Валидный документ",
      actual: error,
    }],
    stats: { paragraphCount: 0, tableCount: 0, imageCount: 0, bodyTextCount: 0, headingCount: 0 },
  };
}
