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
import { parseStringPromise } from "xml2js";
import { 
  PROHIBITED_ABBREVIATIONS, 
  NON_BREAKING_SPACE_RULES,
  VALIDATION_PATTERNS 
} from "../constants/reference-data";

// Константы для конвертации единиц
const TWIPS_PER_MM = 56.7; // 1 мм ≈ 56.7 twips
const HALF_POINTS_PER_PT = 2; // размер шрифта в half-points

interface DocxParagraph {
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
}

interface DocxDocument {
  paragraphs: DocxParagraph[];
  sections: {
    margins: { top: number; bottom: number; left: number; right: number };
    pageSize: { width: number; height: number };
  }[];
}

/**
 * Парсинг .docx файла для извлечения структуры
 */
async function parseDocxStructure(buffer: Buffer): Promise<DocxDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  
  if (!documentXml) {
    throw new Error("Не удалось прочитать document.xml из .docx файла");
  }

  const parsed = await parseStringPromise(documentXml, { explicitArray: false });
  const body = parsed["w:document"]?.["w:body"];

  if (!body) {
    throw new Error("Не удалось найти тело документа");
  }

  const paragraphs: DocxParagraph[] = [];
  const sections: DocxDocument["sections"] = [];

  // Извлекаем параграфы
  const pElements = Array.isArray(body["w:p"]) ? body["w:p"] : body["w:p"] ? [body["w:p"]] : [];

  pElements.forEach((p: any, index: number) => {
    const textRuns = Array.isArray(p["w:r"]) ? p["w:r"] : p["w:r"] ? [p["w:r"]] : [];
    const text = textRuns
      .map((r: any) => r["w:t"]?._ || r["w:t"] || "")
      .join("");

    const pPr = p["w:pPr"] || {};
    const rPr = textRuns[0]?.["w:rPr"] || {};

    paragraphs.push({
      index,
      text,
      style: pPr["w:pStyle"]?.["$"]?.["w:val"],
      properties: {
        fontFamily: rPr["w:rFonts"]?.["$"]?.["w:ascii"],
        fontSize: rPr["w:sz"]?.["$"]?.["w:val"] 
          ? parseInt(rPr["w:sz"]["$"]["w:val"]) / HALF_POINTS_PER_PT 
          : undefined,
        bold: !!rPr["w:b"],
        italic: !!rPr["w:i"],
        alignment: pPr["w:jc"]?.["$"]?.["w:val"],
        indent: pPr["w:ind"]?.["$"]?.["w:firstLine"]
          ? parseInt(pPr["w:ind"]["$"]["w:firstLine"]) / TWIPS_PER_MM
          : undefined,
        lineSpacing: pPr["w:spacing"]?.["$"]?.["w:line"]
          ? parseInt(pPr["w:spacing"]["$"]["w:line"]) / 240 // 240 twips = 1 строка
          : undefined,
      },
    });

    // Извлекаем секцию (последний параграф может содержать sectPr)
    const sectPr = pPr["w:sectPr"] || body["w:sectPr"];
    if (sectPr) {
      const pgMar = sectPr["w:pgMar"]?.["$"] || {};
      const pgSz = sectPr["w:pgSz"]?.["$"] || {};
      
      sections.push({
        margins: {
          top: pgMar["w:top"] ? parseInt(pgMar["w:top"]) / TWIPS_PER_MM : 20,
          bottom: pgMar["w:bottom"] ? parseInt(pgMar["w:bottom"]) / TWIPS_PER_MM : 20,
          left: pgMar["w:left"] ? parseInt(pgMar["w:left"]) / TWIPS_PER_MM : 30,
          right: pgMar["w:right"] ? parseInt(pgMar["w:right"]) / TWIPS_PER_MM : 15,
        },
        pageSize: {
          width: pgSz["w:w"] ? parseInt(pgSz["w:w"]) / TWIPS_PER_MM : 210,
          height: pgSz["w:h"] ? parseInt(pgSz["w:h"]) / TWIPS_PER_MM : 297,
        },
      });
    }
  });

  // Если секций нет, добавляем дефолтную
  if (sections.length === 0) {
    sections.push({
      margins: { top: 20, bottom: 20, left: 30, right: 15 },
      pageSize: { width: 210, height: 297 },
    });
  }

  return { paragraphs, sections };
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

/**
 * Проверить форматирование текста
 */
function checkTextFormatting(
  paragraphs: DocxParagraph[],
  rules: FormattingRules
): FormattingViolation[] {
  const violations: FormattingViolation[] = [];
  const textRules = rules.text;

  paragraphs.forEach((paragraph) => {
    // Пропускаем пустые параграфы
    if (!paragraph.text.trim()) return;

    // Пропускаем заголовки (они проверяются отдельно)
    if (paragraph.style?.toLowerCase().includes("heading")) return;

    const props = paragraph.properties;

    // Проверка шрифта
    if (props.fontFamily && props.fontFamily !== textRules.fontFamily) {
      violations.push({
        ruleId: `text-font-${paragraph.index}`,
        rulePath: "text.fontFamily",
        message: "Неверный шрифт",
        expected: textRules.fontFamily,
        actual: props.fontFamily,
        location: {
          paragraphIndex: paragraph.index,
          text: paragraph.text.slice(0, 50) + (paragraph.text.length > 50 ? "..." : ""),
        },
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
        location: {
          paragraphIndex: paragraph.index,
          text: paragraph.text.slice(0, 50) + (paragraph.text.length > 50 ? "..." : ""),
        },
        autoFixable: true,
      });
    }

    // Проверка выравнивания
    const alignmentMap: Record<string, string> = {
      left: "left",
      center: "center",
      right: "right",
      both: "justify",
      justify: "justify",
    };
    
    if (props.alignment) {
      const actualAlignment = alignmentMap[props.alignment] || props.alignment;
      if (actualAlignment !== textRules.alignment) {
        violations.push({
          ruleId: `text-align-${paragraph.index}`,
          rulePath: "text.alignment",
          message: "Неверное выравнивание текста",
          expected: textRules.alignment,
          actual: actualAlignment,
          location: {
            paragraphIndex: paragraph.index,
            text: paragraph.text.slice(0, 50) + (paragraph.text.length > 50 ? "..." : ""),
          },
          autoFixable: true,
        });
      }
    }

    // Проверка абзацного отступа
    if (props.indent !== undefined) {
      const tolerance = 2; // мм
      if (Math.abs(props.indent - textRules.paragraphIndent) > tolerance) {
        violations.push({
          ruleId: `text-indent-${paragraph.index}`,
          rulePath: "text.paragraphIndent",
          message: "Неверный абзацный отступ",
          expected: `${textRules.paragraphIndent} мм`,
          actual: `${Math.round(props.indent)} мм`,
          location: {
            paragraphIndex: paragraph.index,
            text: paragraph.text.slice(0, 50) + (paragraph.text.length > 50 ? "..." : ""),
          },
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
          location: {
            paragraphIndex: paragraph.index,
            text: paragraph.text.slice(0, 50) + (paragraph.text.length > 50 ? "..." : ""),
          },
          autoFixable: true,
        });
      }
    }
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
      const unitPattern = /(\d)\s+(мм|см|м|км|кг|г|мг|л|мл|с|мин|ч|%)/g;
      let match;
      while ((match = unitPattern.exec(text)) !== null) {
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

    // Проверка инициалов
    if (nbspRules.afterInitials) {
      const initialsPattern = /([А-ЯЁ]\.)\s+([А-ЯЁ]\.)\s+([А-ЯЁ][а-яё]+)/g;
      let match;
      while ((match = initialsPattern.exec(text)) !== null) {
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
 * Главная функция анализа документа
 */
export async function analyzeDocument(
  buffer: Buffer,
  rules: FormattingRules
): Promise<AnalysisResult> {
  const docxStructure = await parseDocxStructure(buffer);
  
  const violations: FormattingViolation[] = [
    ...checkMargins(docxStructure.sections, rules),
    ...checkTextFormatting(docxStructure.paragraphs, rules),
    ...checkNonBreakingSpaces(docxStructure.paragraphs, rules),
    ...checkProhibitedAbbreviations(docxStructure.paragraphs, rules),
    ...checkQuotes(docxStructure.paragraphs, rules),
    ...checkDashes(docxStructure.paragraphs, rules),
    ...checkProhibitedFormatting(docxStructure.paragraphs, rules),
  ];

  const statistics = calculateStatistics(docxStructure.paragraphs);

  const checkedRules = [
    "document.margins",
    "text.fontFamily",
    "text.fontSize",
    "text.alignment",
    "text.paragraphIndent",
    "text.lineSpacing",
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
