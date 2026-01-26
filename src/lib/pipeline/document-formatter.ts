/**
 * Форматирование документов
 * 
 * Этот модуль применяет правила форматирования к документу
 * и создаёт две версии:
 * 1. Оригинал с красными выделениями нарушений
 * 2. Исправленный документ с зелёными выделениями изменений
 * 
 * Использует семантический анализ для точного определения структуры документа.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  convertMillimetersToTwip,
  PageOrientation,
  SectionType,
  LevelFormat,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
} from "docx";
import { FormattingRules, FormattingViolation } from "@/types/formatting-rules";
import { extractFromDocx } from "../documents/docx-reader";
import JSZip from "jszip";
import { parseStringPromise, Builder } from "xml2js";
import { formatViolationMessage } from "../utils/formatting-messages";
import {
  parseDocumentSemantics,
  extractParagraphsFromText,
  isParagraphInSection,
  getSectionByType,
} from "../ai/document-semantic-parser";
import { SemanticStructure, DocumentSection } from "../ai/semantic-schemas";
import { createBibliographyParagraphs } from "../formatters/bibliography-formatter";

interface FormattingResult {
  /** Оригинальный документ с красными выделениями нарушений */
  markedOriginal: Buffer;
  /** Исправленный документ с зелёными выделениями изменений */
  formattedDocument: Buffer;
  /** Количество применённых исправлений */
  fixesApplied: number;
}

// Цвета для выделений (в формате RRGGBB без #)
const HIGHLIGHT_RED = "FFCCCC";    // Светло-красный для нарушений
const HIGHLIGHT_GREEN = "CCFFCC";  // Светло-зелёный для исправлений

/**
 * Конвертация выравнивания в формат docx
 */
function getAlignmentType(alignment: string): typeof AlignmentType[keyof typeof AlignmentType] {
  switch (alignment) {
    case "left": return AlignmentType.LEFT;
    case "right": return AlignmentType.RIGHT;
    case "center": return AlignmentType.CENTER;
    case "justify": return AlignmentType.JUSTIFIED;
    default: return AlignmentType.JUSTIFIED;
  }
}

/**
 * Применить выделение к тексту в XML документе
 */
async function applyHighlightToXml(
  buffer: Buffer,
  violations: FormattingViolation[],
  highlightColor: string
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  
  if (!documentXml) {
    throw new Error("Не удалось прочитать document.xml");
  }

  // Для простоты MVP: добавляем комментарий о нарушениях
  // Полноценное выделение требует сложной работы с XML-разметкой
  
  // В продакшене здесь был бы более сложный алгоритм:
  // 1. Парсинг XML
  // 2. Поиск нужных параграфов по индексу
  // 3. Добавление <w:highlight w:val="yellow"/> или аналога
  // 4. Сборка обратно в XML

  // Для MVP возвращаем оригинал (выделения будут в отформатированном документе)
  return buffer;
}

/**
 * Определяет тип заголовка на основе семантической информации
 */
function getHeadingLevel(
  section: DocumentSection | undefined
): typeof HeadingLevel[keyof typeof HeadingLevel] | undefined {
  if (!section || !section.level) return undefined;

  switch (section.level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    default:
      return undefined;
  }
}

/**
 * Создать новый отформатированный документ с семантическим анализом
 */
async function createFormattedDocument(
  originalBuffer: Buffer,
  rules: FormattingRules,
  violations: FormattingViolation[]
): Promise<Buffer> {
  // Извлекаем текст из оригинала
  const content = await extractFromDocx(originalBuffer);
  
  // Разбиваем текст на параграфы
  const paragraphTexts = content.text.split(/\n\n+/).filter((p) => p.trim());
  const paragraphsForAI = extractParagraphsFromText(content.text);
  
  // Семантический анализ документа
  console.log("🔍 Запуск семантического анализа документа...");
  const semanticStructure = await parseDocumentSemantics(paragraphsForAI);
  console.log(`✅ Анализ завершен. Уверенность: ${(semanticStructure.confidence * 100).toFixed(0)}%`);
  
  if (semanticStructure.warnings && semanticStructure.warnings.length > 0) {
    console.warn("⚠️ Предупреждения:", semanticStructure.warnings);
  }
  
  // Создаём violationsMap для быстрого поиска
  const violationsByParagraph = new Map<number, FormattingViolation[]>();
  violations.forEach((v) => {
    if (v.location.paragraphIndex !== undefined) {
      const existing = violationsByParagraph.get(v.location.paragraphIndex) || [];
      existing.push(v);
      violationsByParagraph.set(v.location.paragraphIndex, existing);
    }
  });

  // Создаём параграфы с правильным форматированием
  const docParagraphs: Paragraph[] = [];
  
  // Обрабатываем каждый параграф
  for (let index = 0; index < paragraphTexts.length; index++) {
    const text = paragraphTexts[index];
    const hasViolations = violationsByParagraph.has(index);
    
    // Проверяем, является ли это частью библиографии
    if (semanticStructure.bibliography && 
        isParagraphInSection(index, semanticStructure.bibliography)) {
      // Библиографию обрабатываем отдельно в конце
      continue;
    }
    
    // Находим секцию для параграфа
    const section = semanticStructure.sections.find((s) =>
      isParagraphInSection(index, s)
    );
    
    // Определяем параметры форматирования на основе семантики
    const heading = getHeadingLevel(section);
    let fontSize = rules.text.fontSize * 2;
    let bold = false;
    let alignment = getAlignmentType(rules.text.alignment);
    let isHeading = false;

    if (section?.level) {
      isHeading = true;
      const headingStyle =
        section.level === 1 ? rules.headings.level1 :
        section.level === 2 ? rules.headings.level2 :
        section.level === 3 ? rules.headings.level3 :
        rules.headings.level4;

      if (headingStyle) {
        fontSize = (headingStyle.fontSize || rules.text.fontSize) * 2;
        bold = headingStyle.bold ?? true;
        alignment = getAlignmentType(headingStyle.alignment || rules.text.alignment);
      }
    }

    docParagraphs.push(
      new Paragraph({
        heading,
        alignment,
        indent: isHeading ? undefined : {
          firstLine: convertMillimetersToTwip(rules.text.paragraphIndent),
        },
        spacing: {
          line: rules.text.lineSpacing * 240,
        },
        children: [
          new TextRun({
            text: text.trim(),
            font: rules.text.fontFamily,
            size: fontSize,
            bold,
            shading: hasViolations ? { fill: HIGHLIGHT_GREEN } : undefined,
          }),
        ],
      })
    );
  }
  
  // Добавляем отформатированную библиографию
  if (semanticStructure.bibliography && semanticStructure.bibliography.entries.length > 0) {
    console.log(`📚 Форматирование списка литературы: ${semanticStructure.bibliography.entries.length} источников`);
    const bibliographyParagraphs = createBibliographyParagraphs(
      semanticStructure.bibliography,
      rules
    );
    docParagraphs.push(...bibliographyParagraphs);
  }

  // Создаём документ с правильными настройками страницы
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
              orientation: rules.document.orientation === "landscape" 
                ? PageOrientation.LANDSCAPE 
                : PageOrientation.PORTRAIT,
            },
            margin: {
              top: convertMillimetersToTwip(rules.document.margins.top),
              bottom: convertMillimetersToTwip(rules.document.margins.bottom),
              left: convertMillimetersToTwip(rules.document.margins.left),
              right: convertMillimetersToTwip(rules.document.margins.right),
            },
          },
        },
        children: docParagraphs,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Создать документ с пометками нарушений
 * Модифицирует оригинальный документ, добавляя:
 * - красное выделение участков с нарушениями
 * - комментарии Word с описанием нарушений
 */
async function createMarkedOriginal(
  originalBuffer: Buffer,
  violations: FormattingViolation[]
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originalBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  
  if (!documentXml) {
    throw new Error("Не удалось прочитать document.xml");
  }

  // Парсим XML документа
  const parsed = await parseStringPromise(documentXml);

  const body = parsed["w:document"]["w:body"][0];
  if (!body) {
    throw new Error("Не удалось найти тело документа");
  }

  // Создаём violationsMap для быстрого доступа
  const violationsByParagraph = new Map<number, FormattingViolation[]>();
  violations.forEach((v) => {
    if (v.location.paragraphIndex !== undefined) {
      const existing = violationsByParagraph.get(v.location.paragraphIndex) || [];
      existing.push(v);
      violationsByParagraph.set(v.location.paragraphIndex, existing);
    }
  });

  // Обрабатываем параграфы
  const pElements = body["w:p"] || [];
  const comments: any[] = [];
  let commentId = 0;

  pElements.forEach((p: any, index: number) => {
    const paragraphViolations = violationsByParagraph.get(index);
    
    if (paragraphViolations && paragraphViolations.length > 0) {
      // Получаем все текстовые раны в параграфе
      const runs = p["w:r"] || [];
      
      // Добавляем красное выделение к каждому текстовому рану
      runs.forEach((run: any) => {
        if (!run["w:rPr"]) {
          run["w:rPr"] = [{}];
        }
        
        const rPr = run["w:rPr"][0];
        
        // Добавляем красное выделение
        rPr["w:highlight"] = [{ "$": { "w:val": "red" } }];
      });

      // Создаём текст комментария с описанием нарушений
      const violationTexts = paragraphViolations
        .map(v => formatViolationMessage(v.message, v.expected, v.actual, v.ruleId))
        .join("\n");

      // Добавляем комментарий
      const currentCommentId = commentId;
      
      comments.push({
        "$": {
          "w:id": String(currentCommentId),
          "w:author": "SmartFormatter",
          "w:date": new Date().toISOString(),
          "w:initials": "SF",
        },
        "w:p": [{
          "w:pPr": [{ "w:pStyle": [{ "$": { "w:val": "CommentText" } }] }],
          "w:r": [{
            "w:t": [violationTexts],
          }],
        }],
      });

      // Добавляем маркеры комментария в параграф
      // Создаём commentRangeStart в начале параграфа
      if (!p["w:commentRangeStart"]) {
        p["w:commentRangeStart"] = [];
      }
      p["w:commentRangeStart"].unshift({
        "$": { "w:id": String(currentCommentId) },
      });

      // Создаём commentRangeEnd в конце параграфа
      if (!p["w:commentRangeEnd"]) {
        p["w:commentRangeEnd"] = [];
      }
      p["w:commentRangeEnd"].push({
        "$": { "w:id": String(currentCommentId) },
      });

      // Добавляем commentReference
      if (!p["w:r"]) {
        p["w:r"] = [];
      }
      p["w:r"].push({
        "w:commentReference": [{
          "$": { "w:id": String(currentCommentId) },
        }],
      });

      commentId++;
    }
  });

  // Собираем XML обратно
  const builder = new Builder({
    xmldec: { version: "1.0", encoding: "UTF-8", standalone: true },
    renderOpts: { pretty: false },
  });
  
  const newDocumentXml = builder.buildObject(parsed);
  zip.file("word/document.xml", newDocumentXml);

  // Создаём comments.xml если есть комментарии
  if (comments.length > 0) {
    const commentsDoc = {
      "w:comments": {
        "$": {
          "xmlns:w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
          "xmlns:w14": "http://schemas.microsoft.com/office/word/2010/wordml",
          "xmlns:w15": "http://schemas.microsoft.com/office/word/2012/wordml",
          "xmlns:mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
          "mc:Ignorable": "w14 w15",
        },
        "w:comment": comments,
      },
    };

    const commentsXml = builder.buildObject(commentsDoc);
    zip.file("word/comments.xml", commentsXml);

    // Добавляем связь с comments.xml в document.xml.rels
    const relsPath = "word/_rels/document.xml.rels";
    const relsXml = await zip.file(relsPath)?.async("string");
    
    if (relsXml) {
      const relsData = await parseStringPromise(relsXml);
      let relationships = relsData.Relationships.Relationship;
      
      // Убедимся, что relationships это массив
      if (!Array.isArray(relationships)) {
        relationships = relationships ? [relationships] : [];
        relsData.Relationships.Relationship = relationships;
      }
      
      // Проверяем, есть ли уже связь с comments
      const hasCommentsRel = relationships.some(
        (r: any) => r.$?.Type?.includes("comments")
      );

      if (!hasCommentsRel) {
        const maxId = relationships.length > 0 
          ? Math.max(...relationships.map((r: any) => 
              parseInt(r.$?.Id?.replace("rId", "") || "0")
            ))
          : 0;

        relationships.push({
          $: {
            Id: `rId${maxId + 1}`,
            Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
            Target: "comments.xml",
          },
        });

        const newRelsXml = builder.buildObject(relsData);
        zip.file(relsPath, newRelsXml);
      }
    } else {
      // Создаём новый rels файл, если его нет
      const relsData = {
        Relationships: {
          $: {
            xmlns: "http://schemas.openxmlformats.org/package/2006/relationships",
          },
          Relationship: [
            {
              $: {
                Id: "rId1",
                Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
                Target: "comments.xml",
              },
            },
          ],
        },
      };
      
      const newRelsXml = builder.buildObject(relsData);
      zip.file(relsPath, newRelsXml);
      
      // Также убедимся, что папка _rels существует
      zip.folder("word/_rels");
    }

    // Добавляем тип контента для comments.xml
    const contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");
    if (contentTypesXml) {
      const contentTypes = await parseStringPromise(contentTypesXml);
      let overrides = contentTypes.Types.Override;
      
      // Убедимся, что overrides это массив
      if (!Array.isArray(overrides)) {
        overrides = overrides ? [overrides] : [];
        contentTypes.Types.Override = overrides;
      }
      
      const hasCommentsOverride = overrides.some(
        (o: any) => o.$?.PartName === "/word/comments.xml"
      );

      if (!hasCommentsOverride) {
        overrides.push({
          $: {
            PartName: "/word/comments.xml",
            ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
          },
        });

        const newContentTypesXml = builder.buildObject(contentTypes);
        zip.file("[Content_Types].xml", newContentTypesXml);
      }
    }
  }

  // Генерируем обновлённый документ
  return await zip.generateAsync({ 
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

/**
 * Главная функция форматирования документа
 */
export async function formatDocument(
  buffer: Buffer,
  rules: FormattingRules,
  violations: FormattingViolation[]
): Promise<FormattingResult> {
  const [markedOriginal, formattedDocument] = await Promise.all([
    createMarkedOriginal(buffer, violations),
    createFormattedDocument(buffer, rules, violations),
  ]);

  return {
    markedOriginal,
    formattedDocument,
    fixesApplied: violations.filter((v) => v.autoFixable).length,
  };
}
