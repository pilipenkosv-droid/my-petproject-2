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
  findChildren,
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

/**
 * Проверяет, является ли hex-цвет "светлым" (невидим на белом фоне).
 * Используется для сброса цвета текста из документов с тёмной темой.
 */
function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "").toLowerCase();
  if (clean === "ffffff" || clean === "auto") return false; // auto — уже дефолтный
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Яркость по формуле ITU-R BT.709
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 180;
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
   * Очищает документ от нестандартных визуальных элементов:
   * - Удаляет фон документа (w:background)
   * - Удаляет многоколоночный layout (w:cols)
   *
   * Вызывать ПЕРЕД применением форматирования параграфов.
   */
  sanitizeDocumentDefaults(): void {
    // Удаляем w:background из w:document (тёмный фон документа)
    const docNode = this.parsedDocument.find((n) => "w:document" in n);
    if (docNode) {
      removeChild(docNode, "w:background");
    }

    // Удаляем w:cols из всех sectPr (многоколоночная вёрстка → одна колонка)
    const sectPr = getSectPr(this.body);
    if (sectPr) {
      removeChild(sectPr, "w:cols");
    }
    // Также проверяем sectPr внутри параграфов (секционные разрывы)
    for (const { node } of this.paragraphPositions) {
      const pPr = findChild(node, "w:pPr");
      if (pPr) {
        const innerSectPr = findChild(pPr, "w:sectPr");
        if (innerSectPr) {
          removeChild(innerSectPr, "w:cols");
        }
      }
    }
  }

  /**
   * Применяет форматирование к парагр��фу по его индексу и т��пу блока
   */
  applyFormattingToParagraph(
    index: number,
    blockType: BlockType,
    rules: FormattingRules
  ): void {
    if (index < 0 || index >= this.paragraphPositions.length) return;

    const p = this.paragraphPositions[index].node;

    // Не трогаем пустые параграфы
    if (blockType === "empty") return;

    // Не трог��ем таблицы и рисунки — они могут со��ержать сложную разме��ку
    if (blockType === "table" || blockType === "figure") return;

    // Получаем целевые параметры форматирования
    const target = this.getTargetFormatting(blockType, rules);
    if (!target) return;

    // П��лучаем/создаём w:pPr
    const pPr = ensurePPr(p);

    // Удаляем шейдинг параграфа (тёмный фон параграфа)
    removeChild(pPr, "w:shd");

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

    // Разрыв страницы перед заголовком (newPageForEach)
    if (blockType.startsWith("heading_")) {
      const levelStr = blockType.split("_")[1];
      const levelKey = `level${levelStr}` as keyof typeof rules.headings;
      const headingStyle = rules.headings[levelKey];
      if (headingStyle?.newPageForEach) {
        if (!findChild(pPr, "w:pageBreakBefore")) {
          children(pPr).unshift(createNode("w:pageBreakBefore"));
        }
      } else {
        removeChild(pPr, "w:pageBreakBefore");
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

      // Удаляем шейдинг run (фон текста)
      removeChild(rPr, "w:shd");

      // Сбрасываем цвет текста на auto (чёрный), если он был
      // светлым из-за тёмной темы документа
      const colorNode = findChild(rPr, "w:color");
      if (colorNode?.[":@"]) {
        const colorVal = colorNode[":@"]["@_w:val"];
        if (typeof colorVal === "string" && isLightColor(colorVal)) {
          setOrderedProp(rPr, "w:color", { "w:val": "auto" });
        }
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
   * Добавляет нумерацию страниц через footer (если ещё нет)
   *
   * Создаёт word/footer1.xml с полем PAGE, добавляет relationship и content type,
   * привязывает footer к sectPr. Паттерн аналогичен comments.xml в document-formatter.ts.
   */
  async applyPageNumbering(rules: FormattingRules): Promise<void> {
    // Проверяем, есть ли уже footer в _rels
    const relsPath = "word/_rels/document.xml.rels";
    const relsXml = await this.zip.file(relsPath)?.async("string");
    if (!relsXml) return;

    const relsData = parseDocxXml(relsXml);
    const relsRoot = relsData.find((n) => "Relationships" in n);
    if (!relsRoot) return;

    const rels = children(relsRoot);
    const hasFooterRel = rels.some((r) => {
      const type = r[":@"]?.["@_Type"];
      return typeof type === "string" && type.includes("/footer");
    });

    // Если footer уже есть — не перезаписываем (сохраняем оригинальный)
    if (hasFooterRel) return;

    // Генерируем footer XML
    const { buildPageNumberFooterXml, FOOTER_RELATIONSHIP_TYPE, FOOTER_CONTENT_TYPE } =
      await import("./page-numbering");

    const footerXml = buildPageNumberFooterXml(rules);
    this.zip.file("word/footer1.xml", footerXml);

    // Добавляем relationship
    let maxId = 0;
    rels.forEach((r) => {
      const id = r[":@"]?.["@_Id"];
      if (typeof id === "string") {
        const num = parseInt(id.replace("rId", "") || "0");
        if (num > maxId) maxId = num;
      }
    });

    const footerRId = `rId${maxId + 1}`;
    rels.push(
      createNode("Relationship", {
        Id: footerRId,
        Type: FOOTER_RELATIONSHIP_TYPE,
        Target: "footer1.xml",
      })
    );

    const newRelsXml = buildDocxXml(relsData);
    this.zip.file(relsPath, newRelsXml);

    // Добавляем content type
    const contentTypesXml = await this.zip
      .file("[Content_Types].xml")
      ?.async("string");
    if (contentTypesXml) {
      const contentTypes = parseDocxXml(contentTypesXml);
      const typesRoot = contentTypes.find((n) => "Types" in n);
      if (typesRoot) {
        const overrides = children(typesRoot);
        const hasFooterOverride = overrides.some(
          (o) => o[":@"]?.["@_PartName"] === "/word/footer1.xml"
        );

        if (!hasFooterOverride) {
          overrides.push(
            createNode("Override", {
              PartName: "/word/footer1.xml",
              ContentType: FOOTER_CONTENT_TYPE,
            })
          );
        }

        const newContentTypesXml = buildDocxXml(contentTypes);
        this.zip.file("[Content_Types].xml", newContentTypesXml);
      }
    }

    // Привязываем footer к body-level sectPr
    let sectPr = getSectPr(this.body);
    if (!sectPr) {
      const lastP = this.paragraphPositions[this.paragraphPositions.length - 1]?.node;
      if (lastP) {
        const pPr = findChild(lastP, "w:pPr");
        if (pPr) sectPr = findChild(pPr, "w:sectPr");
      }
    }
    if (!sectPr) {
      sectPr = createNode("w:sectPr");
      children(this.body).push(sectPr);
    }

    // w:footerReference type="default"
    children(sectPr).unshift(
      createNode("w:footerReference", {
        "w:type": "default",
        "r:id": footerRId,
      })
    );

    // w:pgNumType — начало нумерации
    const startFrom = rules.additional?.pageNumbering?.startFrom;
    if (startFrom !== undefined && startFrom > 1) {
      setOrderedProp(sectPr, "w:pgNumType", {
        "w:start": String(startFrom),
      });
    }
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

      case "formula":
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          alignment: rules.specialElements?.formulas?.alignment || "center",
          firstLineIndent: 0,
          lineSpacing: rules.text.lineSpacing,
          spaceBefore: rules.specialElements?.formulas?.spacing?.before
            ? rules.specialElements.formulas.spacing.before / 2.835
            : undefined,
          spaceAfter: rules.specialElements?.formulas?.spacing?.after
            ? rules.specialElements.formulas.spacing.after / 2.835
            : undefined,
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

      case "unknown":
      default:
        // Fallback: применяем базовое форматирование body_text вместо пропуска
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          lineSpacing: rules.text.lineSpacing,
        };
    }
  }

  /**
   * Применяет форматирование к таблицам (размер шрифта)
   */
  applyTableFormatting(rules: FormattingRules): void {
    const tableRules = rules.specialElements?.tables;
    const fontFamily = rules.text.fontFamily;
    if (!tableRules?.fontSize?.default && !fontFamily) return;

    const maxSizeHalf = tableRules?.fontSize?.default
      ? tableRules.fontSize.default * HALF_POINTS_PER_PT
      : undefined;
    const minSizeHalf = tableRules?.fontSize?.exceptional
      ? tableRules.fontSize.exceptional * HALF_POINTS_PER_PT
      : undefined;

    const bodyNodes = children(this.body);
    for (const node of bodyNodes) {
      if (!("w:tbl" in node)) continue;

      const rows = findChildren(node, "w:tr");
      for (const row of rows) {
        const cells = findChildren(row, "w:tc");
        for (const cell of cells) {
          // Удаляем шейдинг ячейки таблицы (тёмный фон ячейки)
          const tcPr = findChild(cell, "w:tcPr");
          if (tcPr) {
            removeChild(tcPr, "w:shd");
          }

          const paragraphs = findChildren(cell, "w:p");
          for (const p of paragraphs) {
            // Удаляем шейдинг параграфа в таблице
            const pPr = findChild(p, "w:pPr");
            if (pPr) {
              removeChild(pPr, "w:shd");
            }

            const runs = getRuns(p);
            for (const run of runs) {
              const rPr = ensureRPr(run);

              // Удаляем шейдинг и светлый цвет текста в таблицах
              removeChild(rPr, "w:shd");
              const colorNode = findChild(rPr, "w:color");
              if (colorNode?.[":@"]) {
                const colorVal = colorNode[":@"]["@_w:val"];
                if (typeof colorVal === "string" && isLightColor(colorVal)) {
                  setOrderedProp(rPr, "w:color", { "w:val": "auto" });
                }
              }

              // Исправлять шрифт только если он вне допустимого диапазона [exceptional..default]
              if (maxSizeHalf !== undefined) {
                const szNode = findChild(rPr, "w:sz");
                const currentSize = szNode?.[":@"]?.["@_w:val"]
                  ? Number(szNode[":@"]["@_w:val"])
                  : undefined;
                const minAllowed = minSizeHalf ?? maxSizeHalf;
                const isOutOfRange = currentSize !== undefined
                  && (currentSize < minAllowed || currentSize > maxSizeHalf);

                if (isOutOfRange || currentSize === undefined) {
                  setOrderedProp(rPr, "w:sz", { "w:val": String(maxSizeHalf) });
                  setOrderedProp(rPr, "w:szCs", { "w:val": String(maxSizeHalf) });
                }
              }

              if (fontFamily) {
                setOrderedProp(rPr, "w:rFonts", {
                  "w:ascii": fontFamily,
                  "w:hAnsi": fontFamily,
                  "w:cs": fontFamily,
                });
              }
            }
          }
        }
      }
    }
  }
}
