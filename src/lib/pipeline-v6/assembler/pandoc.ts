// Pandoc assembler — wraps `pandoc` CLI via child_process.
// Accepts Markdown + YAML metadata, returns Buffer of .docx.
//
// On Vercel: pandoc binary must be available in PATH (layer or bundled).
// Locally: assumes `pandoc` on PATH (brew install pandoc).

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface PandocOptions {
  /** Markdown body (without YAML frontmatter — supply via `metadata`). */
  markdown: string;
  /** Absolute path to reference-doc (.docx template with GOST styles). */
  referenceDoc: string;
  /** YAML metadata block — title/author/date/lang etc. */
  metadata?: Record<string, string | number | boolean>;
  /** Insert native TOC field code (`--toc`). */
  toc?: boolean;
  /** TOC depth (default 2). */
  tocDepth?: number;
  /** Additional pandoc CLI args. */
  extraArgs?: string[];
  /** Timeout in ms (default 90s — large diplomas routinely need >30s). */
  timeoutMs?: number;
}

const DEFAULT_PANDOC_TIMEOUT_MS = 90_000;

export interface PandocResult {
  buffer: Buffer;
  elapsedMs: number;
  command: string;
}

export class PandocError extends Error {
  constructor(message: string, public readonly stderr: string, public readonly exitCode: number | null) {
    super(message);
    this.name = "PandocError";
  }
}

function buildYamlHeader(metadata: Record<string, string | number | boolean>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(metadata)) {
    const escaped = typeof value === "string" ? JSON.stringify(value) : String(value);
    lines.push(`${key}: ${escaped}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

export async function assembleWithPandoc(opts: PandocOptions): Promise<PandocResult> {
  if (!fs.existsSync(opts.referenceDoc)) {
    throw new PandocError(`reference-doc missing: ${opts.referenceDoc}`, "", null);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pandoc-v6-"));
  const inputPath = path.join(tmpDir, "input.md");
  const outputPath = path.join(tmpDir, "output.docx");

  const body = opts.metadata && Object.keys(opts.metadata).length > 0
    ? buildYamlHeader(opts.metadata) + opts.markdown
    : opts.markdown;
  fs.writeFileSync(inputPath, body, "utf8");

  const args = [
    `--reference-doc=${opts.referenceDoc}`,
    inputPath,
    "-o",
    outputPath,
  ];
  if (opts.toc !== false) {
    args.push("--toc", `--toc-depth=${opts.tocDepth ?? 2}`);
  }
  if (opts.extraArgs) args.push(...opts.extraArgs);

  const t0 = Date.now();
  return new Promise<PandocResult>((resolve, reject) => {
    const proc = spawn("pandoc", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timeoutMs = opts.timeoutMs ?? DEFAULT_PANDOC_TIMEOUT_MS;
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      cleanup();
      reject(new PandocError(`pandoc timeout (${timeoutMs}ms)`, stderr, null));
    }, timeoutMs);

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
      reject(new PandocError(`pandoc spawn failed: ${err.message}`, stderr, null));
    });

    proc.on("close", (code) => {
      const elapsedMs = Date.now() - t0;
      if (code !== 0) {
        cleanup();
        reject(new PandocError(`pandoc exited ${code}`, stderr, code));
        return;
      }
      try {
        const buffer = fs.readFileSync(outputPath);
        cleanup();
        resolve({
          buffer,
          elapsedMs,
          command: `pandoc ${args.join(" ")}`,
        });
      } catch (err) {
        cleanup();
        reject(new PandocError(`cannot read output: ${String(err)}`, stderr, code));
      }
    });
  });
}
