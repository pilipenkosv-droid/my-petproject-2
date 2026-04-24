// Pipeline-v6 orchestrator — chains all stages end-to-end.
//
//   input.docx
//     ↓ extract (mammoth)
//     ↓ analyze (structure route)
//     ↓ rewrite (body-only LLM, slot-based) — optional (dry-run by default)
//     ↓ assemble (Pandoc primary, docxtpl fallback per-table)
//     ↓ check (GOST checker)
//     ↓ fix (auto-fix + suggest)
//   output.docx + report
//
// This is the thin coordinator; each stage is independently testable.

import { extractDocument, extractTablesWithAnchors, type ExtractedDocument, type TableAnchor } from "./extractor/mammoth-extractor";
import { analyzeStructure, type StructureReport } from "./analyzer/structure-analyzer";
import { rewriteBody } from "./rewriter/body-rewriter";
import { assembleWithPandoc } from "./assembler/pandoc";
import { fixupToc } from "./assembler/toc-fixup";
import { fillTocPageNumbers } from "./assembler/toc-pagenum";
import { applyKeepTogetherRules } from "./assembler/keep-together";
import { injectPageNumbers } from "./assembler/page-numbers";
import { expectedSectionsFor, type WorkType } from "./sections/expected-sections";
import { detectSections } from "./sections/section-detector";
import { insertMissingSectionPlaceholders } from "./sections/placeholder-inserter";
import { extractTitlePageXml, prependTitleToDocx } from "./assembler/titlepage";
import { extractTitlePageFields } from "./titlepage/llm-extractor";
import { prependTitleToOutput } from "./titlepage/template-renderer";
import { stripTitleFromMarkdown } from "./titlepage/strip-markdown";
import { decideTitleTier } from "./titlepage/tier";
import { detectTableComplexity } from "./assembler/docxtpl";
import { runQualityChecks, type QualityReport } from "./checker";
import { planFixes, applyAutoFixesToXml, summariseSuggestions, type FixPlan, type FixSuggestion } from "./fix-suggest/fix-loop";
import { resolveRulePack, DEFAULT_RULE_PACK_SLUG, type RulePack } from "./rule-packs";
import JSZip from "jszip";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface OrchestratorOptions {
  documentId: string;
  /** Path to pandoc reference-doc. If omitted, falls back to `rulePack.referenceDocPath`. */
  referenceDoc?: string;
  /** Rule pack slug (e.g. 'gost-7.32'). Resolved via rule-packs registry.
   *  Default = `DEFAULT_RULE_PACK_SLUG`. Ignored if `rulePack` is passed. */
  templateSlug?: string;
  /** Explicit rule pack (bypasses registry — used for upload-based custom templates). */
  rulePack?: RulePack;
  /** Apply LLM body rewrite. Default false (structure-only assembly). */
  rewrite?: boolean;
  /** Document metadata for Pandoc YAML header. */
  metadata?: Record<string, string | number | boolean>;
  /** Stop after this many fix iterations. Default 1. */
  fixIterations?: number;
  /** Подсказка типа работы из UI (напр. "иное" если юзер выбрал «Другое»).
   *  Форсит minimal-tier титульника независимо от того, что извлёк LLM. */
  userWorkTypeHint?: string | null;
  /** Отключить LLM-извлечение титульника. Fallback на старый extractTitlePageXml. */
  disableLlmTitle?: boolean;
}

export interface PipelineResult {
  output: Buffer;
  extracted: ExtractedDocument;
  structure: StructureReport;
  rewrittenSlots: number;
  tableAssemblyPlan: { pandoc: number; docxtpl: number };
  initialReport: QualityReport;
  finalReport: QualityReport;
  fixPlan: FixPlan;
  suggestions: FixSuggestion[];
  timings: {
    extractMs: number;
    analyzeMs: number;
    rewriteMs: number;
    assembleMs: number;
    checkMs: number;
    fixMs: number;
    totalMs: number;
  };
}

function rulesFromPack(pack: RulePack) {
  return {
    margins: pack.values.margins,
    fontFamily: pack.values.fontFamily,
    fontSize: pack.values.fontSize,
    lineSpacing: pack.values.lineSpacing,
    paragraphIndent: pack.values.paragraphIndent,
    tocTitle: pack.values.tocTitle,
  };
}

function escapePipeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim() || " ";
}

function tableToPipeMarkdown(rows: string[][], columnCount: number): string {
  if (rows.length === 0 || columnCount === 0) return "";
  const pad = (r: string[]) => {
    const copy = [...r];
    while (copy.length < columnCount) copy.push("");
    return copy.slice(0, columnCount).map(escapePipeCell);
  };
  const header = pad(rows[0]);
  const sep = Array(columnCount).fill("---");
  const body = rows.slice(1).map(pad);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n");
}

/** Return a copy of the input docx with all <w:tbl>...</w:tbl> blocks
 *  removed from word/document.xml. Used as mammoth input so mammoth does
 *  not emit table cell text as plain paragraphs (which would visually
 *  duplicate the pipe-tables we later re-inject via anchor). */
async function stripTablesForMammoth(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return buffer;
  const xml = await docFile.async("string");
  const stripped = xml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, "");
  if (stripped === xml) return buffer;
  zip.file("word/document.xml", stripped);
  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function applyAutoFixesToBuffer(buffer: Buffer, report: QualityReport): Promise<{ buffer: Buffer; applied: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return { buffer, applied: [] };
  const xml = await docFile.async("string");
  const failed = report.checks.filter((c) => !c.passed);
  const { xml: fixedXml, applied } = applyAutoFixesToXml(xml, failed);
  if (applied.length === 0) return { buffer, applied: [] };
  zip.file("word/document.xml", fixedXml);
  const newBuf = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer: newBuf, applied };
}

export async function runPipelineV6(
  input: Buffer,
  opts: OrchestratorOptions,
): Promise<PipelineResult> {
  const timings = {
    extractMs: 0,
    analyzeMs: 0,
    rewriteMs: 0,
    assembleMs: 0,
    checkMs: 0,
    fixMs: 0,
    totalMs: 0,
  };
  const t0 = Date.now();

  const rulePack = opts.rulePack ?? resolveRulePack(opts.templateSlug ?? DEFAULT_RULE_PACK_SLUG);
  const rules = rulesFromPack(rulePack);
  const referenceDoc = opts.referenceDoc
    ?? (rulePack.referenceDocPath ? path.join(process.cwd(), rulePack.referenceDocPath) : undefined);
  if (!referenceDoc) {
    throw new Error(`No referenceDoc provided and rulePack '${rulePack.slug}' has no referenceDocPath`);
  }

  // 1. Extract — write images to a tmp dir so pandoc can embed them by reference.
  const imageDir = fs.mkdtempSync(path.join(os.tmpdir(), "v6-images-"));
  const t1 = Date.now();

  // 1a. Build a mammoth-input buffer with <w:tbl> blocks stripped. Reason:
  //   mammoth.convertToMarkdown silently flattens table cell contents as
  //   plain paragraphs when it can't render them as markdown tables. Those
  //   paragraphs then leak into the final PDF as a flat dump RIGHT BELOW
  //   the pipe-table we re-inject by anchor. Result: every table is
  //   visually duplicated. Stripping <w:tbl> from mammoth's input kills
  //   the dump at source. The original input buffer is still used for
  //   extractTablesWithAnchors() which reads from a fresh JSZip load.
  const mammothInput = await stripTablesForMammoth(input);

  const extracted = await extractDocument(mammothInput, { imageDir });
  timings.extractMs = Date.now() - t1;

  // 2. Analyze structure
  const t2 = Date.now();
  const structure = analyzeStructure(extracted);
  timings.analyzeMs = Date.now() - t2;

  // 2b. Heading normalization — mammoth maps Russian diploma headings to h3/h4
  // whenever the source docx skipped h1/h2 styles (very common — authors apply
  // direct formatting instead of Heading 1). Without h1/h2, pandoc `--toc`
  // emits no TOC. Promote the deepest non-empty heading level to h1.
  let markdown = extracted.markdown;

  // 2a. Strip source-embedded TOC — авторы часто вставляют ручной «Оглавление»
  // со строками «Введение.........5». После такого массива идут заголовки, по
  // которым pandoc --toc строит правильный TOC. Оставить оба = дублирование,
  // как на скриншоте юзера. Убираем: заголовок-синоним + следующие строки, пока
  // они похожи на пункты ручного TOC (dot-leader + число, или номер главы).
  {
    const lines = markdown.split("\n");
    const out: string[] = [];
    let i = 0;
    const TOC_HEADING = /^(#{1,3}\s*)?\s*(Оглавление|Содержание|СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ)\s*$/;
    // Dot-leader: 3+ точек ПОДРЯД ИЛИ с escape-бэкслэшем между ("\\.\\.\\." в
    // markdown = 4 дота с backslash'ами, mammoth эскейпит). Матчим `(?:\\?\.){3,}`.
    const TOC_ENTRY = /((?:\\?\.){3,}|…{1,}|\s{3,})\s*\d+\s*$/;
    const TOC_NUMERIC_PREFIX = /^\s*(Глава\s+\d|\d+(\.\d+)*\s|Введение|Заключение|Приложение\s+[А-Я])/i;
    // Mammoth конвертирует Word TOC-поля в markdown-ссылки вида:
    //   [1\.ТЕХНОЛОГИЧЕСКАЯ ЧАСТЬ\.\.\.4](\\l "_Toc...")
    //   [1\.5 Расчет...\.\.\.1](\\l )8                  — digit после `)`
    //   [1\.3 ...\.\.\.\.](\\l )\.\.10                  — dots+digit после `)`
    //   [2\.2 ...35](\\l )                              — page внутри текста
    // Формат варьируется — ловим по префиксу + `](\\l`.
    const TOC_MAMMOTH_LINK = /^\[.*\]\(\\\\l[^)]*\).*$/;
    while (i < lines.length) {
      const line = lines[i];
      if (TOC_HEADING.test(line.trim())) {
        i += 1; // пропускаем заголовок TOC
        while (i < lines.length) {
          const l = lines[i].trim();
          if (l === "") { i += 1; continue; }
          const looksLikeEntry = TOC_ENTRY.test(l) || TOC_MAMMOTH_LINK.test(l) || (TOC_NUMERIC_PREFIX.test(l) && l.length < 200);
          const isPageNumberOnly = /^\d{1,4}$/.test(l);
          if (looksLikeEntry || isPageNumberOnly) { i += 1; continue; }
          break;
        }
        continue;
      }
      out.push(line);
      i += 1;
    }
    markdown = out.join("\n");
  }

  // 2a2. Numbered-list-as-heading promotion.
  //
  // Авторы часто оформляют заголовки через многоуровневый нумерованный список
  // (чтобы получить автоматическую "1.1, 1.2" нумерацию), вместо Heading 1/2.
  // Mammoth сохраняет как:
  //   `1. <a id="..."></a>__ТЕХНОЛОГИЧЕСКАЯ ЧАСТЬ__`    — level 0 → # H1
  //   `\t1. <a id="..."></a>__Назначение детали__`       — level 1 → ## H2
  //   `\t\t1. ...__text__`                               — level 2 → ###
  //
  // Признаки: нумерованный пункт + bold-обёртка + одна строка + контент
  // нетривиальный (>2 символов). Anchor-теги `<a>` убираем.
  {
    const lines = markdown.split("\n");
    const LIST_HEADING = /^(\t*)(\d+\.)(?:\d+)?\s+((?:<a\s[^>]*><\/a>\s*)*)(__|\*\*)([^_*][^_*]*?)\4\s*$/;
    let promotedCount = 0;
    for (let idx = 0; idx < lines.length; idx++) {
      const m = LIST_HEADING.exec(lines[idx]);
      if (!m) continue;
      const indent = m[1].length;
      const content = m[5].trim();
      if (content.length < 3) continue;
      const level = Math.min(4, indent + 1);
      lines[idx] = "#".repeat(level) + " " + content;
      promotedCount++;
    }
    if (promotedCount > 0) {
      markdown = lines.join("\n");
    }
  }

  const { h1Count, h2Count, h3Count } = extracted.statistics;
  if (h1Count === 0 && h2Count === 0 && h3Count > 0) {
    markdown = markdown
      .replace(/^#### /gm, "## ")
      .replace(/^### /gm, "# ");
  } else if (h1Count === 0 && h2Count > 0) {
    markdown = markdown
      .replace(/^### /gm, "## ")
      .replace(/^## /gm, "# ");
  }

  // 2a3a. Always-on heuristic — promote CLEAR section markers to H1 even when
  // some headings exist. Catches cases where the author styled only a few
  // headings but left others (Заключение, Список…) as plain text. Idempotent:
  // lines already starting with `#` are skipped.
  //
  // Handles mammoth's bold/italic markers wrapping the title text:
  //   `__Заключение__`, `**Заключение**`, `__Заключение` (orphan open), etc.
  // by stripping surrounding `_`/`*` pairs before matching. Greedy strip
  // (`+`) — mammoth sometimes emits 4+ underscores around orphan runs.
  {
    const lines = markdown.split("\n");
    const SECTION_TITLE_STRICT = /^(Введение|Заключение|Выводы|Содержание|Оглавление|Реферат|Аннотация|Список\s+(?:использованных\s+)?(?:источников|литературы)|Библиографический\s+список|ВВЕДЕНИЕ|ЗАКЛЮЧЕНИЕ|ВЫВОДЫ|СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ|РЕФЕРАТ|АННОТАЦИЯ|СПИСОК(?:\s+[А-ЯЁ]+)+)[\s:.]*$/;
    const stripDecorators = (s: string) => s
      // Mammoth's TOC-anchor tags — <a id="_Toc...">…</a>, sometimes
      // multiple consecutive — never carry visible text, so discard.
      .replace(/<a\s+id="[^"]*">\s*<\/a>/gi, "")
      .replace(/^[\*_]+/, "")
      .replace(/[\*_]+$/, "")
      .replace(/\\([.,:;!?])/g, "$1")
      .trim();
    let promoted = 0;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw || raw.startsWith("#")) continue;
      const clean = stripDecorators(raw);
      if (SECTION_TITLE_STRICT.test(clean)) {
        lines[i] = "# " + clean;
        promoted++;
      }
    }
    if (promoted > 0) markdown = lines.join("\n");
  }

  // 2a3. Heuristic heading promotion for documents whose author did not use
  // Word's Heading styles at all (mammoth emits them as plain bold or CAPS
  // paragraphs). Without this pass the whole document flows as a single
  // run-on section, TOC gets no entries, and our missing-section detector
  // over-reports. Heuristic patterns (applied in order):
  //   a) Line is ALL-CAPS Cyrillic, < 100 chars, no period → H1
  //   b) Line matches "Глава N" / "ГЛАВА N" / "Раздел N" → H1
  //   c) Line matches "^\d+(\.\d+)*\s+..." (numbered section like "2.1 …")
  //      → H1 if single level, H2 if two levels
  //   d) Single-line bold paragraph (wholly wrapped in __...__ or **...**)
  //      of 5–80 chars and no trailing period → H2
  // Only applies when the markdown has no existing `# ` headings yet
  // (i.e. mammoth + earlier promotion passes produced none).
  // Runs unconditionally (even when some H1 exist from 2a3a pass) so that
  // unstyled chapter/subsection markers (ALL CAPS, "1.1 ...", "Глава 2")
  // get promoted alongside SECTION_TITLE_STRICT headings. Idempotent:
  // existing `#` lines are skipped in the loop below.
  {
    {
      const lines = markdown.split("\n");
      let promoted = 0;
      const ALL_CAPS = /^([А-ЯЁA-Z][А-ЯЁA-Z0-9\s.,:;«»"'-]{3,98})\s*$/;
      // Numbered headings: "1 Название", "1.1 Название", "1.1.1 Название",
      // "1.", "1.1.", "2.1. Этап" (with optional trailing dot after number).
      const NUMBERED_SECTION = /^(\d+)(\.\d+)?(\.\d+)?\.?[\s.]+([А-ЯЁA-Z][^\n]{3,120})\s*$/;
      const GLAVA = /^(?:Глава|ГЛАВА|Раздел|РАЗДЕЛ|Часть|ЧАСТЬ)\s+[IVXLCDM\d]+[.:]?\s*.*$/;
      const BOLD_SINGLE = /^(?:__|\*\*)([^_*\n]{5,80})(?:__|\*\*)\s*$/;
      // Known section-marker words that ALWAYS should be headings even in
      // Title Case ("Введение", "Заключение"). One-word or short phrase.
      const SECTION_TITLE = /^(Введение|Заключение|Выводы|Содержание|Оглавление|Реферат|Аннотация|Список\s+(?:использованных\s+)?(?:источников|литературы)|Приложение(?:\s+[А-ЯЁ])?|Библиографический\s+список|Список\s+сокращений|Определения)\s*$/i;
      // Normalise a line for heading detection: strip surrounding markdown
      // decorators (`__`, `**`) and backslash-escaped punctuation so
      // mammoth-emitted patterns like "__2.1. Название" and "1.4\. Этап"
      // still match the NUMBERED_SECTION / GLAVA patterns.
      const normalise = (raw: string): string => raw
        .trim()
        .replace(/^[\*_]+/, "")
        .replace(/[\*_]+$/, "")
        .replace(/\\([.,:;!?])/g, "$1")
        .trim();
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = normalise(raw);
        if (!line || line.startsWith("#")) continue;
        const prefixBlank = i > 0 && lines[i - 1].trim() !== "" ? "\n" : "";
        // Section-marker titles (Введение/Заключение/...) always H1.
        if (SECTION_TITLE.test(line)) { lines[i] = prefixBlank + "# " + line; promoted++; continue; }
        if (GLAVA.test(line)) { lines[i] = prefixBlank + "# " + line; promoted++; continue; }
        const nm = NUMBERED_SECTION.exec(line);
        if (nm) {
          // Avoid false positives on list items ("1. Параметр…") and
          // bibliography entries ("1. Иванов И. И. …"). Only promote as
          // heading when EITHER:
          //   (a) the number has a sub-level ("1.1", "2.3") — always a
          //       section marker, never a regular list item;
          //   (b) the number is top-level ("1.") AND the following text is
          //       uppercase — chapter heading convention in ГОСТ.
          const hasSubLevel = !!nm[2];
          const textIsCaps = /^[А-ЯЁA-Z\s0-9.,:;«»"'\-—–]+$/.test(nm[4]);
          if (!hasSubLevel && !textIsCaps) continue;
          const level = nm[3] ? 3 : nm[2] ? 2 : 1;
          // Preserve the numbering prefix in the heading text: "1.1 Название"
          // renders in both body AND TOC as "1.1 Название" (students expect
          // numbered sections to keep their number).
          const numberPrefix = nm[1] + (nm[2] || "") + (nm[3] || "");
          // Pandoc requires a blank line BEFORE an ATX heading for it to be
          // parsed as heading (not body). Insert one if previous line is
          // non-empty.
          const heading = "#".repeat(Math.min(2, level)) + ` ${numberPrefix} ${nm[4].trim()}`;
          lines[i] = prefixBlank + heading;
          promoted++;
          continue;
        }
        if (ALL_CAPS.test(line) && !/[.!?]$/.test(line)) {
          lines[i] = prefixBlank + "# " + line;
          promoted++;
          continue;
        }
        const bm = BOLD_SINGLE.exec(line);
        if (bm && !/[.!?]$/.test(bm[1])) {
          lines[i] = prefixBlank + "## " + bm[1].trim();
          promoted++;
          continue;
        }
      }
      if (promoted > 0) {
        markdown = lines.join("\n");
      }
    }
  }

  // 2b2. Unreferenced raw media — mammoth's markdown converter ignores
  // images embedded inside headers/footers/VML/textboxes. Walk the raw zip,
  // copy any still-missing media into imageDir under a dedicated prefix,
  // and emit markdown image refs at the end so pandoc embeds them and the
  // preservation.images check doesn't regress on such docs.
  {
    const zip = await JSZip.loadAsync(input);
    const mediaFiles = Object.keys(zip.files).filter(
      (f) => /^word\/media\/.+\.(png|jpg|jpeg|gif|bmp|emf|wmf)$/i.test(f),
    );
    const alreadyWritten = new Set(fs.readdirSync(imageDir));
    const extraRefs: string[] = [];
    let extraIdx = 0;
    // Pandoc+LibreOffice reliably embeds PNG/JPG/GIF/BMP. WMF/EMF leave an
    // empty caption block because LibreOffice can't render them in the
    // pandoc→docx path. Skip — better no appendix entry than Рисунок N without
    // an image below.
    const PANDOC_EMBEDDABLE = /\.(png|jpg|jpeg|gif|bmp)$/i;
    for (const f of mediaFiles) {
      const base = path.basename(f);
      if (alreadyWritten.has(base)) continue;
      if (!PANDOC_EMBEDDABLE.test(base)) continue;
      const file = zip.file(f);
      if (!file) continue;
      const buf = await file.async("nodebuffer");
      extraIdx += 1;
      const sub = (base.split(".").pop() ?? "png").toLowerCase();
      const ext = sub.startsWith("x-") ? sub.slice(2) : sub;
      const outName = `extra-${extraIdx}.${ext}`;
      fs.writeFileSync(path.join(imageDir, outName), buf);
      extraRefs.push(`![Рисунок ${extraIdx}](${outName})`);
    }
    if (extraRefs.length > 0) {
      markdown += "\n\n# Приложение. Дополнительные изображения\n\n" + extraRefs.join("\n\n");
    }
  }

  // 2c. Tables — mammoth's markdown converter silently drops <table>. Walk
  // source body блоками, для каждой таблицы запомним текст предыдущего <w:p>
  // (якорь), затем в markdown находим строку с этим текстом и вставляем
  // pipe-таблицу сразу после. Если якорь не найден — фолбэк: append в конец.
  {
    const zip = await JSZip.loadAsync(input);
    const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    const anchors: TableAnchor[] = extractTablesWithAnchors(docXml);
    // Mammoth оборачивает жирный/курсив в __...__ / **...**, заменяет табы — нормализуем,
    // чтобы матч anchor → строка в markdown устоял к этим различиям.
    const normalize = (s: string) =>
      s
        .replace(/[\t\u00A0]+/g, " ")
        .replace(/[*_`]+/g, "")
        .replace(/^#+\s*/, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const lines = markdown.split("\n");
    const usedLineIdx = new Set<number>();
    const orphan: string[] = [];
    for (const a of anchors) {
      if (a.table.rows.length === 0 || a.table.columnCount === 0) continue;
      const pipe = tableToPipeMarkdown(a.table.rows, a.table.columnCount);
      const anchorKey = normalize(a.precedingText).substring(0, 50);
      let injected = false;
      if (anchorKey.length >= 8) {
        for (let i = 0; i < lines.length; i++) {
          if (usedLineIdx.has(i)) continue;
          const norm = normalize(lines[i]);
          if (norm.length === 0) continue;
          if (norm.substring(0, 50) === anchorKey || norm.includes(anchorKey)) {
            // Insert pipe table after this line; account for index shift on later anchors.
            lines.splice(i + 1, 0, "", pipe, "");
            usedLineIdx.add(i);
            injected = true;
            break;
          }
        }
      }
      if (!injected) orphan.push(pipe);
    }
    markdown = lines.join("\n");
    if (orphan.length > 0) {
      markdown += "\n\n# Приложение А. Таблицы\n\n" + orphan.join("\n\n");
    }
  }

  // 2d. Formulas — mammoth drops <m:oMath>; we re-extract them via Pandoc
  // (which preserves math round-trip) and splice them into the mammoth
  // markdown at matching anchor paragraphs. Pandoc assembly then emits
  // native OMML via the reference-doc. Empty array = no math in source
  // (vast majority of non-technical work).
  {
    const { extractFormulasFromDocx, injectFormulasIntoMarkdown } = await import("./extractor/formula-extractor");
    const formulas = extractFormulasFromDocx(input);
    if (formulas.length > 0) {
      const injected = injectFormulasIntoMarkdown(markdown, formulas);
      markdown = injected.markdown;
      if (injected.orphaned > 0) {
        console.warn(`[pipeline-v6] formula-inject: ${injected.placed}/${formulas.length} anchored, ${injected.orphaned} orphaned`);
      }
    }
  }

  // 2d2. Strip orphan markdown image syntax and literal `image`/`img` tokens
  // that mammoth leaves when it cannot resolve the image source. These
  // surface as literal `![image](image-1.png)` text or a lone italic "image"
  // word in the PDF. We:
  //   a) Drop any line that is solely markdown image syntax whose file is
  //      not on disk in imageDir (and not an extra-N.png we wrote).
  //   b) Strip inline `![alt](src)` fragments mid-paragraph when the file
  //      is missing — replace with empty string.
  //   c) Strip standalone italic "image" placeholders that pandoc sometimes
  //      substitutes for broken image references.
  markdown = markdown
    .split("\n")
    .map((line) => {
      // Normalise image-only lines: strip leading whitespace so pandoc does
      // NOT treat them as indented code blocks (4+ spaces = code block in
      // markdown). Without this, "        ![image](image-1.png)" renders as
      // literal text in the PDF instead of an embedded image.
      const trimmed = line.trim();
      const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
      if (!m) return line;
      const src = m[2].trim();
      if (src.startsWith("extra-")) return trimmed;
      try {
        const candidate = path.join(imageDir, path.basename(src));
        if (!fs.existsSync(candidate)) return ""; // drop unresolved ref
      } catch { /* ignore */ }
      return trimmed; // keep, but without leading whitespace
    })
    .map((line) => {
      // Strip inline image refs whose file is missing.
      return line.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, _alt: string, src: string) => {
        if (src.startsWith("extra-")) return full;
        try {
          const candidate = path.join(imageDir, path.basename(src));
          if (!fs.existsSync(candidate)) return "";
        } catch { /* ignore */ }
        return full;
      });
    })
    .map((line) => {
      // Strip standalone "image" / "img" / "*image*" / "_image_" placeholder.
      const t = line.trim();
      if (/^(?:\*\*?|__?)?(?:image|img|изображение|рисунок)(?:\*\*?|__?)?$/i.test(t)) return "";
      return line;
    })
    .join("\n");

  // 2d3. Bibliography list continuity. User-reported symptom: the "Список
  // использованных источников" section renders as 1,2,1,2,3,1… instead of
  // 1..N. Root cause: pandoc starts a NEW numbered list for each contiguous
  // block of "1. item\n2. item\n" separated by a blank paragraph. Mammoth
  // often emits extra blank lines between references, fragmenting the list.
  //
  // Fix: scan markdown for the bibliography section (heading containing
  // СПИСОК ИСТОЧНИКОВ / СПИСОК ЛИТЕРАТУРЫ), rebuild every "N. …" line in
  // that section as a SINGLE ordered list without blank separators.
  {
    const lines = markdown.split("\n");
    // Match heading containing СПИСОК + (ИСТОЧНИКОВ | ЛИТЕРАТУРЫ) or the
    // Russian title-case variants. Allows lorem-replaced middle words:
    // "СПИСОК ТРЕБОВАНИЕ ИСТОЧНИКОВ" → matches via СПИСОК + ИСТОЧНИКОВ.
    const SECTION_BIBLIO_RE = /^#+\s*(?:(?:Список|СПИСОК)\s+.*?(?:источников|литературы|ИСТОЧНИКОВ|ЛИТЕРАТУРЫ)|Библиографический\s+список)\s*$/i;
    const SECTION_BOUNDARY_RE = /^#+\s+/; // any new heading closes bib block
    const ITEM_RE = /^\s*(\d+)\.\s+(.*)$/;
    let bibStart = -1;
    for (let i = 0; i < lines.length; i++) {
      if (SECTION_BIBLIO_RE.test(lines[i].trim())) { bibStart = i; break; }
    }
    if (bibStart !== -1) {
      let end = lines.length;
      for (let i = bibStart + 1; i < lines.length; i++) {
        if (SECTION_BOUNDARY_RE.test(lines[i])) { end = i; break; }
      }
      // Collect raw text of the bib section (all lines joined), then split by
      // ` N. ` pattern mid-string. This handles the case where mammoth put
      // two items on one line (e.g. "…31.03.2026). 10. Пример…").
      const raw = lines.slice(bibStart + 1, end)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join(" ");
      // Split by pattern `(whitespace|start) N.` where N is 1-3 digits. Keep
      // delimiter in result.
      const splits: string[] = [];
      const splitRe = /(?:^|\s)(\d{1,3})\.\s+/g;
      let lastEnd = 0;
      let mt: RegExpExecArray | null;
      const starts: number[] = [];
      while ((mt = splitRe.exec(raw))) starts.push(mt.index);
      if (starts.length >= 2) {
        for (let k = 0; k < starts.length; k++) {
          const from = starts[k];
          const to = k + 1 < starts.length ? starts[k + 1] : raw.length;
          const seg = raw.slice(from, to).replace(/^\s*\d{1,3}\.\s+/, "").trim();
          if (seg.length > 0) splits.push(seg);
        }
        lastEnd = starts[0]; // silence warning
      }

      if (splits.length >= 2) {
        const rebuilt = splits.map((it, idx) => `${idx + 1}. ${it}`).join("\n");
        lines.splice(bibStart + 1, end - bibStart - 1, "", rebuilt, "");
        markdown = lines.join("\n");
      }
    }
  }

  // 2d4. Unescape pandoc/mammoth backslash artefacts inside running text.
  // mammoth emits `\(`, `\)`, `\.`, `\-` etc. to preserve punctuation through
  // markdown parsing; pandoc then interprets `\(…\)` as inline math delimiters.
  // If the content isn't valid TeX (usually it's just Russian text with parens),
  // the output PDF shows literal backslashes. Strategy: remove backslash-escapes
  // of non-special punctuation, preserving `$` (math) and `*`/`_` (emphasis).
  markdown = markdown.replace(/\\([()\[\]{}.,;:!?\-])/g, "$1");

  // 2e. Strip stray underscores. Mammoth converts <w:u> (underline) and
  // partial style boundaries into raw markdown underscores that render as
  // literal "_" in the PDF — never an academic-text artefact. We:
  //   a) unescape "\_" to plain "_"
  //   b) drop 3+ consecutive underscores ("___" separators)
  //   c) drop stray leading/trailing pairs of "__" that didn't come with a
  //      closing pair on same line (orphan bold markers)
  //   d) if a line has an ODD number of "_" (underscores around words),
  //      strip all of them — it means the emphasis markers got partially
  //      lost during extraction.
  // Strip mammoth's TOC-anchor tags globally — they never carry visible
  // text and pandoc treats them as raw HTML which pollutes heading lines.
  markdown = markdown.replace(/<a\s+id="[^"]*">\s*<\/a>/gi, "");

  // Also clean already-styled headings: "# __TEXT__" → "# TEXT"
  markdown = markdown.replace(/^(#{1,6}\s+)[\*_]+([^\n]*?)[\*_]+\s*$/gm, "$1$2");
  markdown = markdown.replace(/^(#{1,6}\s+)[\*_]+/gm, "$1");

  // Ensure blank line BEFORE and AFTER every `#…` heading line. Pandoc
  // requires blank-line separation for ATX heading detection, and without
  // trailing blank the following line can merge the heading into a paragraph.
  // Also normalise heading text: collapse leading `#` inside heading (e.g.
  // "## # TEXT" → "## TEXT") which arises when our promotion overlaps an
  // existing mammoth heading marker.
  {
    const lines = markdown.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const hm = /^(#{1,6})\s+(.*)$/.exec(line);
      if (hm) {
        // Strip leading `#` chars from the heading's own text (collapse
        // accidental "## # TEXT" → "## TEXT").
        const cleanText = hm[2].replace(/^#+\s*/, "").trim();
        line = `${hm[1]} ${cleanText}`;
        if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
        out.push(line);
        // Ensure trailing blank unless next line is already blank or next heading.
        if (i + 1 < lines.length && lines[i + 1].trim() !== "" && !/^#{1,6}\s+/.test(lines[i + 1])) {
          out.push("");
        }
        continue;
      }
      out.push(line);
    }
    markdown = out.join("\n");
  }

  markdown = markdown
    .replace(/\\_/g, "_")
    .replace(/_{3,}/g, "")
    // Mammoth emits `__bold__` but often loses the closing `__` or emits it
    // after/before punctuation that mammoth-markdown can't handle. Pandoc
    // then shows literal `__`. Strip `__` that are NOT inside a balanced
    // `__…__` pair: run through every line, count pair-matches via a
    // greedy-pair regex, and strip any `__` that the greedy pair regex
    // didn't consume. Also handle leading/trailing and bracket-adjacent:
    .replace(/(\S)__(?=[\s—–\-.,;:!?)»"'}]|$)/gm, "$1")
    .replace(/(^|[\s(«"'{—–\-])__(\S)/gm, "$1$2")
    .replace(/^([^_\n]*)__\s*$/gm, "$1")
    .replace(/^__([^_\n]+)/gm, "$1")
    .split("\n")
    .map((line) => {
      // Strip orphan trailing `__` markers — lines ending in "something__"
      // where no matching opening `__` exists earlier on the line. This
      // handles mammoth's partial-style emissions like "Этап:__" /
      // "требование компонент__" that render literally in PDF.
      const trimEnd = line.replace(/\s+$/, "");
      const trailing = /__\s*$/.test(trimEnd);
      if (trailing) {
        const body = trimEnd.replace(/__\s*$/, "");
        // No matching `__` pair in body → orphan close, strip.
        const pairs = (body.match(/__/g) ?? []).length;
        if (pairs === 0) return body + (line.length > trimEnd.length ? line.slice(trimEnd.length) : "");
      }
      return line;
    })
    .map((line) => {
      // Count bare underscores (not part of word_with_underscore).
      const count = (line.match(/_/g) ?? []).length;
      if (count === 0 || count % 2 === 0) return line;
      // Odd → likely unbalanced mammoth artefact; strip all underscores
      // between whitespace or word boundaries.
      return line.replace(/_/g, "");
    })
    .join("\n");

  // 3. Optional rewrite
  let rewrittenSlots = 0;
  const t3 = Date.now();
  if (opts.rewrite) {
    const rew = await rewriteBody(markdown, {});
    markdown = rew.markdown;
    rewrittenSlots = rew.slotsRewritten;
  }
  timings.rewriteMs = Date.now() - t3;

  // 4. Assembly plan: count tables per assembler
  const tableAssemblyPlan = { pandoc: 0, docxtpl: 0 };
  for (const table of extracted.assets.tables) {
    const c = detectTableComplexity(table);
    tableAssemblyPlan[c.recommendedAssembler]++;
  }

  // 4b. Strip title block from markdown before pandoc. Иначе pandoc отрендерит
  // титул в body, а мы потом prepend ещё один сверху → дубликация (баг на
  // 1fQQWL9EHe5XDnM4jjniD). Если границу найти не удалось, strip=no-op.
  {
    const stripped = stripTitleFromMarkdown(markdown);
    markdown = stripped.markdown;
  }

  // 5. Assemble via Pandoc (complex tables left as placeholders; docxtpl fallback is per-section, future work)
  const t4 = Date.now();
  const pandocResult = await assembleWithPandoc({
    markdown,
    referenceDoc,
    metadata: opts.metadata,
    toc: true,
    tocDepth: 2,
    tocTitle: rulePack.values.tocTitle,
    resourcePath: [imageDir],
  });
  let output = pandocResult.buffer;

  // Correct pipeline order for structural elements:
  //   (A) Title page — PREPEND first so TOC ends up after it, establishing
  //       canonical document flow titlepage → TOC → body.
  //   (B) Placeholder detect + insert — now can anchor off the SDT TOC that
  //       pandoc emitted, placing ВВЕДЕНИЕ after TOC, ЗАКЛЮЧЕНИЕ/СПИСОК at
  //       body-end, etc.
  //   (C) fixupToc — unwrap SDT, build static TOC from ALL Heading1/2 that
  //       now exist (including placeholder headings).
  //   (D) keep-together — <w:cantSplit/> on rows, <w:keepNext/> on paragraphs
  //       preceding tables/figures.
  //   (E) fillTocPageNumbers — second-pass PDF render + page number fill in
  //       the final static TOC.

  // (A) Title page — LLM extraction (with regex fallback) → template render.
  //   gost    — полный ГОСТ-шаблон (диплом/курсовая/вкр/...)
  //   minimal — нетипичные работы (workType=иное/отчёт или UI-hint «Другое»)
  //   skip    — coreFields<2 → фоллбэк на extractTitlePageXml (raw copy)
  let titleHandled = false;
  if (!opts.disableLlmTitle) {
    try {
      const { fields } = await extractTitlePageFields(extracted.markdown);
      const tier = decideTitleTier({ fields, userWorkTypeHint: opts.userWorkTypeHint });
      if (tier !== "skip") {
        output = await prependTitleToOutput(output, fields, { variant: tier });
        titleHandled = true;
      }
    } catch (err) {
      console.warn("[pipeline-v6] LLM title extraction failed, falling back to raw copy:", err);
    }
  }
  if (!titleHandled) {
    try {
      const titleXml = await extractTitlePageXml(input);
      if (titleXml) {
        output = await prependTitleToDocx(output, titleXml);
      }
    } catch (err) {
      console.warn("[pipeline-v6] title-page fallback failed:", err);
    }
  }

  // (B) fixupToc pass 1 — unwrap SDT, build initial static TOC from pandoc
  // output headings. Needed BEFORE placeholder insertion so inserter can
  // anchor off static TOC block (findEndOfStaticToc).
  output = await fixupToc(output);

  // (C) Placeholder detect + insert — anchors are now the static TOC and
  // real body headings. Inserts ВВЕДЕНИЕ after TOC, ЗАКЛЮЧЕНИЕ before
  // СПИСОК, СПИСОК at body end.
  {
    const workType = (opts.userWorkTypeHint as WorkType | undefined) ?? "иное";
    const expected = expectedSectionsFor(workType);
    const zipTmp = await JSZip.loadAsync(output);
    const docXml = (await zipTmp.file("word/document.xml")?.async("string")) ?? "";
    const detections = detectSections(docXml, expected);
    const insertion = await insertMissingSectionPlaceholders(output, detections);
    output = insertion.buffer;
    if (insertion.inserted.length > 0) {
      console.log("[pipeline-v6] inserted section placeholders:", insertion.inserted.join(", "));
    }
  }

  // (D) fixupToc pass 2 — rebuild static TOC to include placeholder headings
  // that didn't exist at pass 1. Uses findStaticTocRange to replace the
  // previously-built static entries in-place.
  output = await fixupToc(output);

  // (D) Keep-together rules for tables and figures.
  output = await applyKeepTogetherRules(output);

  // (E) Two-pass page numbers: render final docx to PDF, resolve real page
  // numbers for each TOC entry, rewrite TOC with real numbers.
  try {
    output = await fillTocPageNumbers(output);
  } catch (err) {
    console.warn("[pipeline-v6] toc page-number fill failed:", (err as Error).message);
  }

  // (F) Page numbers in footer: inject footer2.xml with PAGE field on every
  // body page; footer1.xml empty (titlePg flag skips numbering on cover).
  try {
    output = await injectPageNumbers(output);
  } catch (err) {
    console.warn("[pipeline-v6] page-number inject failed:", (err as Error).message);
  }

  timings.assembleMs = Date.now() - t4;

  // 6. Initial check — проверяем САМ ИСХОДНИК, чтобы UI показал реальные
  // нарушения пользовательского документа ("что было не так"). После pandoc +
  // reference-doc почти все стилистические проверки проходят → если чекать
  // output, UI увидит 0-1 нарушений и выглядит как будто ничего не сделали.
  const t5 = Date.now();
  const initialReport = await runQualityChecks(input, input, undefined, opts.documentId, rules);
  timings.checkMs = Date.now() - t5;

  // 7. Fix loop (single iteration by default).
  //
  // Run an *output* quality check once before the loop, so the "final" report
  // reflects the assembled pipeline output even when no auto-fixes apply. Prior
  // to this, `currentReport` started as the *source* self-check, and docs for
  // which no auto-fixer fired were reported with finalScore == sourceScore
  // (e.g. 88 / 76) even though the produced docx actually scored 100.
  const t6 = Date.now();
  const fixPlan = planFixes(initialReport);
  const maxIters = opts.fixIterations ?? 1;
  let currentReport = await runQualityChecks(input, output, undefined, opts.documentId, rules);
  for (let iter = 0; iter < maxIters; iter++) {
    const { buffer: fixedBuf, applied } = await applyAutoFixesToBuffer(output, currentReport);
    if (applied.length === 0) break;
    output = fixedBuf;
    currentReport = await runQualityChecks(input, output, undefined, opts.documentId, rules);
    if (currentReport.score >= fixPlan.targetScore) break;
  }
  timings.fixMs = Date.now() - t6;
  const suggestions = summariseSuggestions(currentReport);

  timings.totalMs = Date.now() - t0;

  // Cleanup extracted-images tmpdir.
  try {
    fs.rmSync(imageDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  return {
    output,
    extracted,
    structure,
    rewrittenSlots,
    tableAssemblyPlan,
    initialReport,
    finalReport: currentReport,
    fixPlan,
    suggestions,
    timings,
  };
}
