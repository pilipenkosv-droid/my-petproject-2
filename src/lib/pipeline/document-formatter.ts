/**
 * Форматирование документов
 *
 * Этот модуль применяет правила форматирования к документу
 * и создаёт две версии:
 * 1. Оригинал с красными выделениями нарушений
 * 2. Исправленный документ через XML-модификацию in-place
 *
 * XML-подход сохраняет все изображения, таблицы и встроенные объекты.
 * Использует fast-xml-parser с preserveOrder для сохранения порядка элементов.
 */

import { FormattingRules, FormattingViolation } from "@/types/formatting-rules";
import JSZip from "jszip";
import { formatViolationMessage } from "../utils/formatting-messages";
import { XmlDocumentFormatter } from "../formatters/xml-formatter";
import { applyBibliographyFormattingToXmlParagraph } from "../formatters/bibliography-xml-formatter";
import { DocxParagraph, truncateDocxToPageLimit } from "./document-analyzer";
import { LAVA_CONFIG } from "../payment/config";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  getParagraphsWithPositions,
  ensurePPr,
  ensureRPr,
  getRuns,
  findChild,
  findChildren,
  children,
  createNode,
  createTextNode,
  setOrderedProp,
} from "../xml/docx-xml";

interface FormattingResult {
  /** Оригинальный документ с красными выделениями нарушений */
  markedOriginal: Buffer;
  /** Исправленный документ с зелёными выделениями изменений */
  formattedDocument: Buffer;
  /** Количество применённых исправлений */
  fixesApplied: number;
  /** Была ли применена обрезка для trial */
  wasTruncated?: boolean;
  /** Оригинальное количество страниц до обрезки */
  originalPageCount?: number;
  /** Полная версия (до обрезки) оригинала с пометками - для trial */
  fullMarkedOriginal?: Buffer;
  /** Полная версия (до обрезки) исправленного документа - для trial */
  fullFormattedDocument?: Buffer;
}

export type AccessType = "trial" | "one_time" | "subscription" | "admin" | "none";

/**
 * Создать отформатированный документ через XML-модификацию
 *
 * Вместо пересборки документа с нуля — модифицирует оригинальный XML,
 * сохраняя картинки, таблицы, встроенные объекты.
 */
async function createFormattedDocumentXml(
  originalBuffer: Buffer,
  rules: FormattingRules,
  enrichedParagraphs: DocxParagraph[]
): Promise<Buffer> {
  const formatter = new XmlDocumentFormatter();
  await formatter.loadDocument(originalBuffer);

  // Применяем поля страницы
  formatter.applyPageMargins(rules);

  // Создаём map blockType по индексу параграфа
  const blockMap = new Map(
    enrichedParagraphs.map((p) => [p.index, p])
  );

  // Применяем форматирование к каждому параграфу
  for (let i = 0; i < formatter.paragraphCount; i++) {
    const enriched = blockMap.get(i);
    const blockType = enriched?.blockType || "unknown";

    // Применяем структурное форматирование (шрифт, размер, отступы)
    formatter.applyFormattingToParagraph(i, blockType, rules);
  }

  // Применяем форматирование к таблицам (размер шрифта)
  formatter.applyTableFormatting(rules);

  // Для библиографии — дополнительно применяем текстовые замены
  // Нужно загрузить документ заново для работы с текстом через XML
  const intermediateBuffer = await formatter.saveDocument();

  // Применяем текстовые замены к библиографии
  return await applyBibliographyTextFixes(
    intermediateBuffer,
    enrichedParagraphs
  );
}

/**
 * Применяет текстовые замены в библиографии через XML
 */
async function applyBibliographyTextFixes(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[]
): Promise<Buffer> {
  // Собираем индексы библиографических записей
  const bibEntries = enrichedParagraphs.filter(
    (p) => p.blockType === "bibliography_entry"
  );

  if (bibEntries.length === 0) {
    return buffer;
  }

  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    return buffer;
  }

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
  if (!body) return buffer;

  const paragraphs = getParagraphsWithPositions(body);
  const bibIndices = new Set(bibEntries.map((p) => p.index));

  for (const { node, paragraphIndex } of paragraphs) {
    if (bibIndices.has(paragraphIndex)) {
      const enriched = enrichedParagraphs.find((p) => p.index === paragraphIndex);
      const language = enriched?.blockMetadata?.language;
      applyBibliographyFormattingToXmlParagraph(node, language);
    }
  }

  const newXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newXml);

  return (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;
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

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
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
  const paragraphs = getParagraphsWithPositions(body);
  const comments: OrderedXmlNode[] = [];
  let commentId = 0;

  paragraphs.forEach(({ node: p, paragraphIndex: index }) => {
    const paragraphViolations = violationsByParagraph.get(index);

    if (paragraphViolations && paragraphViolations.length > 0) {
      // Получаем все текстовые runs в параграфе
      const runs = getRuns(p);

      // Добавляем красное выделение к каждому run
      runs.forEach((run) => {
        const rPr = ensureRPr(run);
        setOrderedProp(rPr, "w:highlight", { "w:val": "red" });
      });

      // Создаём текст комментария с описанием нарушений
      const violationTexts = paragraphViolations
        .map((v) =>
          formatViolationMessage(v.message, v.expected, v.actual, v.ruleId)
        )
        .join("\n");

      const currentCommentId = commentId;

      // Создаём комментарий в ordered-формате
      comments.push(
        createNode("w:comment", {
          "w:id": String(currentCommentId),
          "w:author": "Diplox",
          "w:date": new Date().toISOString(),
          "w:initials": "DX",
        }, [
          createNode("w:p", undefined, [
            createNode("w:pPr", undefined, [
              createNode("w:pStyle", { "w:val": "CommentText" }),
            ]),
            createNode("w:r", undefined, [
              createNode("w:t", { "xml:space": "preserve" }, [
                createTextNode(violationTexts),
              ]),
            ]),
          ]),
        ])
      );

      // Добавляем маркеры комментария в параграф
      const pChildren = children(p);

      // commentRangeStart в начало
      pChildren.unshift(
        createNode("w:commentRangeStart", { "w:id": String(currentCommentId) })
      );

      // commentRangeEnd в конец
      pChildren.push(
        createNode("w:commentRangeEnd", { "w:id": String(currentCommentId) })
      );

      // Добавляем run с commentReference
      pChildren.push(
        createNode("w:r", undefined, [
          createNode("w:commentReference", { "w:id": String(currentCommentId) }),
        ])
      );

      commentId++;
    }
  });

  // Собираем XML обратно
  const newDocumentXml = buildDocxXml(parsed);
  zip.file("word/document.xml", newDocumentXml);

  // Создаём comments.xml если есть комментарии
  if (comments.length > 0) {
    const commentsDoc: OrderedXmlNode[] = [
      createNode("w:comments", {
        "xmlns:w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "xmlns:w14": "http://schemas.microsoft.com/office/word/2010/wordml",
        "xmlns:w15": "http://schemas.microsoft.com/office/word/2012/wordml",
        "xmlns:mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
        "mc:Ignorable": "w14 w15",
      }, comments),
    ];

    const commentsXml = buildDocxXml(commentsDoc);
    zip.file("word/comments.xml", commentsXml);

    // Добавляем связь с comments.xml в document.xml.rels
    // Для .rels используем тот же fast-xml-parser
    const relsPath = "word/_rels/document.xml.rels";
    const relsXml = await zip.file(relsPath)?.async("string");

    if (relsXml) {
      const relsData = parseDocxXml(relsXml);
      const relsRoot = relsData.find((n) => "Relationships" in n);
      if (relsRoot) {
        const rels = children(relsRoot);
        const hasCommentsRel = rels.some((r) => {
          const type = r[":@"]?.["@_Type"];
          return typeof type === "string" && type.includes("comments");
        });

        if (!hasCommentsRel) {
          // Найдём макс rId
          let maxId = 0;
          rels.forEach((r) => {
            const id = r[":@"]?.["@_Id"];
            if (typeof id === "string") {
              const num = parseInt(id.replace("rId", "") || "0");
              if (num > maxId) maxId = num;
            }
          });

          rels.push(
            createNode("Relationship", {
              Id: `rId${maxId + 1}`,
              Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
              Target: "comments.xml",
            })
          );
        }

        const newRelsXml = buildDocxXml(relsData);
        zip.file(relsPath, newRelsXml);
      }
    } else {
      const relsData: OrderedXmlNode[] = [
        createNode("Relationships", {
          xmlns: "http://schemas.openxmlformats.org/package/2006/relationships",
        }, [
          createNode("Relationship", {
            Id: "rId1",
            Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
            Target: "comments.xml",
          }),
        ]),
      ];

      const newRelsXml = buildDocxXml(relsData);
      zip.file(relsPath, newRelsXml);
    }

    // Добавляем тип контента для comments.xml
    const contentTypesXml = await zip
      .file("[Content_Types].xml")
      ?.async("string");
    if (contentTypesXml) {
      const contentTypes = parseDocxXml(contentTypesXml);
      const typesRoot = contentTypes.find((n) => "Types" in n);
      if (typesRoot) {
        const overrides = children(typesRoot);
        const hasCommentsOverride = overrides.some((o) => {
          return o[":@"]?.["@_PartName"] === "/word/comments.xml";
        });

        if (!hasCommentsOverride) {
          overrides.push(
            createNode("Override", {
              PartName: "/word/comments.xml",
              ContentType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
            })
          );
        }

        const newContentTypesXml = buildDocxXml(contentTypes);
        zip.file("[Content_Types].xml", newContentTypesXml);
      }
    }
  }

  // Генерируем обновлённый документ
  return (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  })) as Buffer;
}

/**
 * Главная функция форматирования документа
 *
 * @param buffer - исходный документ
 * @param rules - правила форматирования
 * @param violations - найденные нарушения
 * @param enrichedParagraphs - размеченные параграфы
 * @param accessType - тип доступа пользователя (для обрезки trial до 30 страниц)
 */
export async function formatDocument(
  buffer: Buffer,
  rules: FormattingRules,
  violations: FormattingViolation[],
  enrichedParagraphs?: DocxParagraph[],
  accessType?: AccessType
): Promise<FormattingResult> {
  let [markedOriginal, formattedDocument] = await Promise.all([
    createMarkedOriginal(buffer, violations),
    enrichedParagraphs
      ? createFormattedDocumentXml(buffer, rules, enrichedParagraphs)
      : Promise.resolve(buffer), // fallback: return original if no markup
  ]);

  // Для trial — обрезаем оба результата до лимита страниц ПОСЛЕ форматирования
  // Но СОХРАНЯЕМ полные версии для разблокировки после оплаты
  let wasTruncated = false;
  let originalPageCount = 0;
  let fullMarkedOriginal: Buffer | undefined;
  let fullFormattedDocument: Buffer | undefined;

  if (accessType === "trial") {
    const [truncatedMarked, truncatedFormatted] = await Promise.all([
      truncateDocxToPageLimit(markedOriginal, LAVA_CONFIG.freeTrialMaxPages),
      truncateDocxToPageLimit(formattedDocument, LAVA_CONFIG.freeTrialMaxPages),
    ]);

    // Используем результат обрезки с оригинала (markedOriginal) для статистики
    wasTruncated = truncatedMarked.wasTruncated || truncatedFormatted.wasTruncated;
    originalPageCount = Math.max(truncatedMarked.originalPageCount, truncatedFormatted.originalPageCount);

    // Если документ был обрезан — сохраняем полные версии для hook-offer
    if (wasTruncated) {
      fullMarkedOriginal = markedOriginal;
      fullFormattedDocument = formattedDocument;
      console.log(`[formatDocument] Документы обрезаны до ${LAVA_CONFIG.freeTrialMaxPages} страниц (было ~${originalPageCount}). Полные версии сохранены для разблокировки.`);
    }

    markedOriginal = Buffer.from(truncatedMarked.buffer);
    formattedDocument = Buffer.from(truncatedFormatted.buffer);
  }

  return {
    markedOriginal,
    formattedDocument,
    fixesApplied: violations.filter((v) => v.autoFixable).length,
    wasTruncated,
    originalPageCount,
    fullMarkedOriginal,
    fullFormattedDocument,
  };
}
