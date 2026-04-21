// docxtpl fallback assembler — Python child_process wrapper.
// Used only when table complexity detector flags merged-cells / multi-header
// tables that Pandoc can't reliably render.
//
// Usage: the Python runner lives at scripts/pipeline-v6/spike-docxtpl/run.py
// (to be formalized under src/lib/pipeline-v6/assembler/docxtpl-runner.py
// as part of the prod path). For now we spawn `uv run python run.py`
// from that spike dir with a JSON context written to tmp.

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface DocxTplContext {
  title: string;
  author?: string;
  year?: number;
  /** Free-form sections with pre-rendered text content. */
  sections?: { heading: string; body: string }[];
  /** Complex tables with merged cells. */
  tables?: { headers: string[]; rows: string[][] }[];
  [key: string]: unknown;
}

export interface DocxTplOptions {
  /** Absolute path to template.docx with Jinja tags. */
  template: string;
  context: DocxTplContext;
  /** Path to runner script (default: scripts/pipeline-v6/spike-docxtpl/run.py). */
  runnerScript?: string;
  /** Timeout ms (default 30s). */
  timeoutMs?: number;
}

export interface DocxTplResult {
  buffer: Buffer;
  elapsedMs: number;
}

export class DocxTplError extends Error {
  constructor(message: string, public readonly stderr: string, public readonly exitCode: number | null) {
    super(message);
    this.name = "DocxTplError";
  }
}

const DEFAULT_RUNNER = path.join(
  process.cwd(),
  "scripts/pipeline-v6/spike-docxtpl/run.py",
);

export async function assembleWithDocxTpl(opts: DocxTplOptions): Promise<DocxTplResult> {
  if (!fs.existsSync(opts.template)) {
    throw new DocxTplError(`template missing: ${opts.template}`, "", null);
  }
  const runner = opts.runnerScript ?? DEFAULT_RUNNER;
  if (!fs.existsSync(runner)) {
    throw new DocxTplError(`runner missing: ${runner}`, "", null);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "docxtpl-v6-"));
  const contextPath = path.join(tmpDir, "context.json");
  const outputPath = path.join(tmpDir, "output.docx");
  fs.writeFileSync(contextPath, JSON.stringify(opts.context), "utf8");

  const args = [
    "run",
    "python",
    runner,
    "--template",
    opts.template,
    "--context",
    contextPath,
    "--output",
    outputPath,
  ];

  const t0 = Date.now();
  return new Promise<DocxTplResult>((resolve, reject) => {
    const proc = spawn("uv", args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: path.dirname(runner),
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      cleanup();
      reject(new DocxTplError(`docxtpl timeout (${opts.timeoutMs ?? 30000}ms)`, stderr, null));
    }, opts.timeoutMs ?? 30000);

    const cleanup = () => {
      clearTimeout(timer);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    };

    proc.on("error", (err) => {
      cleanup();
      reject(new DocxTplError(`docxtpl spawn failed: ${err.message}`, stderr, null));
    });

    proc.on("close", (code) => {
      const elapsedMs = Date.now() - t0;
      if (code !== 0) {
        cleanup();
        reject(new DocxTplError(`docxtpl exited ${code}`, stderr, code));
        return;
      }
      try {
        const buffer = fs.readFileSync(outputPath);
        cleanup();
        resolve({ buffer, elapsedMs });
      } catch (err) {
        cleanup();
        reject(new DocxTplError(`cannot read output: ${String(err)}`, stderr, code));
      }
    });
  });
}

// ── Table complexity detector ──

export interface TableComplexity {
  hasMergedCells: boolean;
  hasMultiHeader: boolean;
  columnCount: number;
  rowCount: number;
  complexity: "simple" | "moderate" | "complex";
  /** If complex → use docxtpl; otherwise Pandoc pipe-table is sufficient. */
  recommendedAssembler: "pandoc" | "docxtpl";
}

export function detectTableComplexity(table: {
  rows: string[][];
  hasMergedCells: boolean;
  columnCount: number;
}): TableComplexity {
  const rowCount = table.rows.length;
  const columnCount = table.columnCount;
  const hasMultiHeader = rowCount >= 2 && table.rows[0]?.length !== table.rows[1]?.length;
  let complexity: TableComplexity["complexity"];
  if (table.hasMergedCells || hasMultiHeader) complexity = "complex";
  else if (columnCount > 5 || rowCount > 20) complexity = "moderate";
  else complexity = "simple";
  return {
    hasMergedCells: table.hasMergedCells,
    hasMultiHeader,
    columnCount,
    rowCount,
    complexity,
    recommendedAssembler: complexity === "complex" ? "docxtpl" : "pandoc",
  };
}
