// Рендер титульного листа из структурированных полей (TitlePageFields)
// в docx-блок XML, который можно вставить в начало pandoc-output.
//
// Используется `docx` npm-lib для сборки в упрощённом виде: собираем
// Document, сериализуем, достаём word/document.xml → извлекаем только
// параграфы (без <w:body>) → возвращаем как строку XML. Orchestrator
// затем инжектит это перед TOC/Heading1 в финальный output.docx.

import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import JSZip from "jszip";
import type { TitlePageFields } from "./schema";

const FONT = "Times New Roman";

function p(text: string, opts?: { bold?: boolean; center?: boolean; right?: boolean; size?: number; spaceAfter?: number; spaceBefore?: number }): Paragraph {
  const alignment = opts?.center
    ? AlignmentType.CENTER
    : opts?.right
    ? AlignmentType.RIGHT
    : AlignmentType.LEFT;
  return new Paragraph({
    alignment,
    spacing: { after: opts?.spaceAfter ?? 0, before: opts?.spaceBefore ?? 0, line: 360 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: (opts?.size ?? 14) * 2, // docx size is half-points
        bold: opts?.bold ?? false,
      }),
    ],
  });
}

function emptyP(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: 28 })] });
}

function fallback(value: string | null | undefined, placeholder: string): string {
  if (value && value.trim().length > 0) return value.trim();
  return `[${placeholder}]`;
}

function workTypeLabel(wt: TitlePageFields["workType"]): string {
  if (!wt) return "[Тип работы: диплом/курсовая/реферат]";
  const map: Record<string, string> = {
    "диплом": "ДИПЛОМНАЯ РАБОТА",
    "курсовая": "КУРСОВАЯ РАБОТА",
    "реферат": "РЕФЕРАТ",
    "отчёт": "ОТЧЁТ",
    "вкр": "ВЫПУСКНАЯ КВАЛИФИКАЦИОННАЯ РАБОТА",
    "магистерская": "МАГИСТЕРСКАЯ ДИССЕРТАЦИЯ",
    "бакалаврская": "БАКАЛАВРСКАЯ РАБОТА",
    "иное": "РАБОТА",
  };
  return map[wt] ?? "РАБОТА";
}

/**
 * Минимальный титульник для нетипичных работ (workType=иное/отчёт или когда
 * юзер в UI явно выбрал «Другое»). Не навязываем ГОСТ: без министерства,
 * факультета, кафедры, научрука. Только то, что реально всегда есть: название,
 * автор, город, год.
 */
export async function renderMinimalTitleDocx(fields: TitlePageFields): Promise<Buffer> {
  const paragraphs: Paragraph[] = [];

  if (fields.university) {
    paragraphs.push(p(fields.university, { center: true, spaceAfter: 480 }));
  } else {
    paragraphs.push(emptyP());
  }

  paragraphs.push(p(`«${fallback(fields.title, "Название работы")}»`, { center: true, bold: true, size: 16, spaceAfter: 720 }));

  if (fields.discipline) {
    paragraphs.push(p(`Дисциплина: ${fields.discipline}`, { center: true, spaceAfter: 480 }));
  } else {
    paragraphs.push(emptyP());
  }

  const authorName = fallback(fields.author?.name ?? null, "Фамилия И. О.");
  paragraphs.push(p(`Автор: ${authorName}`));
  if (fields.author?.group) paragraphs.push(p(`Группа: ${fields.author.group}`, { spaceAfter: 480 }));
  else paragraphs.push(emptyP());

  if (fields.supervisor?.name) {
    const supRole = fields.supervisor.role ?? "Руководитель";
    paragraphs.push(p(`${supRole}: ${fields.supervisor.name}`, { spaceAfter: 480 }));
  } else {
    paragraphs.push(emptyP());
  }

  paragraphs.push(p(fallback(fields.city, "Город"), { center: true }));
  paragraphs.push(p(fields.year ? String(fields.year) : "[Год]", { center: true }));

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 28 } } } },
    sections: [{ properties: {}, children: paragraphs }],
  });

  return await Packer.toBuffer(doc);
}

/** Собирает docx с титульным листом (один раздел, одна страница). */
export async function renderTitleDocx(fields: TitlePageFields): Promise<Buffer> {
  const paragraphs: Paragraph[] = [];

  // Шапка: министерство → вуз → факультет → кафедра (центр, bold)
  paragraphs.push(p("МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ", { center: true }));
  paragraphs.push(p("РОССИЙСКОЙ ФЕДЕРАЦИИ", { center: true, spaceAfter: 240 }));
  paragraphs.push(p(fallback(fields.university, "Название ВУЗа"), { center: true, bold: true, spaceAfter: 120 }));
  if (fields.faculty) paragraphs.push(p(fields.faculty, { center: true, spaceAfter: 120 }));
  else paragraphs.push(p("[Факультет]", { center: true, spaceAfter: 120 }));
  if (fields.department) paragraphs.push(p(`Кафедра ${fields.department}`, { center: true, spaceAfter: 720 }));
  else paragraphs.push(p("[Кафедра]", { center: true, spaceAfter: 720 }));

  // Тип работы + название (центр, крупный шрифт)
  paragraphs.push(p(workTypeLabel(fields.workType), { center: true, bold: true, size: 16, spaceAfter: 240 }));
  if (fields.discipline) {
    paragraphs.push(p(`по дисциплине: ${fields.discipline}`, { center: true, spaceAfter: 120 }));
  }
  paragraphs.push(p("на тему:", { center: true, spaceAfter: 120 }));
  paragraphs.push(p(`«${fallback(fields.title, "Название работы")}»`, { center: true, bold: true, spaceAfter: 720 }));

  // Специальность (если есть)
  if (fields.speciality) {
    paragraphs.push(p(`Специальность: ${fields.speciality}`, { center: true, spaceAfter: 480 }));
  } else {
    paragraphs.push(emptyP());
  }

  // Автор + Руководитель — в классическом оформлении по центру.
  const authorName = fallback(fields.author?.name ?? null, "Фамилия И. О.");
  paragraphs.push(p(`Выполнил(а): ${authorName}`, { center: true }));
  if (fields.author?.group) paragraphs.push(p(`Группа: ${fields.author.group}`, { center: true }));
  else paragraphs.push(p("Группа: [номер группы]", { center: true }));
  if (fields.author?.course) paragraphs.push(p(`Курс: ${fields.author.course}`, { center: true, spaceAfter: 240 }));
  else paragraphs.push(emptyP());

  // Научный руководитель
  const supName = fallback(fields.supervisor?.name ?? null, "Фамилия И. О.");
  const supRole = fields.supervisor?.role ?? "научный руководитель";
  paragraphs.push(p(`${supRole}: ${supName}`, { center: true }));
  if (fields.supervisor?.degree) paragraphs.push(p(fields.supervisor.degree, { center: true, spaceAfter: 240 }));
  else paragraphs.push(p("[учёная степень, звание]", { center: true, spaceAfter: 240 }));

  // Рецензент (опционально)
  if (fields.reviewer?.name || fields.reviewer?.role) {
    const revName = fallback(fields.reviewer?.name ?? null, "Фамилия И. О.");
    const revRole = fields.reviewer?.role ?? "рецензент";
    paragraphs.push(p(`${revRole}: ${revName}`, { center: true, spaceAfter: 480 }));
  } else {
    paragraphs.push(emptyP());
    paragraphs.push(emptyP());
  }

  // Город + год размечаются как обычные параграфы здесь; после рендера в
  // extractBodyContent мы патчим их pPr, добавляя <w:framePr> с
  // vAnchor="page" yAlign="bottom" — это прижимает пару «Город / Год» к
  // нижнему краю страницы, независимо от того, сколько вертикального
  // пространства заняли блоки выше. Маркер CITY/YEAR ставится через
  // специальный подстрочный префикс `___CITY_YEAR___` который
  // extractBodyContent затем обрабатывает.
  paragraphs.push(p("___CITY_YEAR___" + fallback(fields.city, "Город"), { center: true }));
  paragraphs.push(p("___CITY_YEAR___" + (fields.year ? String(fields.year) : "[Год]"), { center: true }));

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 28 } } } },
    sections: [{ properties: {}, children: paragraphs }],
  });

  return await Packer.toBuffer(doc);
}

/** Извлекает тело (содержимое <w:body>) из docx-буфера без sectPr.
 *  Также патчит параграфы, помеченные префиксом `___CITY_YEAR___`, добавляя
 *  <w:framePr vAnchor="page" yAlign="bottom" xAlign="center"/> — это
 *  прижимает блок «Город / Год» к нижнему краю страницы в Word и
 *  LibreOffice независимо от объёма текста выше. */
async function extractBodyContent(docxBuf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docxBuf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const bodyMatch = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(xml);
  if (!bodyMatch) return "";
  let body = bodyMatch[1];
  // Убираем sectPr (он есть в output pandoc — не нужно дублировать).
  body = body.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, "");
  // Обрабатываем маркер ___CITY_YEAR___: добавляем framePr в pPr
  // *того самого* параграфа, где стоит маркер. Ключевое: `pre`/`rest` должны
  // содержать только содержимое одного <w:p>, без перехода через </w:p> —
  // иначе regex захватит лишние параграфы и «утянет» МИНИСТЕРСТВО вниз
  // вместе с городом/годом. Используем negative-lookahead:
  //   (?:(?!<\/w:p>)[\s\S])*?
  body = body.replace(
    /<w:p\b[^>]*>((?:(?!<\/w:p>)[\s\S])*?)___CITY_YEAR___((?:(?!<\/w:p>)[\s\S])*?)<\/w:p>/g,
    (_m, pre: string, rest: string) => {
      // yAlign="bottom" + vAnchor=page позиционирует блок внизу страницы
      // ДИНАМИЧЕСКИ — LibreOffice/Word сам разместит под нижним margin.
      // Абсолютное w:y давало коллизии с обычным контентом, идущим сверху.
      const frame = `<w:framePr w:wrap="around" w:vAnchor="page" w:hAnchor="margin" w:yAlign="bottom" w:xAlign="center"/>`;
      let headed: string;
      if (/<w:pPr>/.test(pre)) {
        headed = pre.replace(/<w:pPr>/, `<w:pPr>${frame}`);
      } else {
        headed = `<w:pPr>${frame}</w:pPr>` + pre;
      }
      return `<w:p>${headed}${rest}</w:p>`;
    },
  );
  return body;
}

/** Намеспейсы, которые должны быть объявлены в output document.xml. */
const REQUIRED_NAMESPACES: Record<string, string> = {
  w14: "http://schemas.microsoft.com/office/word/2010/wordml",
  w15: "http://schemas.microsoft.com/office/word/2012/wordml",
  w16: "http://schemas.microsoft.com/office/word/2018/wordml",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
};

function ensureNamespaces(docXml: string): string {
  return docXml.replace(/<w:document\b([^>]*)>/, (match, attrs: string) => {
    let out = attrs;
    for (const [prefix, uri] of Object.entries(REQUIRED_NAMESPACES)) {
      if (!new RegExp(`xmlns:${prefix}=`).test(out)) {
        out += ` xmlns:${prefix}="${uri}"`;
      }
    }
    return `<w:document${out}>`;
  });
}

/**
 * Prepend title-docx в начало output pandoc-документа.
 * После титульных параграфов добавляет page-break, чтобы дальше (TOC/Heading1)
 * начиналось с новой страницы.
 */
export async function prependTitleToOutput(
  outputBuffer: Buffer,
  fields: TitlePageFields,
  opts?: { variant?: "gost" | "minimal" },
): Promise<Buffer> {
  const variant = opts?.variant ?? "gost";
  const titleDocx = variant === "minimal"
    ? await renderMinimalTitleDocx(fields)
    : await renderTitleDocx(fields);
  const titleBody = await extractBodyContent(titleDocx);
  const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  const injection = titleBody + pageBreak;

  const zip = await JSZip.loadAsync(outputBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return outputBuffer;
  const xml = await docFile.async("string");
  const withNs = ensureNamespaces(xml);
  const patched = withNs.replace(/<w:body\b([^>]*)>/, `<w:body$1>${injection}`);
  zip.file("word/document.xml", patched);
  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
