/**
 * Рендер docx → PDF для визуального бенча v7.
 *
 * Отличие от `bench-runners.renderPdf`: помимо числа страниц отдаётся текст
 * постранично (pdftotext -layout, разделитель `\f`) — на нём считаются все
 * метрики, и есть кэш по хэшу содержимого, чтобы исходники не пережёвывались
 * заново на каждом прогоне.
 */

import { execSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const RENDER_TIMEOUT_MS = 180_000;

export interface Rendered {
  pdfPath: string;
  /** Текст постранично; пусто, если soffice отказался от файла. */
  pages: string[];
  pageCount: number | null;
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/** Есть ли внешний бинарь на PATH. */
export function hasBinary(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function pdfPageCount(pdfPath: string): number | null {
  try {
    const m = /Pages:\s*(\d+)/.exec(execSync(`pdfinfo "${pdfPath}"`).toString());
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function pdfPages(pdfPath: string): string[] {
  try {
    const out = execSync(`pdftotext -layout "${pdfPath}" -`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: RENDER_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.toString().split("\f");
  } catch {
    return [];
  }
}

function convert(docxPath: string, outDir: string, updateFields: boolean): string {
  // --norestore: без него soffice поднимает окно восстановления на lock-файле.
  // UpdateFields=true пересчитывает поля (TOC, номера страниц) как это сделал
  // бы Word; false показывает кэш поля — то, что видит любой не обновляющий
  // поля просмотрщик.
  const filter = `pdf:writer_pdf_Export:UpdateFields=${updateFields}`;
  execSync(
    `soffice --headless --norestore --convert-to '${filter}' "${docxPath}" --outdir "${outDir}"`,
    { stdio: "pipe", timeout: RENDER_TIMEOUT_MS }
  );
  return path.join(outDir, `${path.basename(docxPath, ".docx")}.pdf`);
}

/** Рендерит буфер в `<outDir>/<name>.pdf` и снимает текст постранично. */
export function render(
  buf: Buffer,
  outDir: string,
  name: string,
  opts: { updateFields?: boolean } = {}
): Rendered {
  const workDir = path.join(outDir, ".work");
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const docxPath = path.join(workDir, `${name}.docx`);
  try {
    fs.writeFileSync(docxPath, buf);
    const pdfPath = convert(docxPath, outDir, opts.updateFields !== false);
    if (!fs.existsSync(pdfPath)) return { pdfPath: "", pages: [], pageCount: null };
    return { pdfPath, pages: pdfPages(pdfPath), pageCount: pdfPageCount(pdfPath) };
  } catch {
    return { pdfPath: "", pages: [], pageCount: null };
  } finally {
    fs.rmSync(docxPath, { force: true });
  }
}

/**
 * Рендер исходника с кэшем по хэшу байтов: исходные docx между прогонами не
 * меняются, а на 38 документах это половина времени бенча.
 */
export function renderCached(buf: Buffer, cacheDir: string): Rendered {
  fs.mkdirSync(cacheDir, { recursive: true });
  const key = sha256(buf);
  const pdfPath = path.join(cacheDir, `${key}.pdf`);
  if (fs.existsSync(pdfPath)) {
    return { pdfPath, pages: pdfPages(pdfPath), pageCount: pdfPageCount(pdfPath) };
  }
  return render(buf, cacheDir, key);
}
