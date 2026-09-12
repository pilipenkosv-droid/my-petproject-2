/**
 * Fingerprint inspector.
 *
 *   npx tsx scripts/pipeline-v7/inspect-fingerprint.ts a.docx           summary
 *   npx tsx scripts/pipeline-v7/inspect-fingerprint.ts a.docx b.docx    diff + gate
 *
 * Block text is never printed for a real student document unless --show-text
 * is passed explicitly.
 */

import fs from "fs";
import path from "path";
import { computeFingerprint } from "../../src/lib/pipeline-v7/fingerprint/compute";
import { diffFingerprints, type FidelityEntry } from "../../src/lib/pipeline-v7/fingerprint/diff";
import { evaluateGate } from "../../src/lib/pipeline-v7/fingerprint/gate";
import type { Fingerprint } from "../../src/lib/pipeline-v7/fingerprint/types";

const args = process.argv.slice(2);
const showText = args.includes("--show-text");
const allowTextNormalization = args.includes("--allow-normalization");
const files = args.filter((a) => !a.startsWith("--"));

function redact(s: string): string {
  return showText ? s : `<${s.length} симв.>`;
}

function summary(fp: Fingerprint): void {
  for (const [name, part] of Object.entries(fp.parts)) {
    const counts = Object.entries(part.counts).filter(([, n]) => n > 0);
    console.log(`\n${name}`);
    console.log(`  блоков: ${part.blocks.length} (абзацев ${part.blocks.filter((b) => b.kind === "p").length})`);
    console.log(`  маркеры: ${counts.map(([m, n]) => `${m}=${n}`).join(", ") || "нет"}`);
    console.log(`  таблиц: ${part.tableShapes.length}, закладок: ${part.bookmarks.length}`);
    console.log(`  поля (первые 5): ${part.fieldInstrs.slice(0, 5).join(" | ") || "нет"}`);
    for (const [i, s] of part.sections.entries()) {
      console.log(
        `  секция ${i}: ${s.orient}, колонок ${s.colsNum}${s.colsEqualWidth ? "" : " (разной ширины)"}` +
          `, type=${s.type ?? "по умолчанию"}, titlePg=${s.titlePg}` +
          `, hdr=[${s.headerRefTypes.join(",")}] ftr=[${s.footerRefTypes.join(",")}]`
      );
    }
  }
  console.log(`\nпакет: медиа ${fp.packageLevel.mediaFiles.length}, связей ${fp.packageLevel.relTargets.length}, внедрений ${fp.packageLevel.embeddedObjects}`);
}

function describe(entry: FidelityEntry): string {
  switch (entry.kind) {
    case "count":
      return `count ${entry.part} ${entry.marker}: ${entry.before} → ${entry.after}`;
    case "block-removed":
    case "block-inserted":
      return `${entry.kind} ${entry.part} #${entry.index} ${entry.block.path}` +
        (entry.block.kind === "p" ? ` ${redact(entry.block.text)}` : " (таблица)");
    case "text-changed":
      return `text-changed ${entry.part} ${entry.path}: ${redact(entry.before)} → ${redact(entry.after)}`;
    case "field":
      return `field ${entry.part} ${entry.instr}: ${entry.before} → ${entry.after}`;
    default:
      return `${entry.kind} ${JSON.stringify(entry)}`;
  }
}

async function main(): Promise<void> {
  if (files.length === 0) {
    console.error("usage: inspect-fingerprint.ts <a.docx> [b.docx] [--show-text] [--allow-normalization]");
    process.exit(2);
  }
  const before = await computeFingerprint(fs.readFileSync(files[0]));
  if (files.length === 1) {
    console.log(`ОТПЕЧАТОК ${path.basename(files[0])}`);
    summary(before);
    return;
  }
  const after = await computeFingerprint(fs.readFileSync(files[1]));
  const diff = diffFingerprints(before, after);
  const gate = evaluateGate(before, after, { allowTextNormalization });
  console.log(`${path.basename(files[0])} → ${path.basename(files[1])}: расхождений ${diff.entries.length}`);
  for (const entry of diff.entries) console.log(`  ${describe(entry)}`);
  console.log(`\nВЕРДИКТ: ${gate.pass ? "PASS" : "FAIL"} (нарушений ${gate.violations.length}, разрешено ${gate.allowed.length})`);
  // Only text-changed messages quote document text; everything else is paths.
  const safe = (kind: string, message: string, entry?: FidelityEntry) =>
    !showText && entry?.kind === "text-changed" ? describe(entry) : `${kind} ${message}`;
  for (const v of gate.violations) console.log(`  ✗ [${v.kind}] ${safe("", v.message, v.entry)}`);
  for (const a of gate.allowed) console.log(`  ✓ [${a.rule}] ${safe("", a.message, a.entry)}`);
  if (!gate.pass) process.exitCode = 1;
}

void main();
