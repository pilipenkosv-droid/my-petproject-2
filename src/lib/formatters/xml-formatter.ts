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
    if (blockType === "table" || blockType === "figure") {
      this.cleanProhibitedFormatting(p, true);
      return;
    }

    // Получаем целевые параметры форматирования
    const target = this.getTargetFormatting(blockType, rules);
    if (!target) return;

    // П��лучаем/создаём w:pPr
    const pPr = ensurePPr(p);

    // Удаляем шейдинг параграфа (тёмный фон параграфа)
    removeChild(pPr, "w:shd");

    // Удаляем outlineLvl у не-заголовков — иначе они попадают в TOC
    const isHeading = blockType.startsWith("heading_") || blockType === "bibliography_title";
    if (!isHeading) {
      removeChild(pPr, "w:outlineLvl");
      // Также убираем Heading pStyle если блок — не заголовок
      const pStyleNode = findChild(pPr, "w:pStyle");
      if (pStyleNode?.[":@"]) {
        const styleVal = String(pStyleNode[":@"]["@_w:val"] || "");
        if (/^Heading\d$/i.test(styleVal)) {
          removeChild(pPr, "w:pStyle");
        }
      }
    }

    // TOC entries: убираем w:pStyle (TOC1/TOC2 наследуют sz=24/12pt из стиля)
    if (blockType === "toc_entry") {
      removeChild(pPr, "w:pStyle");
    }

    // Очищаем запрещённое форматирование в paragraph-level rPr (default run props)
    const pPrRPr = findChild(pPr, "w:rPr");
    if (pPrRPr) {
      removeChild(pPrRPr, "w:u");
      removeChild(pPrRPr, "w:highlight");
      removeChild(pPrRPr, "w:shd");
      const pColorNode = findChild(pPrRPr, "w:color");
      if (pColorNode?.[":@"]) {
        const pColorVal = pColorNode[":@"]["@_w:val"];
        if (typeof pColorVal === "string" && pColorVal !== "auto" && pColorVal !== "000000") {
          setOrderedProp(pPrRPr, "w:color", { "w:val": "auto" });
        }
      }
    }

    // Применяем выравнивание
    if (target.alignment) {
      setOrderedProp(pPr, "w:jc", { "w:val": alignmentToXml(target.alignment) });
    }

    // Применяем отступ первой строки
    // ВАЖНО: firstLine и hanging взаимоисключающи в Word.
    // Нужно удалять конфликтующий атрибут при установке другого.
    if (target.firstLineIndent !== undefined) {
      const indentTwips = Math.round(target.firstLineIndent * TWIPS_PER_MM);
      if (indentTwips > 0) {
        setOrderedProp(pPr, "w:ind", {
          "w:firstLine": String(indentTwips),
        });
        // Удаляем hanging — он конфликтует с firstLine
        const indNode = findChild(pPr, "w:ind");
        if (indNode?.[":@"]) {
          delete indNode[":@"]["@_w:hanging"];
        }
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
      // Удаляем firstLine — он конфликтует с hanging
      const indNode = findChild(pPr, "w:ind");
      if (indNode?.[":@"]) {
        delete indNode[":@"]["@_w:firstLine"];
      }
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

    // Заголовки: устанавливаем w:pStyle + w:outlineLvl (нужно для TOC field code)
    if (blockType.startsWith("heading_")) {
      const levelStr = blockType.split("_")[1];
      const level = parseInt(levelStr, 10);
      const levelKey = `level${levelStr}` as keyof typeof rules.headings;
      const headingStyle = rules.headings[levelKey];

      // w:pStyle — Word heading style (Heading1, Heading2, ...)
      // Это ключевое для работы TOC \u (use heading styles)
      setOrderedProp(pPr, "w:pStyle", { "w:val": `Heading${level}` });

      // w:outlineLvl — outline level (0-based: Heading1=0, Heading2=1, ...)
      // Это ключевое для работы TOC \o "1-3" (outline levels)
      setOrderedProp(pPr, "w:outlineLvl", { "w:val": String(level - 1) });

      // Разрыв страницы перед заголовком
      // heading_1: ГОСТ п.5.2 — всегда с новой страницы
      const needsPageBreak = level === 1 || headingStyle?.newPageForEach;
      if (needsPageBreak) {
        if (!findChild(pPr, "w:pageBreakBefore")) {
          children(pPr).push(createNode("w:pageBreakBefore"));
        }
      } else {
        removeChild(pPr, "w:pageBreakBefore");
      }
    }

    // bibliography_title: стиль Heading1 + outlineLvl 0 (для TOC) + pageBreakBefore
    if (blockType === "bibliography_title") {
      setOrderedProp(pPr, "w:pStyle", { "w:val": "Heading1" });
      setOrderedProp(pPr, "w:outlineLvl", { "w:val": "0" });
      if (!findChild(pPr, "w:pageBreakBefore")) {
        children(pPr).push(createNode("w:pageBreakBefore"));
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

      // Удаляем подчёркивание (ГОСТ п.4.3.6 — запрещено), кроме титульной страницы (линии подписей)
      if (!blockType.startsWith("title_page")) {
        removeChild(rPr, "w:u");
      }

      // Удаляем цветное выделение текста (жёлтое/зелёное и т.д.)
      removeChild(rPr, "w:highlight");

      // Удаляем шейдинг run (фон текста)
      removeChild(rPr, "w:shd");

      // Сбрасываем цвет текста на auto (чёрный) — все не-чёрные цвета
      const colorNode = findChild(rPr, "w:color");
      if (colorNode?.[":@"]) {
        const colorVal = colorNode[":@"]["@_w:val"];
        if (typeof colorVal === "string" && colorVal !== "auto" && colorVal !== "000000") {
          setOrderedProp(rPr, "w:color", { "w:val": "auto" });
        }
      }
    }

    // Устанавливаем fontSize в paragraph-level default run props (w:pPr > w:rPr)
    // Это нужно для TOC entries: Word наследует sz из стиля TOC1/TOC2,
    // paragraph-level rPr перебивает наследование стиля
    if (target.fontSize !== undefined) {
      const sizeHalf = target.fontSize * HALF_POINTS_PER_PT;
      let pRPr = findChild(pPr, "w:rPr");
      if (!pRPr) {
        pRPr = createNode("w:rPr");
        children(pPr).push(pRPr);
      }
      setOrderedProp(pRPr, "w:sz", { "w:val": String(sizeHalf) });
      setOrderedProp(pRPr, "w:szCs", { "w:val": String(sizeHalf) });
    }
  }

  /**
   * Удаляет запрещённое форматирование (underline, highlight, shd, color)
   * из paragraph-level rPr и всех runs.
   */
  private cleanProhibitedFormatting(
    p: OrderedXmlNode,
    removeUnderline: boolean
  ): void {
    const pPr = findChild(p, "w:pPr");
    if (pPr) {
      removeChild(pPr, "w:shd");
      const pPrRPr = findChild(pPr, "w:rPr");
      if (pPrRPr) {
        if (removeUnderline) removeChild(pPrRPr, "w:u");
        removeChild(pPrRPr, "w:highlight");
        removeChild(pPrRPr, "w:shd");
        const pColorNode = findChild(pPrRPr, "w:color");
        if (pColorNode?.[":@"]) {
          const cv = pColorNode[":@"]["@_w:val"];
          if (typeof cv === "string" && cv !== "auto" && cv !== "000000") {
            setOrderedProp(pPrRPr, "w:color", { "w:val": "auto" });
          }
        }
      }
    }

    const runs = getRuns(p);
    for (const run of runs) {
      const rPr = findChild(run, "w:rPr");
      if (!rPr) continue;
      if (removeUnderline) removeChild(rPr, "w:u");
      removeChild(rPr, "w:highlight");
      removeChild(rPr, "w:shd");
      const colorNode = findChild(rPr, "w:color");
      if (colorNode?.[":@"]) {
        const cv = colorNode[":@"]["@_w:val"];
        if (typeof cv === "string" && cv !== "auto" && cv !== "000000") {
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
    const footerRel = rels.find((r) => {
      const type = r[":@"]?.["@_Type"];
      return typeof type === "string" && type.includes("/footer");
    });

    // Если footer уже есть — корректируем выравнивание и шрифт
    if (footerRel) {
      const target = footerRel[":@"]?.["@_Target"];
      if (typeof target === "string") {
        const footerPath = target.startsWith("word/") ? target : `word/${target}`;
        const existingFooterXml = await this.zip.file(footerPath)?.async("string");
        if (existingFooterXml) {
          await this.fixExistingFooter(footerPath, existingFooterXml, rules);
        }
      }
      return;
    }

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
   * Корректирует существующий footer: выравнивание → center, шрифт → ГОСТ
   */
  private async fixExistingFooter(
    footerPath: string,
    footerXml: string,
    rules: FormattingRules
  ): Promise<void> {
    const pn = rules.additional?.pageNumbering;
    const targetAlignment = alignmentToXml(pn?.alignment || "center");
    const fontSize = pn?.fontSize || 12;
    const sizeHalf = fontSize * HALF_POINTS_PER_PT;
    const fontFamily = rules.text.fontFamily || "Times New Roman";

    const parsed = parseDocxXml(footerXml);
    const ftrRoot = parsed.find((n) => "w:ftr" in n);
    if (!ftrRoot) return;

    // Собираем все w:p — включая вложенные в w:sdt > w:sdtContent
    const paragraphs: OrderedXmlNode[] = [];
    const collectParagraphs = (parent: OrderedXmlNode) => {
      for (const child of children(parent)) {
        if ("w:p" in child) paragraphs.push(child);
        if ("w:sdt" in child) {
          const sdtContent = findChild(child, "w:sdtContent");
          if (sdtContent) collectParagraphs(sdtContent);
        }
      }
    };
    collectParagraphs(ftrRoot);

    for (const p of paragraphs) {
      // Ищем параграф с полем PAGE
      const runs = getRuns(p);
      const hasPageField = runs.some((r) => {
        const instrText = findChild(r, "w:instrText");
        if (instrText) {
          const text = children(instrText)
            .filter((c): c is { "#text": string } => "#text" in c)
            .map((c) => c["#text"])
            .join("");
          return text.toUpperCase().includes("PAGE");
        }
        const fldChar = findChild(r, "w:fldChar");
        return !!fldChar;
      });

      if (!hasPageField && paragraphs.length > 1) continue;

      // Обновляем выравнивание
      const pPr = ensurePPr(p);
      setOrderedProp(pPr, "w:jc", { "w:val": targetAlignment });

      // Обновляем шрифт и размер во всех runs
      for (const run of runs) {
        const rPr = ensureRPr(run);
        setOrderedProp(rPr, "w:sz", { "w:val": String(sizeHalf) });
        setOrderedProp(rPr, "w:szCs", { "w:val": String(sizeHalf) });
        setOrderedProp(rPr, "w:rFonts", {
          "w:ascii": fontFamily,
          "w:hAnsi": fontFamily,
          "w:cs": fontFamily,
        });
      }
    }

    const newFooterXml = buildDocxXml(parsed);
    this.zip.file(footerPath, newFooterXml);
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
          alignment: "center",
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
        // Generic fallback — только шрифт, убираем отступ, сохраняем оригинальное форматирование
        return {
          fontFamily: rules.text.fontFamily,
          firstLineIndent: 0,
          lineSpacing: 1.0,
        };

      case "title_page_header":
        // Шапка: вуз, министерство, кафедра — 14pt, по центру, одинарный интервал
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          alignment: "center",
          firstLineIndent: 0,
          lineSpacing: 1.0,
        };

      case "title_page_title":
        // Тип и тема работы — 14pt, по центру, жирный, одинарный
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          bold: true,
          alignment: "center",
          firstLineIndent: 0,
          lineSpacing: 1.0,
        };

      case "title_page_info":
        // Автор, руководитель — 14pt, сохраняем оригинальное выравнивание
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          firstLineIndent: 0,
          lineSpacing: 1.0,
        };

      case "title_page_annotation":
        // Пояснительный текст "(подпись, оценка)" — 10pt, курсив
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: 10,
          italic: true,
          firstLineIndent: 0,
          lineSpacing: 1.0,
        };

      case "title_page_footer":
        // Город и год — 14pt, по центру
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          alignment: "center",
          firstLineIndent: 0,
          lineSpacing: 1.0,
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
          firstLineIndent: 0,
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
        // Fallback: применяем body_text форматирование (включая отступ и выравнивание)
        // AITUNNEL может вернуть unknown при сбое — параграфы не должны терять отступы
        return {
          fontFamily: rules.text.fontFamily,
          fontSize: rules.text.fontSize,
          alignment: rules.text.alignment,
          firstLineIndent: rules.text.paragraphIndent,
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

      // Ограничиваем ширину таблицы: 100% ширины страницы (5000 = 100% в единицах pct)
      const tblPr = findChild(node, "w:tblPr");
      if (tblPr) {
        // Устанавливаем ширину таблицы = 100% доступного пространства
        setOrderedProp(tblPr, "w:tblW", { "w:w": "5000", "w:type": "pct" });
        // Устанавливаем autofit: таблица подстраивается под содержимое в пределах ширины
        setOrderedProp(tblPr, "w:tblLayout", { "w:type": "autofit" });
      }

      const rows = findChildren(node, "w:tr");
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];

        // Повтор заголовка таблицы при переносе на другую страницу (ГОСТ)
        // w:tblHeader на первой строке — Word повторяет её на каждой странице
        if (rowIdx === 0 && rows.length > 1) {
          const trPr = findChild(row, "w:trPr") || createNode("w:trPr");
          if (!findChild(row, "w:trPr")) {
            children(row).unshift(trPr);
          }
          if (!findChild(trPr, "w:tblHeader")) {
            children(trPr).push(createNode("w:tblHeader"));
          }
        }

        const cells = findChildren(row, "w:tc");
        for (const cell of cells) {
          // Удаляем шейдинг ячейки таблицы (тёмный фон ячейки)
          const tcPr = findChild(cell, "w:tcPr");
          if (tcPr) {
            removeChild(tcPr, "w:shd");
          }

          const paragraphs = findChildren(cell, "w:p");
          for (const p of paragraphs) {
            // Устанавливаем межстрочный интервал 1.5 в ячейках таблицы
            const cellPPr = ensurePPr(p);
            const existingSpacing = findChild(cellPPr, "w:spacing");
            if (existingSpacing?.[":@"]) {
              existingSpacing[":@"]["@_w:line"] = "360";
              existingSpacing[":@"]["@_w:lineRule"] = "auto";
            } else {
              setOrderedProp(cellPPr, "w:spacing", { "w:line": "360", "w:lineRule": "auto" });
            }

            // Удаляем шейдинг параграфа в таблице
            removeChild(cellPPr, "w:shd");

            const runs = getRuns(p);
            for (const run of runs) {
              const rPr = ensureRPr(run);

              // Удаляем подчёркивание, выделение и шейдинг в таблицах
              removeChild(rPr, "w:u");
              removeChild(rPr, "w:highlight");
              removeChild(rPr, "w:shd");
              // Сбрасываем цвет текста на auto — все не-чёрные цвета
              const colorNode = findChild(rPr, "w:color");
              if (colorNode?.[":@"]) {
                const colorVal = colorNode[":@"]["@_w:val"];
                if (typeof colorVal === "string" && colorVal !== "auto" && colorVal !== "000000") {
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
