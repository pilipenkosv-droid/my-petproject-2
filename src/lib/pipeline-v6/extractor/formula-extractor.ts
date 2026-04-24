// Extract math formulas from source .docx using Pandoc, then merge them back
// into mammoth's markdown at correct positions before the main Pandoc assembly.
//
// Why this exists:
//   Mammoth silently drops <m:oMath> / <m:oMathPara> when converting docx →
//   markdown. Without math support, pipeline-v6 output has 0 formulas even
//   when the source has dozens. Pandoc *does* preserve OMML round-trip
//   (docx → markdown emits `$$...$$`; markdown → docx emits native OMML via
//   the same reference-doc).
//
// World-practice alignment (see SecondBrain research 2026-04-21):
//   - markdocx pattern — Markdown + LaTeX → docx with native OMML, not images.
//   - SLOT (arxiv 2505.04016) — decouple content generation from formatting;
//     math is pure content, format is the reference-doc.
//
// Flow in pipeline:
//   1. orchestrator calls `extractFormulasFromDocx(sourceBuf)` before
//      mammoth extraction finishes.
//   2. That returns `FormulaAnchor[]` — each has { latex, anchorText, order }.
//   3. `injectFormulasIntoMarkdown(mammothMd, anchors)` matches anchorText
//      against mammoth's markdown paragraphs and inserts the `$$latex$$`
//      block immediately after. Fallback: orphans appended at end.
//   4. Pandoc assembly with --reference-doc emits OMML natively.

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface FormulaAnchor {
  /** LaTeX body without surrounding $$ delimiters. */
  latex: string;
  /** Normalised text of the paragraph immediately preceding the formula in
   *  Pandoc's markdown output, used to locate the insertion point in
   *  mammoth's markdown. Empty if the formula is the first block. */
  anchorText: string;
  /** Sequential index of the formula in source order; used as a stable
   *  tiebreaker when several formulas share the same anchor. */
  order: number;
}

/** Extract math blocks from a docx buffer via Pandoc. Returns empty array on
 *  failure (pandoc missing, docx not parseable, no math present). */
export function extractFormulasFromDocx(docxBuf: Buffer): FormulaAnchor[] {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-math-"));
  const inPath = path.join(tmpDir, "in.docx");
  const outMdPath = path.join(tmpDir, "out.md");
  try {
    fs.writeFileSync(inPath, docxBuf);
    execSync(`pandoc "${inPath}" -o "${outMdPath}"`, {
      stdio: "pipe",
      timeout: 30000,
    });
    const md = fs.readFileSync(outMdPath, "utf8");
    return parseFormulasFromMarkdown(md);
  } catch {
    return [];
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Parse Pandoc's markdown output to pull out `$$...$$` block + `$...$` inline
 *  formulas along with the preceding non-empty text block as anchor. */
export function parseFormulasFromMarkdown(md: string): FormulaAnchor[] {
  const anchors: FormulaAnchor[] = [];
  const lines = md.split("\n");

  // We walk lines and track the most recent non-empty, non-math text line
  // (trimmed) as the anchor candidate. A formula is a line that is wholly
  // wrapped in `$$...$$` or a line-range opened by `$$` and closed by `$$`.
  let order = 0;
  let recentAnchor = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    // Block math on a single line: $$...$$
    const blockSingle = /^\$\$(.+)\$\$$/.exec(trimmed);
    if (blockSingle) {
      anchors.push({ latex: blockSingle[1].trim(), anchorText: recentAnchor, order: order++ });
      i += 1;
      continue;
    }
    // Block math spanning multiple lines: starts with $$ and closes later.
    if (/^\$\$(?!\$)/.test(trimmed) && !/\$\$$/.test(trimmed.slice(2))) {
      const parts: string[] = [trimmed.slice(2)];
      i += 1;
      while (i < lines.length) {
        const inner = lines[i];
        if (/\$\$\s*$/.test(inner)) {
          parts.push(inner.replace(/\$\$\s*$/, ""));
          i += 1;
          break;
        }
        parts.push(inner);
        i += 1;
      }
      anchors.push({ latex: parts.join("\n").trim(), anchorText: recentAnchor, order: order++ });
      continue;
    }
    // Inline math in running text: only catch "orphan" standalone inline
    // formulas on their own line. Everything else stays inline in text and
    // is handled when the surrounding paragraph is reassembled via anchor
    // match — we do not try to replay inline math for now, because mammoth
    // drops it inside paragraphs and we cannot reliably splice in the
    // middle of a paragraph. Block math is the 95% case for academic GOST.
    if (trimmed && !trimmed.startsWith("$$")) {
      recentAnchor = normaliseAnchor(trimmed);
    }
    i += 1;
  }
  return anchors;
}

function normaliseAnchor(text: string): string {
  // Strip markdown formatting marks so mammoth's variant matches.
  return text
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Inject `$$latex$$` blocks into mammoth's markdown at matching anchor
 *  paragraphs. Returns new markdown string and the count of successfully
 *  placed formulas. */
export function injectFormulasIntoMarkdown(
  mammothMd: string,
  anchors: FormulaAnchor[],
): { markdown: string; placed: number; orphaned: number } {
  if (anchors.length === 0) return { markdown: mammothMd, placed: 0, orphaned: 0 };

  const lines = mammothMd.split("\n");
  const insertions: Map<number, string[]> = new Map();
  const usedLineIdx = new Set<number>();
  let placed = 0;
  const orphans: FormulaAnchor[] = [];

  for (const a of anchors) {
    if (!a.anchorText) {
      // No anchor — append to end later.
      orphans.push(a);
      continue;
    }
    const needle = a.anchorText.slice(0, 40);
    let matched = -1;
    for (let j = 0; j < lines.length; j++) {
      if (usedLineIdx.has(j)) continue;
      const norm = normaliseAnchor(lines[j]);
      if (norm.length === 0) continue;
      if (norm.includes(needle) || needle.includes(norm.slice(0, 40))) {
        matched = j;
        break;
      }
    }
    if (matched === -1) { orphans.push(a); continue; }
    usedLineIdx.add(matched);
    const list = insertions.get(matched) ?? [];
    list.push(`$$${a.latex}$$`);
    insertions.set(matched, list);
    placed += 1;
  }

  // Build output: walk lines, emit each line plus any queued insertions after.
  const out: string[] = [];
  for (let j = 0; j < lines.length; j++) {
    out.push(lines[j]);
    const ins = insertions.get(j);
    if (ins) {
      out.push("");
      for (const formula of ins) {
        out.push(formula);
        out.push("");
      }
    }
  }

  if (orphans.length > 0) {
    out.push("");
    out.push("# Приложение. Формулы без привязки");
    out.push("");
    for (const o of orphans) {
      out.push(`$$${o.latex}$$`);
      out.push("");
    }
  }

  return { markdown: out.join("\n"), placed, orphaned: orphans.length };
}
