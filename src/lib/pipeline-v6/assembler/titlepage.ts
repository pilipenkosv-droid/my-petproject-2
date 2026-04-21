// Title-page preservation. Mammoth → pandoc pipeline выбрасывает разметку
// титульного листа (центрирование, таблицы подписей). Извлекаем исходный
// кусок document.xml от <w:body> до первого «настоящего» раздела (Heading1
// или Введение) и вставляем его в начало output-docx, перед TOC.
//
// Простой, но рабочий подход: копируем XML как есть, вместе со ссылками на
// стили, картинки и rels исходника — потом сливаем rels/media в output.
//
// Эвристика границы титула:
//   1. Первый <w:p> с <w:pStyle w:val="Heading1|Heading2|Title|SectionTitle"/>.
//   2. Если ни один заголовок не нашли — первый абзац, текст которого
//      начинается с «Введение», «Оглавление», «Содержание», «Глава 1» или
//      match'ит нумерацию «1.», «1.1».
//   3. Если и этого нет — первые 12 параграфов (страховка).

import JSZip from "jszip";

const HEADING_STYLES = new Set([
  "Heading1",
  "Heading2",
  "Heading3",
  "Title",
  "Subtitle",
  "1",
  "2",
]);

const SECTION_TEXT = /^(Введение|ВВЕДЕНИЕ|Оглавление|ОГЛАВЛЕНИЕ|Содержание|СОДЕРЖАНИЕ|Глава\s+\d|ГЛАВА\s+\d|\d+(\.\d+)*\s+[А-Яа-я])/;

function extractParagraphText(pXml: string): string {
  const texts = [...pXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  return texts.join("").trim();
}

function getStyleId(pXml: string): string | null {
  const m = /<w:pStyle\s+w:val="([^"]+)"/.exec(pXml);
  return m ? m[1] : null;
}

/** Splits body XML into array of top-level <w:p>…</w:p> and <w:tbl>…</w:tbl> blocks. */
function splitBodyBlocks(bodyXml: string): string[] {
  const blocks: string[] = [];
  const re = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyXml))) {
    blocks.push(m[0]);
  }
  return blocks;
}

/** Returns true once we've reached the end of the title page. */
function isSectionStart(block: string): boolean {
  if (!block.startsWith("<w:p")) return false;
  const style = getStyleId(block);
  if (style && HEADING_STYLES.has(style)) return true;
  const text = extractParagraphText(block);
  if (!text) return false;
  if (SECTION_TEXT.test(text)) return true;
  return false;
}

export async function extractTitlePageXml(sourceBuffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(sourceBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return null;
  const xml = await docFile.async("string");
  const bodyMatch = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(xml);
  if (!bodyMatch) return null;
  const body = bodyMatch[1];
  const blocks = splitBodyBlocks(body);
  if (blocks.length === 0) return null;

  const titleBlocks: string[] = [];
  let boundaryFound = false;
  for (const block of blocks) {
    if (isSectionStart(block)) {
      boundaryFound = true;
      break;
    }
    titleBlocks.push(block);
    if (titleBlocks.length >= 30) break;
  }
  if (!boundaryFound && titleBlocks.length > 12) {
    titleBlocks.length = 12;
  }
  if (titleBlocks.length === 0) return null;

  // Удаляем атрибуты с namespace prefixes, которые pandoc-output не
  // декларирует (w14:paraId, w14:textId, w15:*, mc:*). Word отказывается
  // открывать docx с undefined namespaces.
  const cleaned = titleBlocks
    .map((b) => b.replace(/\s+(w14|w15|w16|mc|w16cid|w16cex|w16se):[a-zA-Z]+="[^"]*"/g, ""))
    .map((b) => b.replace(/<mc:AlternateContent>[\s\S]*?<\/mc:AlternateContent>/g, ""));

  // Page break, чтобы Heading1 / TOC начинались с новой страницы.
  const pageBreakP = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  return cleaned.join("") + pageBreakP;
}

const REQUIRED_NAMESPACES: Record<string, string> = {
  w14: "http://schemas.microsoft.com/office/word/2010/wordml",
  w15: "http://schemas.microsoft.com/office/word/2012/wordml",
  w16: "http://schemas.microsoft.com/office/word/2018/wordml",
  w16cid: "http://schemas.microsoft.com/office/word/2016/wordml/cid",
  w16cex: "http://schemas.microsoft.com/office/word/2018/wordml/cex",
  w16se: "http://schemas.microsoft.com/office/word/2015/wordml/symex",
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

/** Prepends `titleXml` into output-docx body, before the first element. */
export async function prependTitleToDocx(outputBuffer: Buffer, titleXml: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(outputBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return outputBuffer;
  const xml = await docFile.async("string");
  const withNs = ensureNamespaces(xml);
  const patched = withNs.replace(/<w:body\b([^>]*)>/, `<w:body$1>${titleXml}`);
  zip.file("word/document.xml", patched);
  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
