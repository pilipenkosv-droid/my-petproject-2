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
import { applyTextFixesToXmlParagraph } from "../formatters/text-fixes-xml-formatter";
import { applyCaptionNumbering } from "../formatters/caption-numbering-formatter";
import { applyTocGeneration } from "../formatters/toc-generator";
import { applyAiCaptions } from "../formatters/ai-caption-generator";
import { applyDocumentCleanup } from "../formatters/document-cleanup-formatter";
import { applyListFormatting } from "../formatters/list-formatter";
import { applyLandscapeForWideTables } from "../formatters/table-landscape-formatter";
import { DocxParagraph, truncateDocxToPageLimit } from "./document-analyzer";
import { LAVA_CONFIG } from "../payment/config";
import {
  type OrderedXmlNode,
  parseDocxXml,
  buildDocxXml,
  getBody,
  getParagraphsWithPositions,
  findChildren,
  ensureRPr,
  getRuns,
  children,
  createNode,
  createTextNode,
  setOrderedProp,
} from "../xml/docx-xml";

/**
 * Извлекает текстовое содержимое из docx-буфера для сравнения
 */
async function extractTextContent(buffer: Buffer): Promise<{ text: string; charCount: number }> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return { text: "", charCount: 0 };

    const parsed = parseDocxXml(xml);
    const body = getBody(parsed);
    if (!body) return { text: "", charCount: 0 };

    const paragraphs = getParagraphsWithPositions(body);
    let text = "";
    for (const { node } of paragraphs) {
      const runs = getRuns(node);
      for (const run of runs) {
        const textNodes = children(run).filter((c) => "w:t" in c);
        for (const t of textNodes) {
          const content = children(t).find((c) => "#text" in c);
          if (content?.["#text"]) {
            text += content["#text"];
          }
        }
      }
      text += "\n";
    }
    return { text, charCount: text.replace(/\s/g, "").length };
  } catch {
    return { text: "", charCount: 0 };
  }
}

/**
 * Проверяет, что форматирование не потеряло значительную часть контента.
 * Порог: потеря >20% символов = предупреждение.
 */
async function validateContentPreserved(
  originalBuffer: Buffer,
  formattedBuffer: Buffer
): Promise<{ ok: boolean; reason?: string; originalChars: number; formattedChars: number; lossPercent: number }> {
  const [original, formatted] = await Promise.all([
    extractTextContent(originalBuffer),
    extractTextContent(formattedBuffer),
  ]);

  if (original.charCount === 0) {
    return { ok: true, originalChars: 0, formattedChars: 0, lossPercent: 0 };
  }

  const lossPercent = Math.round(((original.charCount - formatted.charCount) / original.charCount) * 100);

  if (formatted.charCount === 0 && original.charCount > 0) {
    return {
      ok: false,
      reason: "Formatted document is empty but original had content",
      originalChars: original.charCount,
      formattedChars: 0,
      lossPercent: 100,
    };
  }

  if (lossPercent > 20) {
    return {
      ok: false,
      reason: `Content loss ${lossPercent}% exceeds 20% threshold`,
      originalChars: original.charCount,
      formattedChars: formatted.charCount,
      lossPercent,
    };
  }

  return { ok: true, originalChars: original.charCount, formattedChars: formatted.charCount, lossPercent };
}

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
  /** Сколько страниц показано (лимит после обрезки) */
  pageLimitApplied?: number;
  /** Полная версия (до обрезки) оригинала с пометками - для trial */
  fullMarkedOriginal?: Buffer;
  /** Полная версия (до обрезки) исправленного документа - для trial */
  fullFormattedDocument?: Buffer;
}

export type AccessType = "trial" | "one_time" | "subscription" | "subscription_plus" | "subscription_plus_trial" | "admin" | "none";

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

  // Очищаем нестандартные визуальные элементы (тёмный фон, столбцы)
  formatter.sanitizeDocumentDefaults();

  // Применяем поля страницы
  formatter.applyPageMargins(rules);

  // Создаём map blockType по индексу параграфа
  const blockMap = new Map(
    enrichedParagraphs.map((p) => [p.index, p])
  );

  // Логируем статистику blockType для диагностики
  const typeCounts = new Map<string, number>();
  for (const p of enrichedParagraphs) {
    const t = p.blockType || "unknown";
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  const typeStats = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t}:${c}`)
    .join(", ");
  console.log(`[formatter] ${enrichedParagraphs.length} enriched paragraphs, ${formatter.paragraphCount} XML paragraphs. Types: ${typeStats}`);

  // Применяем форматирование к каждому параграфу
  for (let i = 0; i < formatter.paragraphCount; i++) {
    const enriched = blockMap.get(i);
    const blockType = enriched?.blockType || "unknown";
    formatter.applyFormattingToParagraph(i, blockType, rules);
  }

  // Применяем форматирование к таблицам (размер шрифта)
  formatter.applyTableFormatting(rules);

  // Нумерация страниц через footer (если нет существующего)
  await formatter.applyPageNumbering(rules);

  // Применяем текстовые замены (NBSP, кавычки, тире, сокращения)
  const intermediateBuffer = await formatter.saveDocument();

  // Очистка: нумерация заголовков, пустые параграфы в таблицах, overflow рисунков, лишние пустые строки
  const afterCleanup = await applyDocumentCleanup(intermediateBuffer, enrichedParagraphs, rules);

  // Списки: Word numbering (w:numPr) + удаление ручных маркеров
  const afterLists = await applyListFormatting(afterCleanup, enrichedParagraphs, rules);

  const afterTextFixes = await applyAllTextFixes(
    afterLists,
    enrichedParagraphs
  );

  // Нормализация подписей (Рис. → Рисунок) + перенумерация + обновление ссылок
  const { buffer: afterCaptions } = await applyCaptionNumbering(
    afterTextFixes,
    enrichedParagraphs
  );

  // AI-генерация подписей к таблицам без подписей (через gateway, max 10 запросов)
  const { buffer: afterAiCaptions } = await applyAiCaptions(afterCaptions, enrichedParagraphs, rules);

  // Широкие таблицы → альбомная ориентация (ГОСТ 7.32-2017 п.6.7)
  // ВАЖНО: landscape ПЕРЕД TOC, т.к. section breaks влияют на структуру страниц
  const afterLandscape = await applyLandscapeForWideTables(afterAiCaptions);

  // TOC генерация — заменяет существующий TOC на field code или вставляет после title_page
  const { buffer: afterToc } = await applyTocGeneration(afterLandscape, enrichedParagraphs, rules);

  return afterToc;
}

/**
 * Применяет текстовые замены ко всем параграфам через XML:
 * - Общие: NBSP, кавычки, тире, сокращения (все кроме title_page, toc, figure, table)
 * - Библиография: специфическая логика (формат инициалов, кавычки, тире)
 *
 * Возвращает { buffer, textFixCount } — количество параграфов, в которых были сделаны замены.
 */
async function applyAllTextFixes(
  buffer: Buffer,
  enrichedParagraphs: DocxParagraph[]
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    return buffer;
  }

  const parsed = parseDocxXml(documentXml);
  const body = getBody(parsed);
  if (!body) return buffer;

  const paragraphs = getParagraphsWithPositions(body);
  const enrichedMap = new Map(enrichedParagraphs.map((p) => [p.index, p]));

  // Типы, к которым НЕ применяем текстовые замены
  const skipTextFixes = new Set(["toc", "figure", "table", "empty"]);

  let changed = false;

  for (const { node, paragraphIndex } of paragraphs) {
    const enriched = enrichedMap.get(paragraphIndex);
    const blockType = enriched?.blockType || "unknown";

    // Пропускаем все title_page* подтипы
    if (blockType.startsWith("title_page")) continue;

    // Библиография — специфическая логика
    if (blockType === "bibliography_entry") {
      const language = enriched?.blockMetadata?.language;
      applyBibliographyFormattingToXmlParagraph(node, language);
      changed = true;
      continue;
    }

    // Остальные параграфы — общие текстовые замены
    if (!skipTextFixes.has(blockType)) {
      const wasFixed = applyTextFixesToXmlParagraph(node);
      if (wasFixed) changed = true;
    }
  }

  // Применяем текстовые замены к параграфам ВНУТРИ таблиц
  // (они не входят в getParagraphsWithPositions, которая видит только body-level)
  const bodyNodes = children(body);
  for (const node of bodyNodes) {
    if (!("w:tbl" in node)) continue;

    const rows = findChildren(node, "w:tr");
    for (const row of rows) {
      const cells = findChildren(row, "w:tc");
      for (const cell of cells) {
        const cellParas = findChildren(cell, "w:p");
        for (const p of cellParas) {
          const wasFixed = applyTextFixesToXmlParagraph(p);
          if (wasFixed) changed = true;
        }
      }
    }
  }

  if (!changed) return buffer;

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
 * @param accessType - тип доступа пользователя (для обрезки trial до 50% документа)
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

  // Проверяем, что форматирование реально изменило документ
  if (buffer.length === formattedDocument.length && buffer.equals(formattedDocument)) {
    console.warn(`[formatDocument] Отформатированный документ идентичен оригиналу! Violations: ${violations.length}, enrichedParagraphs: ${enrichedParagraphs?.length ?? 0}`);
  }

  // Проверяем потерю контента после форматирования
  const contentCheck = await validateContentPreserved(buffer, formattedDocument);
  if (!contentCheck.ok) {
    console.error(`[formatDocument] CONTENT LOSS DETECTED: ${contentCheck.reason}`, {
      originalChars: contentCheck.originalChars,
      formattedChars: contentCheck.formattedChars,
      lossPercent: contentCheck.lossPercent,
    });
  }

  // Для trial — обрезаем оба результата до % документа ПОСЛЕ форматирования
  // Но СОХРАНЯЕМ полные версии для разблокировки после оплаты
  let wasTruncated = false;
  let originalPageCount = 0;
  let pageLimitApplied = 0;
  let fullMarkedOriginal: Buffer | undefined;
  let fullFormattedDocument: Buffer | undefined;

  if (accessType === "trial") {
    const truncateOptions = {
      percentLimit: LAVA_CONFIG.freeTrialPercent,
      minPages: LAVA_CONFIG.freeTrialMinPages,
    };

    const [truncatedMarked, truncatedFormatted] = await Promise.all([
      truncateDocxToPageLimit(markedOriginal, 999, truncateOptions),
      truncateDocxToPageLimit(formattedDocument, 999, truncateOptions),
    ]);

    wasTruncated = truncatedMarked.wasTruncated || truncatedFormatted.wasTruncated;
    originalPageCount = Math.max(truncatedMarked.originalPageCount, truncatedFormatted.originalPageCount);
    pageLimitApplied = truncatedMarked.pageLimitApplied;

    if (wasTruncated) {
      fullMarkedOriginal = markedOriginal;
      fullFormattedDocument = formattedDocument;
      console.log(`[formatDocument] Документы обрезаны до ${pageLimitApplied} из ~${originalPageCount} стр. (${LAVA_CONFIG.freeTrialPercent}%). Полные версии сохранены для разблокировки.`);
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
    pageLimitApplied,
    fullMarkedOriginal,
    fullFormattedDocument,
  };
}
