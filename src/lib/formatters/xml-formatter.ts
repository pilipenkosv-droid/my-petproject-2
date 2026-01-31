/**
 * XML-форматтер для docx-документов
 *
 * Модифицирует оригинальный XML документа in-place,
 * сохраняя все изображения, таблицы, встроенные объекты.
 *
 * Использует fast-xml-parser с preserveOrder для сохранения
 * порядка элементов (w:p, w:tbl и т.д.) в document body.
 */

import JSZip from "jszip";
import { FormattingRules } from "@/types/formatting-rules";
import { BlockType } from "../ai/block-markup-schemas";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  getParagraphsWithPositions,
  getSectPr,
  ensurePPr,
  ensureRPr,
  getRuns,
  findChild,
  setOrderedProp,
  removeChild,
  createNode,
  children,
} from "../xml/docx-xml";

const TWIPS_PER_MM = 56.7;
const HALF_POINTS_PER_PT = 2;

/**
 * Маппинг выравнивания в значения w:jc
 */
function alignmentToXml(alignment: string): string {
  switch (alignment) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "center":
      return "center";
    case "justify":
      return "both";
    default:
      return "both";
  }
}

export class XmlDocumentFormatter {
  private zip!: JSZip;
  private parsedDocument!: OrderedXmlNode[];
  private body!: OrderedXmlNode;
  private paragraphPositions!: {
    node: OrderedXmlNode;
    bodyIndex: number;
    paragraphIndex: number;
  }[];

  async loadDocument(buffer: Buffer): Promise<void> {
    this.zip = await JSZip.loadAsync(buffer);
    const documentXml = await this.zip
      .file("word/document.xml")
      ?.async("string");

    if (!documentXml) {
      throw new Error("Cannot read word/document.xml from docx");
    }

    this.parsedDocument = parseDocxXml(documentXml);
    const body = getBody(this.parsedDocument);
    if (!body) {
      throw new Error("Cannot find document body");
    }

    this.body = body;
    this.paragraphPositions = getParagraphsWithPositions(body);
  }

  /**
   * Применяет форматирование к параграфу по его индексу и типу блока
   */
  applyFormattingToParagraph(
    index: number,
    blockType: BlockType,
    rules: FormattingRules
  ): void {
    if (index < 0 || index >= this.paragraphPositions.length) return;

    const p = this.paragraphPositions[index].node;

    // Не трогаем пустые параграфы и неизвестные типы
    if (blockType === "empty" || blockType === "unknown") return;

    // Не трогаем таблицы, формулы, рисунки — они могут содержать сложную разметку
    if (
      blockType === "table" ||
      blockType === "formula" ||
      blockType === "figure"
    )
      return;

    // Получаем целевые параметры форматирования
    const target = this.getTargetFormatting(blockType, rules);
    if (!target) return;

    // Получаем/создаём w:pPr
    const pPr = ensurePPr(p);

    // Применяем выравнивание
    if (target.alignment) {
      setOrderedProp(pPr, "w:jc", { "w:val": alignmentToXml(target.alignment) });
    }

    // Применяем отступ первой строки
    if (target.firstLineIndent !== undefined) {
      const indentTwips = Math.round(target.firstLineIndent * TWIPS_PER_MM);
      if (indentTwips > 0) {
        setOrderedProp(pPr, "w:ind", {
          "w:firstLine": String(indentTwips),
        });
      } else {
        // Убираем отступ первой строки
        const indNode = findChild(pPr, "w:ind");
        if (indNode?.[":@"]) {
          delete indNode[":@"]["@_w:firstLine"];
        }
      }
    }

    // Применяем висячий отступ (для библиографии)
    if (target.hangingIndent !== undefined && target.hangingIndent > 0) {
      const hangTwips = Math.round(target.hangingIndent * TWIPS_PER_MM);
      const leftTwips = hangTwips;
      setOrderedProp(pPr, "w:ind", {
        "w:hanging": String(hangTwips),
        "w:left": String(leftTwips),
      });
    }

    // Применяем межстрочный интервал
    if (target.lineSpacing !== undefined) {
      const lineVal = Math.round(target.lineSpacing * 240);
      setOrderedProp(pPr, "w:spacing", { "w:line": String(lineVal), "w:lineRule": "auto" });
    }

    // Применяем интервал до/после
    if (target.spaceBefore !== undefined || target.spaceAfter !== undefined) {
      const spacingAttrs: Record<string, string> = {};
      if (target.spaceBefore !== undefined) {
        spacingAttrs["w:before"] = String(
          Math.round(target.spaceBefore * TWIPS_PER_MM)
        );
      }
      if (target.spaceAfter !== undefined) {
        spacingAttrs["w:after"] = String(
          Math.round(target.spaceAfter * TWIPS_PER_MM)
        );
      }
      // Мержим с существующим spacing
      const existingSpacing = findChild(pPr, "w:spacing");
      if (existingSpacing?.[":@"]) {
        for (const [key, val] of Object.entries(spacingAttrs)) {
          existingSpacing[":@"]![`@_${key}`] = val;
        }
      } else {
        setOrderedProp(pPr, "w:spacing", spacingAttrs);
      }
    }

    // Применяем форматирование runs (шрифт, размер, bold)
    const runs = getRuns(p);
    for (const run of runs) {
      const rPr = ensureRPr(run);

      if (target.fontFamily) {
        setOrderedProp(rPr, "w:rFonts", {
          "w:ascii": target.fontFamily,
          "w:hAnsi": target.fontFamily,
          "w:cs": target.fontFamily,
        });
      }

      if (target.fontSize !== undefined) {
        const sizeHalf = target.fontSize * HALF_POINTS_PER_PT;
        setOrderedProp(rPr, "w:sz", { "w:val": String(sizeHalf) });
        setOrderedProp(rPr, "w:szCs", { "w:val": String(sizeHalf) });
      }

      if (target.bold === true) {
        if (!findChild(rPr, "w:b")) {
          children(rPr).push(createNode("w:b"));
        }
      } else if (target.bold === false) {
        removeChild(rPr, "w:b");
        removeChild(rPr, "w:bCs");
      }

      if (target.italic === true) {
        if (!findChild(rPr, "w:i")) {
          children(rPr).push(createNode("w:i"));
        }
      } else if (target.italic === false) {
        removeChild(rPr, "w:i");
        removeChild(rPr, "w:iCs");
      }
    }
  }

  /**
   * Применяет поля страницы ко всему документу
   */
  applyPageMargins(rules: FormattingRules): void {
    // Ищем sectPr в body
    let sectPr = getSectPr(this.body);

    if (!sectPr) {
      // Ищем в последнем параграфе pPr
      const lastP = this.paragraphPositions[this.paragraphPositions.length - 1]?.node;
      if (lastP) {
        const pPr = findChild(lastP, "w:pPr");
        if (pPr) {
          sectPr = findChild(pPr, "w:sectPr");
        }
      }
    }

    if (!sectPr) {
      // Создаём sectPr в body
      sectPr = createNode("w:sectPr");
      children(this.body).push(sectPr);
    }

    const margins = rules.document.margins;
    setOrderedProp(sectPr, "w:pgMar", {
      "w:top": String(Math.round(margins.top * TWIPS_PER_MM)),
      "w:bottom": String(Math.round(margins.bottom * TWIPS_PER_MM)),
      "w:left": String(Math.round(margins.left * TWIPS_PER_MM)),
      "w:right": String(Math.round(margins.right * TWIPS_PER_MM)),
    });
  }

  /**
   * Сохраняет модифицированный документ
   */
  async saveDocument(): Promise<Buffer> {
    const newXml = buildDocxXml(this.parsedDocument);
    this.zip.file("word/document.xml", newXml);

    return (await this.zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    })) as Buffer;
  }

  /**
   * Возвращает количество параграфов
   */
  get paragraphCount(): number {
    return this.paragraphPositions.length;
  }

  /**
   * Определяет целевые параметры форматирования по типу блока
   */
  private getTargetFormatting(
    blockType: BlockType,
    rules: FormattingRules
  ): {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    alignment?: string;
    firstLineIndent?: number;
    hangingIndent?: number;
    lineSpacing?: number;
    spaceBefore?: number;
    spaceAfter?: number;
  } | null {
    switch (blockType) {
      case "body_text":
      case "quote":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          bold: false,
          alignment: rules.text.alignment,
          firstLineIndent: rules.text.paragraphIndent,
          lineSpacing: rules.text.lineSpacing,
        };

      case "heading_1": {
        const h = rules.headings.level1;
        return {
          fontFamily: h.fontFamily || rules.text.fontFamily,
          fontSize: h.fontSize || rules.text.fontSize,
          bold: h.bold ?? true,
          alignment: h.alignment || "center",
          firstLineIndent: 0,
          lineSpacing: rules.text.lineSpacing,
          spaceAfter: h.spaceAfter ? h.spaceAfter / 2.835 : undefined,
        };
      }

      case "heading_2": {
        const h = rules.headings.level2;
        return {
          fontFamily: h.fontFamily || rules.text.fontFamily,
          fontSize: h.fontSize || rules.text.fontSize,
          bold: h.bold ?? true,
          alignment: h.alignment || rules.text.alignment,
          firstLineIndent: h.indent || rules.text.paragraphIndent,
          lineSpacing: rules.text.lineSpacing,
          spaceBefore: h.spaceBefore ? h.spaceBefore / 2.835 : undefined,
          spaceAfter: h.spaceAfter ? h.spaceAfter / 2.835 : undefined,
        };
      }

      case "heading_3": {
        const h = rules.headings.level3;
        return {
          fontFamily: h.fontFamily || rules.text.fontFamily,
          fontSize: h.fontSize || rules.text.fontSize,
          bold: h.bold ?? true,
          alignment: h.alignment || rules.text.alignment,
          firstLineIndent: h.indent || rules.text.paragraphIndent,
          lineSpacing: rules.text.lineSpacing,
        };
      }

      case "heading_4": {
        const h = rules.headings.level4 || rules.headings.level3;
        return {
          fontFamily: h.fontFamily || rules.text.fontFamily,
          fontSize: h.fontSize || rules.text.fontSize,
          bold: h.bold ?? true,
          alignment: h.alignment || rules.text.alignment,
          firstLineIndent: h.indent || rules.text.paragraphIndent,
          lineSpacing: rules.text.lineSpacing,
        };
      }

      case "bibliography_title":
        return {
          fontFamily: rules.headings.level1.fontFamily || rules.text.fontFamily,
          fontSize: rules.headings.level1.fontSize || rules.text.fontSize,
          bold: rules.headings.level1.bold ?? true,
          alignment: rules.headings.level1.alignment || "center",
          firstLineIndent: 0,
          lineSpacing: rules.text.lineSpacing,
        };

      case "bibliography_entry":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          bold: false,
          alignment: "justify",
          firstLineIndent: 0,
          hangingIndent: 8,
          lineSpacing: rules.text.lineSpacing,
        };

      case "figure_caption":
      case "table_caption":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          bold: false,
          alignment: "center",
          firstLineIndent: 0,
          lineSpacing: rules.text.lineSpacing,
        };

      case "list_item":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          bold: false,
          alignment: rules.text.alignment,
          firstLineIndent: rules.text.paragraphIndent,
          lineSpacing: rules.text.lineSpacing,
        };

      case "title_page":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
        };

      case "toc":
        return {
          fontFamily: rules.headings.level1.fontFamily || rules.text.fontFamily,
          fontSize: rules.headings.level1.fontSize || rules.text.fontSize,
          bold: rules.headings.level1.bold ?? true,
          alignment: "center",
          firstLineIndent: 0,
        };

      case "toc_entry":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          bold: false,
          lineSpacing: rules.text.lineSpacing,
        };

      case "appendix_title":
        return {
          fontFamily: rules.headings.level1.fontFamily || rules.text.fontFamily,
          fontSize: rules.headings.level1.fontSize || rules.text.fontSize,
          bold: rules.headings.level1.bold ?? true,
          alignment: "center",
          firstLineIndent: 0,
          lineSpacing: rules.text.lineSpacing,
        };

      case "appendix_content":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          alignment: rules.text.alignment,
          firstLineIndent: rules.text.paragraphIndent,
          lineSpacing: rules.text.lineSpacing,
        };

      case "page_number":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.additional?.pageNumbering?.fontSize || 12,
          alignment: rules.additional?.pageNumbering?.alignment || "center",
        };

      case "footnote":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.specialElements?.footnotes?.fontSize || 10,
          firstLineIndent:
            rules.specialElements?.footnotes?.indent ||
            rules.text.paragraphIndent,
        };

      default:
        return null;
    }
  }
}
