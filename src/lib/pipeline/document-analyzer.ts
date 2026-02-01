/**
 * Анализатор документов на соответствие правилам форматирования
 * 
 * Этот модуль читает .docx файл, проверяет его на соответствие правилам
 * и возвращает список нарушений со статистикой.
 */

import {
  FormattingRules,
  FormattingViolation,
  AnalysisResult,
  DocumentStatistics,
} from "@/types/formatting-rules";
import { extractFromDocx } from "../documents/docx-reader";
import JSZip from "jszip";
import {
  PROHIBITED_ABBREVIATIONS,
  NON_BREAKING_SPACE_RULES,
  VALIDATION_PATTERNS
} from "../constants/reference-data";
import { BlockType } from "../ai/block-markup-schemas";
import { parseDocumentBlocks } from "../ai/document-block-markup";
import {
  type OrderedXmlNode,
  parseDocxXml,
  getBody,
  children,
  findChild,
  findChildren,
  getAttr,
  getText,
} from "../xml/docx-xml";

// Константы для конвертации единиц
const TWIPS_PER_MM = 56.7; // 1 мм ≈ 56.7 twips
const HALF_POINTS_PER_PT = 2; // размер шрифта в half-points

export interface DocxParagraph {
  index: number;
  text: string;
  style?: string;
  properties: {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    alignment?: string;
    indent?: number;
    lineSpacing?: number;
  };
  blockType?: BlockType;
  blockMetadata?: {
    language?: "ru" | "en" | "mixed";
    headingLevel?: number;
    listLevel?: number;
  };
}

export interface DocxTableCell {
  paragraphs: DocxParagraph[];
  alignment?: string;
  verticalAlignment?: string;
}

export interface DocxTableRow {
  cells: DocxTableCell[];
  isHeader: boolean;
}

export interface DocxTable {
  index: number;
  bodyIndex: number;
  rows: DocxTableRow[];
}

export interface DocxDocument {
  paragraphs: DocxParagraph[];
  tables: DocxTable[];
  sections: {
    margins: { top: number; bottom: number; left: number; right: number };
    pageSize: { width: number; height: number };
  }[];
}

/**
 * Парсинг .docx файла для извлечения структуры
 * Использует fast-xml-parser с preserveOrder для корректной обработки
 * смешанных элементов (w:p, w:tbl и т.д.)
 */
export async function parseDocxStructure(buffer: Buffer): Promise<DocxDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    throw new Error("Не удалось прочитать document.xml из .docx файла");
  }

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);

  if (!body) {
    throw new Error("Не удалось найти тело документа");
  }

  const paragraphs: DocxParagraph[] = [];
  const tables: DocxTable[] = [];
  const sections: DocxDocument["sections"] = [];

  // Извлекаем параграфы из body children (сохраняя правильный порядок)
  const bodyChildren = children(body);
  let pIndex = 0;
  let tableIndex = 0;

  for (let bodyIdx = 0; bodyIdx < bodyChildren.length; bodyIdx++) {
    const child = bodyChildren[bodyIdx];
    if ("w:p" in child) {
      const paragraph = parseParagraphNode(child, pIndex);
      paragraphs.push(paragraph);

      // Проверяем sectPr внутри pPr
      const pPr = findChild(child, "w:pPr");
      if (pPr) {
        const sectPr = findChild(pPr, "w:sectPr");
        if (sectPr) {
          sections.push(extractSectionFromNode(sectPr));
        }
      }

      pIndex++;
    } else if ("w:tbl" in child) {
      // Парсим таблицу
      const table = parseTableNode(child, tableIndex, bodyIdx);
      tables.push(table);
      tableIndex++;
    } else if ("w:sectPr" in child) {
      // sectPr на уровне body
      sections.push(extractSectionFromNode(child));
    }
  }

  // Если секций нет, добавляем дефолтную
  if (sections.length === 0) {
    sections.push({
      margins: { top: 20, bottom: 20, left: 30, right: 15 },
      pageSize: { width: 210, height: 297 },
    });
  }

  return { paragraphs, tables, sections };
}

/**
 * Парсит один w:p узел в DocxParagraph
 */
function parseParagraphNode(pNode: OrderedXmlNode, index: number): DocxParagraph {
  const runs = findChildren(pNode, "w:r");
  const text = runs
    .map((r) => {
      const tNodes = findChildren(r, "w:t");
      return tNodes.map((t) => getText(t)).join("");
    })
    .join("");

  const pPr = findChild(pNode, "w:pPr");
  const firstRunRPr = runs.length > 0 ? findChild(runs[0], "w:rPr") : undefined;

  const pStyleNode = pPr ? findChild(pPr, "w:pStyle") : undefined;
  const style = pStyleNode ? getAttr(pStyleNode, "w:val") : undefined;

  const fontFamilyNode = firstRunRPr ? findChild(firstRunRPr, "w:rFonts") : undefined;
  const fontFamily = fontFamilyNode ? getAttr(fontFamilyNode, "w:ascii") : undefined;

  const szNode = firstRunRPr ? findChild(firstRunRPr, "w:sz") : undefined;
  const szVal = szNode ? getAttr(szNode, "w:val") : undefined;
  const fontSize = szVal ? parseInt(szVal) / HALF_POINTS_PER_PT : undefined;

  const bold = firstRunRPr ? !!findChild(firstRunRPr, "w:b") : false;
  const italic = firstRunRPr ? !!findChild(firstRunRPr, "w:i") : false;

  const jcNode = pPr ? findChild(pPr, "w:jc") : undefined;
  const alignment = jcNode ? getAttr(jcNode, "w:val") : undefined;

  const indNode = pPr ? findChild(pPr, "w:ind") : undefined;
  const firstLineVal = indNode ? getAttr(indNode, "w:firstLine") : undefined;
  const indent = firstLineVal ? parseInt(firstLineVal) / TWIPS_PER_MM : undefined;

  const spacingNode = pPr ? findChild(pPr, "w:spacing") : undefined;
  const lineVal = spacingNode ? getAttr(spacingNode, "w:line") : undefined;
  const lineSpacing = lineVal ? parseInt(lineVal) / 240 : undefined;

  return {
    index,
    text,
    style,
    properties: {
      fontFamily,
      fontSize,
      bold,
      italic,
      alignment,
      indent,
      lineSpacing,
    },
  };
}

/**
 * Парсит w:tbl узел в DocxTable
 */
function parseTableNode(tblNode: OrderedXmlNode, tableIndex: number, bodyIndex: number): DocxTable {
  const rows: DocxTableRow[] = [];
  const trNodes = findChildren(tblNode, "w:tr");

  trNodes.forEach((tr, rowIdx) => {
    // Определяем заголовочную строку
    const trPr = findChild(tr, "w:trPr");
    const tblHeader = trPr ? findChild(trPr, "w:tblHeader") : undefined;
    const isHeader = rowIdx === 0 || !!tblHeader;

    const cells: DocxTableCell[] = [];
    const tcNodes = findChildren(tr, "w:tc");

    tcNodes.forEach((tc) => {
      const cellParagraphs: DocxParagraph[] = [];
      const pNodes = findChildren(tc, "w:p");

      pNodes.forEach((pNode, pIdx) => {
        cellParagraphs.push(parseParagraphNode(pNode, pIdx));
      });

      // Извлекаем выравнивание ячейки из tcPr
      const tcPr = findChild(tc, "w:tcPr");
      const vAlignNode = tcPr ? findChild(tcPr, "w:vAlign") : undefined;
      const verticalAlignment = vAlignNode ? getAttr(vAlignNode, "w:val") : undefined;

      cells.push({
        paragraphs: cellParagraphs,
        verticalAlignment,
      });
    });

    rows.push({ cells, isHeader });
  });

  return { index: tableIndex, bodyIndex, rows };
}

/**
 * Извлекает данные секции из ordered-узла w:sectPr
 */
function extractSectionFromNode(sectPr: OrderedXmlNode): DocxDocument["sections"][0] {
  const pgMar = findChild(sectPr, "w:pgMar");
  const pgSz = findChild(sectPr, "w:pgSz");

  return {
    margins: {
      top: pgMar ? parseFloat(getAttr(pgMar, "w:top") || "0") / TWIPS_PER_MM : 20,
      bottom: pgMar ? parseFloat(getAttr(pgMar, "w:bottom") || "0") / TWIPS_PER_MM : 20,
      left: pgMar ? parseFloat(getAttr(pgMar, "w:left") || "0") / TWIPS_PER_MM : 30,
      right: pgMar ? parseFloat(getAttr(pgMar, "w:right") || "0") / TWIPS_PER_MM : 15,
    },
    pageSize: {
      width: pgSz ? parseFloat(getAttr(pgSz, "w:w") || "0") / TWIPS_PER_MM : 210,
      height: pgSz ? parseFloat(getAttr(pgSz, "w:h") || "0") / TWIPS_PER_MM : 297,
    },
  };
}

/**
 * Вычислить статистику документа
 */
function calculateStatistics(paragraphs: DocxParagraph[]): DocumentStatistics {
  const allText = paragraphs.map((p) => p.text).join(" ");
  const totalCharacters = allText.length;
  const charactersWithoutSpaces = allText.replace(/\s/g, "").length;
  const wordCount = allText.split(/\s+/).filter(Boolean).length;
  
  // Примерный расчёт страниц (≈2000 символов на страницу)
  const pageCount = Math.max(1, Math.ceil(totalCharacters / 2000));

  return {
    totalCharacters,
    charactersWithoutSpaces,
    wordCount,
    pageCount,
    paragraphCount: paragraphs.length,
    imageCount: 0, // TODO: подсчитать изображения
    tableCount: 0, // TODO: подсчитать таблицы
  };
}

/**
 * Проверить поля документа
 */
function checkMargins(
  sections: DocxDocument["sections"],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];
  const expected = rules.document.margins;
  const tolerance = 2; // Допуск в мм

  sections.forEach((section, idx) => {
    const actual = section.margins;

    if (Math.abs(actual.top - expected.top) > tolerance) {
      violations.push({
        ruleId: "margins-top",
        rulePath: "document.margins.top",
        message: "Неверное верхнее поле",
        expected: `${expected.top} мм`,
        actual: `${Math.round(actual.top)} мм`,
        location: { paragraphIndex: 0 },
        autoFixable: true,
      });
    }

    if (Math.abs(actual.bottom - expected.bottom) > tolerance) {
      violations.push({
        ruleId: "margins-bottom",
        rulePath: "document.margins.bottom",
        message: "Неверное нижнее поле",
        expected: `${expected.bottom} мм`,
        actual: `${Math.round(actual.bottom)} мм`,
        location: { paragraphIndex: 0 },
        autoFixable: true,
      });
    }

    if (Math.abs(actual.left - expected.left) > tolerance) {
      violations.push({
        ruleId: "margins-left",
        rulePath: "document.margins.left",
        message: "Неверное левое поле",
        expected: `${expected.left} мм`,
        actual: `${Math.round(actual.left)} мм`,
        location: { paragraphIndex: 0 },
        autoFixable: true,
      });
    }

    if (Math.abs(actual.right - expected.right) > tolerance) {
      violations.push({
        ruleId: "margins-right",
        rulePath: "document.margins.right",
        message: "Неверное правое поле",
        expected: `${expected.right} мм`,
        actual: `${Math.round(actual.right)} мм`,
        location: { paragraphIndex: 0 },
        autoFixable: true,
      });
    }
  });

  return violations;
}

/** Маппинг выравнивания XML → человекочитаемое */
const ALIGNMENT_MAP: Record<string, string> = {
  left: "left",
  center: "center",
  right: "right",
  both: "justify",
  justify: "justify",
};

/** Типы блоков, для которых применяются правила обычного текста */
const TEXT_BLOCK_TYPES: Set<BlockType | undefined> = new Set([
  "body_text",
  "list_item",
  "quote",
  "appendix_content",
  undefined, // если blockType не определён — проверяем как обычный текст
]);

/** Типы блоков, которые пропускаем при проверке текста */
const SKIP_BLOCK_TYPES: Set<BlockType> = new Set([
  "heading_1", "heading_2", "heading_3", "heading_4",
  "title_page", "toc", "toc_entry",
  "figure_caption", "table_caption",
  "bibliography_title", "bibliography_entry",
  "table", "figure", "formula",
  "page_number", "empty", "unknown",
  "footnote", "appendix_title",
]);

/**
 * Проверить форматирование обычного текста (body_text, list_item, quote)
 */
function checkTextFormatting(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];
  const textRules = rules.text;

  paragraphs.forEach((paragraph) => {
    if (!paragraph.text.trim()) return;

    // Пропускаем заголовки по стилю (на случай если blockType не определён)
    if (paragraph.style?.toLowerCase().includes("heading")) return;

    // Пропускаем блоки которые проверяются отдельно
    if (paragraph.blockType && SKIP_BLOCK_TYPES.has(paragraph.blockType)) return;

    const props = paragraph.properties;
    const textSnippet = paragraph.text.slice(0, 50) + (paragraph.text.length > 50 ? "..." : "");

    // Проверка шрифта
    if (props.fontFamily && props.fontFamily !== textRules.fontFamily) {
      violations.push({
        ruleId: `text-font-${paragraph.index}`,
        rulePath: "text.fontFamily",
        message: "Неверный шрифт",
        expected: textRules.fontFamily,
        actual: props.fontFamily,
        location: { paragraphIndex: paragraph.index, text: textSnippet },
        autoFixable: true,
      });
    }

    // Проверка размера шрифта
    if (props.fontSize && Math.abs(props.fontSize - textRules.fontSize) > 0.5) {
      violations.push({
        ruleId: `text-size-${paragraph.index}`,
        rulePath: "text.fontSize",
        message: "Неверный размер шрифта",
        expected: `${textRules.fontSize} pt`,
        actual: `${props.fontSize} pt`,
        location: { paragraphIndex: paragraph.index, text: textSnippet },
        autoFixable: true,
      });
    }

    // Проверка выравнивания
    if (props.alignment) {
      const actualAlignment = ALIGNMENT_MAP[props.alignment] || props.alignment;
      if (actualAlignment !== textRules.alignment) {
        violations.push({
          ruleId: `text-align-${paragraph.index}`,
          rulePath: "text.alignment",
          message: "Неверное выравнивание текста",
          expected: textRules.alignment,
          actual: actualAlignment,
          location: { paragraphIndex: paragraph.index, text: textSnippet },
          autoFixable: true,
        });
      }
    }

    // Проверка абзацного отступа
    if (props.indent !== undefined) {
      const tolerance = 2;
      if (Math.abs(props.indent - textRules.paragraphIndent) > tolerance) {
        violations.push({
          ruleId: `text-indent-${paragraph.index}`,
          rulePath: "text.paragraphIndent",
          message: "Неверный абзацный отступ",
          expected: `${textRules.paragraphIndent} мм`,
          actual: `${Math.round(props.indent)} мм`,
          location: { paragraphIndex: paragraph.index, text: textSnippet },
          autoFixable: true,
        });
      }
    }

    // Проверка межстрочного интервала
    if (props.lineSpacing !== undefined) {
      const tolerance = 0.1;
      if (Math.abs(props.lineSpacing - textRules.lineSpacing) > tolerance) {
        violations.push({
          ruleId: `text-spacing-${paragraph.index}`,
          rulePath: "text.lineSpacing",
          message: "Неверный межстрочный интервал",
          expected: `${textRules.lineSpacing}`,
          actual: `${props.lineSpacing.toFixed(1)}`,
          location: { paragraphIndex: paragraph.index, text: textSnippet },
          autoFixable: true,
        });
      }
    }
  });

  return violations;
}

/**
 * Проверить форматирование заголовков по rules.headings
 */
function checkHeadingFormatting(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];

  const headingLevels: Record<string, { level: number; rules: typeof rules.headings.level1 }> = {
    heading_1: { level: 1, rules: rules.headings.level1 },
    heading_2: { level: 2, rules: rules.headings.level2 },
    heading_3: { level: 3, rules: rules.headings.level3 },
  };
  if (rules.headings.level4) {
    headingLevels["heading_4"] = { level: 4, rules: rules.headings.level4 };
  }

  paragraphs.forEach((paragraph) => {
    if (!paragraph.text.trim()) return;
    if (!paragraph.blockType) return;

    const headingInfo = headingLevels[paragraph.blockType];
    if (!headingInfo) return;

    const h = headingInfo.rules;
    const props = paragraph.properties;
    const textSnippet = paragraph.text.slice(0, 50) + (paragraph.text.length > 50 ? "..." : "");

    // Проверка выравнивания заголовка
    if (h.alignment && props.alignment) {
      const actualAlignment = ALIGNMENT_MAP[props.alignment] || props.alignment;
      if (actualAlignment !== h.alignment) {
        violations.push({
          ruleId: `heading${headingInfo.level}-align-${paragraph.index}`,
          rulePath: `headings.level${headingInfo.level}.alignment`,
          message: `Неверное выравнивание заголовка уровня ${headingInfo.level}`,
          expected: h.alignment,
          actual: actualAlignment,
          location: { paragraphIndex: paragraph.index, text: textSnippet },
          autoFixable: true,
        });
      }
    }

    // Проверка шрифта заголовка
    const expectedFont = h.fontFamily || rules.text.fontFamily;
    if (props.fontFamily && props.fontFamily !== expectedFont) {
      violations.push({
        ruleId: `heading${headingInfo.level}-font-${paragraph.index}`,
        rulePath: `headings.level${headingInfo.level}.fontFamily`,
        message: `Неверный шрифт заголовка уровня ${headingInfo.level}`,
        expected: expectedFont,
        actual: props.fontFamily,
        location: { paragraphIndex: paragraph.index, text: textSnippet },
        autoFixable: true,
      });
    }

    // Проверка размера шрифта заголовка
    const expectedSize = h.fontSize || rules.text.fontSize;
    if (props.fontSize && Math.abs(props.fontSize - expectedSize) > 0.5) {
      violations.push({
        ruleId: `heading${headingInfo.level}-size-${paragraph.index}`,
        rulePath: `headings.level${headingInfo.level}.fontSize`,
        message: `Неверный размер шрифта заголовка уровня ${headingInfo.level}`,
        expected: `${expectedSize} pt`,
        actual: `${props.fontSize} pt`,
        location: { paragraphIndex: paragraph.index, text: textSnippet },
        autoFixable: true,
      });
    }

    // Проверка жирности
    if (h.bold !== undefined && props.bold !== h.bold) {
      violations.push({
        ruleId: `heading${headingInfo.level}-bold-${paragraph.index}`,
        rulePath: `headings.level${headingInfo.level}.bold`,
        message: `Заголовок уровня ${headingInfo.level} ${h.bold ? "должен быть" : "не должен быть"} полужирным`,
        expected: h.bold ? "полужирный" : "обычный",
        actual: props.bold ? "полужирный" : "обычный",
        location: { paragraphIndex: paragraph.index, text: textSnippet },
        autoFixable: true,
      });
    }
  });

  return violations;
}

/**
 * Проверить форматирование специальных элементов (подписи к рисункам, таблицам, библиография)
 */
function checkSpecialElementFormatting(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];

  paragraphs.forEach((paragraph) => {
    if (!paragraph.text.trim()) return;
    if (!paragraph.blockType) return;

    const props = paragraph.properties;
    const textSnippet = paragraph.text.slice(0, 50) + (paragraph.text.length > 50 ? "..." : "");

    // Подписи к рисункам
    if (paragraph.blockType === "figure_caption") {
      const figRules = rules.specialElements?.figures;
      const expectedAlignment = figRules?.alignment || "center";

      if (props.alignment) {
        const actualAlignment = ALIGNMENT_MAP[props.alignment] || props.alignment;
        if (actualAlignment !== expectedAlignment) {
          violations.push({
            ruleId: `figure-caption-align-${paragraph.index}`,
            rulePath: "specialElements.figures.alignment",
            message: "Неверное выравнивание подписи к рисунку",
            expected: expectedAlignment,
            actual: actualAlignment,
            location: { paragraphIndex: paragraph.index, text: textSnippet },
            autoFixable: true,
          });
        }
      }
    }

    // Подписи к таблицам
    if (paragraph.blockType === "table_caption") {
      const tblRules = rules.specialElements?.tables;
      const expectedAlignment = tblRules?.headers?.alignment || "justify";

      if (props.alignment) {
        const actualAlignment = ALIGNMENT_MAP[props.alignment] || props.alignment;
        if (actualAlignment !== expectedAlignment) {
          violations.push({
            ruleId: `table-caption-align-${paragraph.index}`,
            rulePath: "specialElements.tables.headers.alignment",
            message: "Неверное выравнивание подписи к таблице",
            expected: expectedAlignment,
            actual: actualAlignment,
            location: { paragraphIndex: paragraph.index, text: textSnippet },
            autoFixable: true,
          });
        }
      }
    }
  });

  return violations;
}

/**
 * Проверить форматирование внутри таблиц
 */
function checkTableFormatting(
  tables: DocxTable[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];

  const tableRules = rules.specialElements?.tables;
  if (!tableRules) return violations;

  const expectedFontSize = tableRules.fontSize?.default || 12;

  tables.forEach((table) => {
    table.rows.forEach((row, rowIdx) => {
      row.cells.forEach((cell, cellIdx) => {
        cell.paragraphs.forEach((paragraph) => {
          if (!paragraph.text.trim()) return;

          const props = paragraph.properties;
          const textSnippet = paragraph.text.slice(0, 30) + (paragraph.text.length > 30 ? "..." : "");

          // Проверка размера шрифта в таблице
          if (props.fontSize && Math.abs(props.fontSize - expectedFontSize) > 0.5) {
            violations.push({
              ruleId: `table-${table.index}-r${rowIdx}-c${cellIdx}-fontsize`,
              rulePath: "specialElements.tables.fontSize.default",
              message: `Неверный размер шрифта в таблице ${table.index + 1}`,
              expected: `${expectedFontSize} pt`,
              actual: `${props.fontSize} pt`,
              location: {
                paragraphIndex: -1,
                text: `[Таблица ${table.index + 1}, строка ${rowIdx + 1}, столбец ${cellIdx + 1}] ${textSnippet}`,
              },
              autoFixable: true,
            });
          }

          // Проверка выравнивания в заголовочной строке
          if (row.isHeader && props.alignment) {
            const actualAlignment = ALIGNMENT_MAP[props.alignment] || props.alignment;
            const expectedAlignment = tableRules.headers?.alignment || "center";
            if (actualAlignment !== expectedAlignment) {
              violations.push({
                ruleId: `table-${table.index}-r${rowIdx}-c${cellIdx}-align`,
                rulePath: "specialElements.tables.headers.alignment",
                message: `Неверное выравнивание заголовка таблицы ${table.index + 1}`,
                expected: expectedAlignment,
                actual: actualAlignment,
                location: {
                  paragraphIndex: -1,
                  text: `[Таблица ${table.index + 1}, строка ${rowIdx + 1}, столбец ${cellIdx + 1}] ${textSnippet}`,
                },
                autoFixable: true,
              });
            }
          }
        });
      });
    });
  });

  return violations;
}

/**
 * Проверить неразрывные пробелы
 */
function checkNonBreakingSpaces(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];
  
  if (!rules.additional?.nonBreakingSpaces) return violations;

  const nbspRules = rules.additional.nonBreakingSpaces;

  paragraphs.forEach((paragraph) => {
    const text = paragraph.text;
    
    // Проверка пробелов перед единицами измерения
    if (nbspRules.beforeUnits) {
      // Составные/однозначные единицы — не могут быть началом обычного слова
      const safeUnitPattern = /(\d) (мм|см|дм|км|кг|мг|мл|мин|кВт|Вт|Гц|Па|МПа|дБ|°C|об\/мин)(?=[\s,.\);:!?\-]|$)/g;
      // Короткие единицы — требуем, чтобы после НЕ шла буква (иначе это обычное слово)
      const shortUnitPattern = /(\d) (м|г|л|с|ч|т|А|В|К)(?![а-яёА-ЯЁa-zA-Z])/g;

      for (const unitPattern of [safeUnitPattern, shortUnitPattern]) {
        let match;
        while ((match = unitPattern.exec(text)) !== null) {
          // Пропускаем если пробел уже неразрывный
          const spaceChar = text.charAt(match.index + match[1].length);
          if (spaceChar === "\u00A0") continue;

          violations.push({
            ruleId: `nbsp-unit-${paragraph.index}-${match.index}`,
            rulePath: "additional.nonBreakingSpaces.beforeUnits",
            message: "Требуется неразрывный пробел перед единицей измерения",
            expected: "неразрывный пробел",
            actual: "обычный пробел",
            location: {
              paragraphIndex: paragraph.index,
              startOffset: match.index,
              endOffset: match.index + match[0].length,
              text: match[0],
            },
            autoFixable: true,
          });
        }
      }
    }

    // Проверка инициалов
    if (nbspRules.afterInitials) {
      const initialsPattern = /([А-ЯЁ]\.) ([А-ЯЁ]\.) ([А-ЯЁ][а-яё]+)/g;
      let match;
      while ((match = initialsPattern.exec(text)) !== null) {
        // Пропускаем если пробелы уже неразрывные
        const space1Pos = match.index + match[1].length;
        const space2Pos = space1Pos + 1 + match[2].length;
        if (text.charAt(space1Pos) === "\u00A0" && text.charAt(space2Pos) === "\u00A0") continue;

        violations.push({
          ruleId: `nbsp-initials-${paragraph.index}-${match.index}`,
          rulePath: "additional.nonBreakingSpaces.afterInitials",
          message: "Требуется неразрывный пробел после инициалов",
          expected: "неразрывный пробел",
          actual: "обычный пробел",
          location: {
            paragraphIndex: paragraph.index,
            startOffset: match.index,
            endOffset: match.index + match[0].length,
            text: match[0],
          },
          autoFixable: true,
        });
      }
    }
  });

  return violations;
}

/**
 * Проверить запрещенные элементы форматирования
 */
function checkProhibitedFormatting(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];
  
  if (!rules.additional?.prohibitedFormatting) return violations;

  const prohibited = rules.additional.prohibitedFormatting;

  paragraphs.forEach((paragraph) => {
    const text = paragraph.text;
    const props = paragraph.properties;

    // Проверка подчеркивания (TODO: нужен доступ к XML для проверки)
    // Проверка цвета текста (TODO: нужен доступ к XML для проверки)
    
    // Можно добавить проверки на основе текста
  });

  return violations;
}

/**
 * Проверить запрещенные сокращения
 */
function checkProhibitedAbbreviations(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];
  
  if (!rules.additional?.abbreviationRules?.prohibited?.graphicalShortcuts) return violations;

  paragraphs.forEach((paragraph) => {
    const text = paragraph.text;
    
    PROHIBITED_ABBREVIATIONS.forEach((abbr) => {
      const regex = new RegExp(`\\b${abbr.replace('.', '\\.')}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        violations.push({
          ruleId: `prohibited-abbr-${paragraph.index}-${match.index}`,
          rulePath: "additional.abbreviationRules.prohibited.graphicalShortcuts",
          message: `Запрещенное сокращение "${abbr}"`,
          expected: "полное написание",
          actual: match[0],
          location: {
            paragraphIndex: paragraph.index,
            startOffset: match.index,
            endOffset: match.index + match[0].length,
            text: match[0],
          },
          autoFixable: false,
        });
      }
    });
  });

  return violations;
}

/**
 * Проверить использование правильных кавычек
 */
function checkQuotes(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];
  
  if (!rules.additional?.symbolRules?.quotes) return violations;

  const requiredType = rules.additional.symbolRules.quotes.type;
  
  if (requiredType === "angular") {
    // Проверяем на наличие прямых кавычек вместо угловых
    paragraphs.forEach((paragraph) => {
      const text = paragraph.text;
      const straightQuotesMatches = text.match(VALIDATION_PATTERNS.straightQuotes);
      
      if (straightQuotesMatches) {
        straightQuotesMatches.forEach((match) => {
          const index = text.indexOf(match);
          violations.push({
            ruleId: `quotes-${paragraph.index}-${index}`,
            rulePath: "additional.symbolRules.quotes.type",
            message: "Использованы прямые кавычки вместо угловых",
            expected: "угловые кавычки «»",
            actual: "прямые кавычки \"\"",
            location: {
              paragraphIndex: paragraph.index,
              startOffset: index,
              endOffset: index + match.length,
              text: match,
            },
            autoFixable: true,
          });
        });
      }
    });
  }

  return violations;
}

/**
 * Проверить использование запрещенного длинного тире
 */
function checkDashes(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];
  
  if (!rules.additional?.symbolRules?.dash?.prohibitEmDash) return violations;

  paragraphs.forEach((paragraph) => {
    const text = paragraph.text;
    const emDashMatches = text.match(VALIDATION_PATTERNS.emDash);
    
    if (emDashMatches) {
      emDashMatches.forEach((match) => {
        const index = text.indexOf(match);
        violations.push({
          ruleId: `em-dash-${paragraph.index}-${index}`,
          rulePath: "additional.symbolRules.dash.prohibitEmDash",
          message: "Использовано запрещенное длинное тире",
          expected: "среднее тире (–) или дефис (-)",
          actual: "длинное тире (—)",
          location: {
            paragraphIndex: paragraph.index,
            startOffset: index,
            endOffset: index + 1,
            text: match,
          },
          autoFixable: true,
        });
      });
    }
  });

  return violations;
}

/**
 * Обогащает параграфы AI-разметкой блоков
 */
export async function enrichWithBlockMarkup(
  paragraphs: DocxParagraph[]
): Promise<DocxParagraph[]> {
  const input = paragraphs.map((p) => ({
    index: p.index,
    text: p.text,
    style: p.style,
  }));

  const markup = await parseDocumentBlocks(input);

  // Создаём map для быстрого поиска
  const blockMap = new Map(
    markup.blocks.map((b) => [b.paragraphIndex, b])
  );

  return paragraphs.map((p) => {
    const block = blockMap.get(p.index);
    if (!block) return p;

    return {
      ...p,
      blockType: block.blockType,
      blockMetadata: block.metadata
        ? {
            language: block.metadata.language,
            headingLevel: block.metadata.headingLevel,
            listLevel: block.metadata.listLevel,
          }
        : undefined,
    };
  });
}

/**
 * Главная функция анализа документа
 *
 * Принимает опциональные enrichedParagraphs — если переданы, использует их
 * blockType для контекстно-зависимых проверок (заголовки, подписи, библиография).
 * Если не переданы, проверяет как раньше (без учёта blockType).
 */
export async function analyzeDocument(
  buffer: Buffer,
  rules: FormattingRules,
  enrichedParagraphs?: DocxParagraph[]
): Promise<AnalysisResult> {
  const docxStructure = await parseDocxStructure(buffer);

  // Если переданы enriched параграфы — используем их blockType
  const paragraphs = enrichedParagraphs || docxStructure.paragraphs;

  const violations: FormattingViolation[] = [
    ...checkMargins(docxStructure.sections, rules),
    ...checkTextFormatting(paragraphs, rules),
    ...checkHeadingFormatting(paragraphs, rules),
    ...checkSpecialElementFormatting(paragraphs, rules),
    ...checkTableFormatting(docxStructure.tables, rules),
    ...checkNonBreakingSpaces(paragraphs, rules),
    ...checkProhibitedAbbreviations(paragraphs, rules),
    ...checkQuotes(paragraphs, rules),
    ...checkDashes(paragraphs, rules),
    ...checkProhibitedFormatting(paragraphs, rules),
  ];

  const statistics = calculateStatistics(paragraphs);
  statistics.tableCount = docxStructure.tables.length;

  const checkedRules = [
    "document.margins",
    "text.fontFamily",
    "text.fontSize",
    "text.alignment",
    "text.paragraphIndent",
    "text.lineSpacing",
    "headings.level1",
    "headings.level2",
    "headings.level3",
    "specialElements.figures",
    "specialElements.tables",
    "additional.nonBreakingSpaces",
    "additional.abbreviationRules.prohibited",
    "additional.symbolRules.quotes",
    "additional.symbolRules.dash",
    "additional.prohibitedFormatting",
  ];

  return {
    violations,
    statistics,
    checkedRules,
  };
}
