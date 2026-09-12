// Пост-билд правки OOXML через JSZip: то, что `docx`-lib не умеет нативно
// (endnotes.xml, кэшированные записи TOC-поля) — плюс детерминизация вывода
// (docx-lib пишет `new Date()` в docProps/core.xml, JSZip — дату записи на
// каждый файл архива; оба фиксируем, чтобы два прогона давали identical bytes).
import JSZip from "jszip";

const FIXED_DATE = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
const FIXED_TIMESTAMP = "2024-01-01T00:00:00Z";

export async function loadZip(buf: Buffer): Promise<JSZip> {
  return JSZip.loadAsync(buf);
}

export async function readText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`zip part not found: ${path}`);
  return file.async("string");
}

/**
 * Находит w:r, содержащий уникальный текстовый маркер (например `⟦EN:1⟧`),
 * и целиком заменяет этот run на replacementXml. Работает на сырой строке,
 * без полного XML-парсинга — безопасно, т.к. маркер уникален и не пересекает
 * границы run (мы сами его туда положили одним TextRun).
 */
export function replaceRunContainingMarker(xml: string, marker: string, replacementXml: string): string {
  const markerIdx = xml.indexOf(marker);
  if (markerIdx === -1) throw new Error(`marker not found in xml: ${marker}`);
  const runStart = xml.lastIndexOf("<w:r>", markerIdx);
  const runEndTagIdx = xml.indexOf("</w:r>", markerIdx);
  if (runStart === -1 || runEndTagIdx === -1) {
    throw new Error(`could not bound <w:r> for marker: ${marker}`);
  }
  const runEnd = runEndTagIdx + "</w:r>".length;
  return xml.slice(0, runStart) + replacementXml + xml.slice(runEnd);
}

const ENDNOTES_XMLNS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export interface EndnoteSpec {
  id: number;
  /** Уникальный текстовый маркер, вставленный в TextRun на месте ссылки. */
  marker: string;
  text: string;
}

/**
 * Добавляет полноценные endnotes: word/endnotes.xml + relationship +
 * content-type override + замену run-маркеров на <w:endnoteReference/>.
 * `docx` (v9) не поддерживает endnotes нативно (нет EndNotes-парта в Packer).
 */
export async function injectEndnotes(buf: Buffer, endnotes: readonly EndnoteSpec[]): Promise<Buffer> {
  const zip = await loadZip(buf);

  let documentXml = await readText(zip, "word/document.xml");
  for (const note of endnotes) {
    documentXml = replaceRunContainingMarker(
      documentXml,
      note.marker,
      `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:endnoteReference w:id="${note.id}"/></w:r>`,
    );
  }
  zip.file("word/document.xml", documentXml);

  const noteBodies = endnotes
    .map(
      (n) =>
        `<w:endnote w:id="${n.id}"><w:p><w:pPr><w:pStyle w:val="EndnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="EndnoteReference"/></w:rPr><w:endnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${escapeXml(n.text)}</w:t></w:r></w:p></w:endnote>`,
    )
    .join("");
  const endnotesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:endnotes ${ENDNOTES_XMLNS}>` +
    `<w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote>` +
    `<w:endnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote>` +
    noteBodies +
    `</w:endnotes>`;
  zip.file("word/endnotes.xml", endnotesXml);

  const relsPath = "word/_rels/document.xml.rels";
  let relsXml = await readText(zip, relsPath);
  const nextRid = (relsXml.match(/Id="rId(\d+)"/g) ?? [])
    .map((m) => parseInt(m.replace(/\D/g, ""), 10))
    .reduce((a, b) => Math.max(a, b), 0) + 1;
  relsXml = relsXml.replace(
    "</Relationships>",
    `<Relationship Id="rId${nextRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/></Relationships>`,
  );
  zip.file(relsPath, relsXml);

  const ctPath = "[Content_Types].xml";
  let ctXml = await readText(zip, ctPath);
  ctXml = ctXml.replace(
    "</Types>",
    `<Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml" PartName="/word/endnotes.xml"/></Types>`,
  );
  zip.file(ctPath, ctXml);

  return saveZipDeterministic(zip);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface TocCachedEntry {
  style: "TOC1" | "TOC2";
  text: string;
  page: number;
}

/**
 * Вставляет «кэшированные» параграфы результата TOC-поля между fldChar
 * separate и fldChar end — так TOC выглядит как сохранённый Word'ом, а не
 * пустое поле, которое требует ручного обновления.
 */
export async function injectTocCachedEntries(buf: Buffer, entries: readonly TocCachedEntry[]): Promise<Buffer> {
  const zip = await loadZip(buf);
  let xml = await readText(zip, "word/document.xml");

  const separateIdx = xml.indexOf('<w:fldChar w:fldCharType="separate"');
  if (separateIdx === -1) throw new Error("TOC separate fldChar not found");
  const paraEndAfterSeparate = xml.indexOf("</w:p>", separateIdx);
  if (paraEndAfterSeparate === -1) throw new Error("could not find end of TOC separate paragraph");
  const insertAt = paraEndAfterSeparate + "</w:p>".length;

  const cachedParas = entries
    .map(
      (e) =>
        `<w:p><w:pPr><w:pStyle w:val="${e.style}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9060"/></w:tabs></w:pPr>` +
        `<w:r><w:t xml:space="preserve">${escapeXml(e.text)}</w:t></w:r>` +
        `<w:r><w:tab/><w:t>${e.page}</w:t></w:r></w:p>`,
    )
    .join("");

  xml = xml.slice(0, insertAt) + cachedParas + xml.slice(insertAt);
  zip.file("word/document.xml", xml);
  return saveZipDeterministic(zip);
}

/** Фиксирует docProps/core.xml (created/modified) на постоянную дату. */
async function normalizeCoreProps(zip: JSZip): Promise<void> {
  const path = "docProps/core.xml";
  const file = zip.file(path);
  if (!file) return;
  let xml = await file.async("string");
  xml = xml
    .replace(/<dcterms:created[^>]*>[^<]*<\/dcterms:created>/, `<dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_TIMESTAMP}</dcterms:created>`)
    .replace(/<dcterms:modified[^>]*>[^<]*<\/dcterms:modified>/, `<dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_TIMESTAMP}</dcterms:modified>`);
  zip.file(path, xml);
}

/**
 * Пересобирает zip с фиксированной датой на каждой записи и стабильными
 * настройками компрессии, чтобы два независимых прогона давали
 * побайтово идентичный .docx.
 */
export async function saveZipDeterministic(zip: JSZip): Promise<Buffer> {
  await normalizeCoreProps(zip);

  const clean = new JSZip();
  const paths = Object.keys(zip.files).sort();
  for (const path of paths) {
    const entry = zip.files[path];
    if (entry.dir) {
      // Не используем clean.folder(path): оно всегда ставит new Date() на
      // запись директории, что ломает детерминизм между прогонами.
      clean.file(path, "", { dir: true, date: FIXED_DATE });
      continue;
    }
    const content = await entry.async("uint8array");
    clean.file(path, content, { date: FIXED_DATE, binary: true, createFolders: false });
  }
  const buf = await clean.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "DOS",
  });
  return buf;
}

/** Нормализует «сырой» буфер Packer.toBuffer() к детерминированному виду
 * (без XML-правок) — используется всеми докбилдерами, не только теми, что
 * делают инъекцию. */
export async function finalize(buf: Buffer): Promise<Buffer> {
  const zip = await loadZip(buf);
  return saveZipDeterministic(zip);
}

export async function countInParts(buf: Buffer, parts: readonly string[], pattern: RegExp): Promise<number> {
  const zip = await loadZip(buf);
  let total = 0;
  for (const path of parts) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async("string");
    const matches = xml.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"));
    total += matches?.length ?? 0;
  }
  return total;
}

export async function listParts(buf: Buffer, prefix: string): Promise<string[]> {
  const zip = await loadZip(buf);
  return Object.keys(zip.files).filter((p) => p.startsWith(prefix) && !zip.files[p].dir);
}
