/**
 * Статическое заполнение поля TOC у выхода pipeline-v7 (ADR-016, фаза 2B).
 *
 * Поле вставляется с пустым кэшем и `w:dirty`: до обновления полей в Word
 * содержание пустое. На воркере есть soffice — рендерим документ один раз в
 * PDF с UpdateFields, снимаем номера страниц и записываем строки в кэш поля.
 *
 * Шаг идёт ПОСЛЕ сохранения и гейта верности: орчестратор и фингерпринт о нём
 * не знают. На Vercel soffice нет — единственная ветка там `no-soffice`.
 *
 * `w:dirty` на поле и `w:updateFields` в settings.xml остаются нетронутыми, и
 * это осознанно: Word при открытии пересчитает поле и соберёт то же самое
 * содержание, а кэш нужен всем остальным — превью, конвертации в PDF и
 * редакторам, которые поля не обновляют.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import JSZip from "jszip";
import {
  buildTocParagraphs,
  collectHeadings,
  findTocField,
  resolvePages,
  textWidthTwips,
  type TocEntry,
} from "./toc-static-xml";

const RENDER_TIMEOUT_MS = 120_000;

export interface TocStaticResult {
  output: Buffer;
  filled: number;
  skipped?: string;
}

/** Шов для тестов: рендер подменяется, файловая система не трогается. */
export interface TocStaticDeps {
  hasTools: () => boolean;
  renderPages: (docx: Buffer) => string[];
}

let toolsCache: boolean | undefined;

/** Есть ли и soffice, и pdftotext. Результат кэшируется на процесс. */
export function hasSoffice(): boolean {
  if (toolsCache === undefined) {
    try {
      execSync("which soffice && which pdftotext", { stdio: "pipe" });
      toolsCache = true;
    } catch {
      toolsCache = false;
    }
  }
  return toolsCache;
}

/** Только для тестов: сбросить кэш проверки инструментов. */
export function resetSofficeCache(): void {
  toolsCache = undefined;
}

/** Рендер в PDF с обновлением полей и разбивка текста по страницам (`\f`). */
export function renderPages(docx: Buffer): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v7-toc-"));
  try {
    const inPath = path.join(dir, "in.docx");
    fs.writeFileSync(inPath, docx);
    execSync(
      `soffice --headless --norestore --convert-to 'pdf:writer_pdf_Export:UpdateFields=true' "${inPath}" --outdir "${dir}"`,
      { stdio: "pipe", timeout: RENDER_TIMEOUT_MS }
    );
    const pdfPath = path.join(dir, "in.pdf");
    if (!fs.existsSync(pdfPath)) return [];
    const out = execSync(`pdftotext -layout "${pdfPath}" -`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: RENDER_TIMEOUT_MS,
    });
    return out.toString().split("\f");
  } catch {
    return [];
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* временный каталог не наш приоритет */
    }
  }
}

async function fill(docx: Buffer, deps: TocStaticDeps): Promise<TocStaticResult> {
  const zip = await JSZip.loadAsync(docx);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return { output: docx, filled: 0, skipped: "no-document" };
  const xml = await docFile.async("string");

  const field = findTocField(xml);
  if (!field) return { output: docx, filled: 0, skipped: "no-toc-field" };
  const headings = collectHeadings(xml, field.end);
  if (headings.length === 0) return { output: docx, filled: 0, skipped: "no-headings" };

  const pages = deps.renderPages(docx);
  if (pages.length === 0) return { output: docx, filled: 0, skipped: "no-render" };

  const resolved = resolvePages(headings, pages);
  let filled = 0;
  const entries: TocEntry[] = headings.map((h, i) => {
    const page = resolved[i] ?? null;
    if (page !== null) filled += 1;
    return { ...h, page: page === null ? "—" : String(page) };
  });

  const replacement = buildTocParagraphs(entries, field.parts, { tabPos: textWidthTwips(xml) });
  // Замена функцией, а не строкой: шаблоны подстановки вида $& в тексте
  // заголовка иначе развернулись бы прямо в document.xml.
  zip.file("word/document.xml", xml.replace(field.parts.paragraph, () => replacement));
  const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { output, filled };
}

/**
 * Записывает номера страниц в кэш поля TOC. Ничего не нашлось, инструментов
 * нет или что-то упало — возвращается исходный буфер, обработка не падает.
 */
export async function fillTocStatic(
  docx: Buffer,
  deps: Partial<TocStaticDeps> = {}
): Promise<TocStaticResult> {
  const resolved: TocStaticDeps = {
    hasTools: deps.hasTools ?? hasSoffice,
    renderPages: deps.renderPages ?? renderPages,
  };
  try {
    if (!resolved.hasTools()) return { output: docx, filled: 0, skipped: "no-soffice" };
    return await fill(docx, resolved);
  } catch (e) {
    console.warn("[v7-toc] статическое заполнение не удалось:", e instanceof Error ? e.message : e);
    return { output: docx, filled: 0, skipped: "error" };
  }
}
