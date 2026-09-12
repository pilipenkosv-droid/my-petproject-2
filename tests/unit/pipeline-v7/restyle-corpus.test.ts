/**
 * Cheap fidelity proxy for the restyler: block counts, run counts and the
 * ordered list of paragraph texts must survive a full classify → restyle →
 * save → reload cycle unchanged. The real gate is the fingerprint check; this
 * catches the gross failures (a dropped row, a rewritten w:t) at corpus scale.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { children, tagName, type OrderedXmlNode } from "@/lib/xml/docx-xml";
import { GOST_7_32 } from "@/lib/pipeline-v6/rule-packs/gost-7-32";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { classifyDocument } from "@/lib/pipeline-v7/classify/deterministic";
import { walkBlocks, paragraphText } from "@/lib/pipeline-v7/docx/walk";
import { restyleDocument } from "@/lib/pipeline-v7/restyle";

const PACK = GOST_7_32;

interface Shape {
  paragraphs: number;
  tables: number;
  runs: number;
  texts: string[];
}

async function shapeOf(buf: Buffer): Promise<Shape> {
  const pkg = await DocxPackage.load(buf);
  const shape: Shape = { paragraphs: 0, tables: 0, runs: 0, texts: [] };
  for (const ref of await pkg.contentParts()) {
    const nodes = await pkg.part(ref.name);
    if (!nodes) continue;
    for (const block of walkBlocks(nodes)) {
      if (block.kind === "tbl") shape.tables += 1;
      else {
        shape.paragraphs += 1;
        shape.texts.push(paragraphText(block.node));
        shape.runs += countRuns(block.node);
      }
    }
  }
  return shape;
}

function countRuns(node: OrderedXmlNode): number {
  let n = 0;
  for (const child of children(node)) {
    if (tagName(child) === "w:r") n += 1;
    else if (tagName(child)) n += countRuns(child);
  }
  return n;
}

describe("corpus smoke", () => {
  const synthetic = path.join(process.cwd(), "data/corpus/synthetic");
  const real = "/Users/sergejpilipenko/diplox/data/corpus/real";
  const files = [
    ...fs.readdirSync(synthetic).filter((f) => f.endsWith(".docx")).map((f) => path.join(synthetic, f)),
    ...(fs.existsSync(real)
      ? fs.readdirSync(real).filter((f) => f.endsWith(".docx")).sort().slice(0, 5).map((f) => path.join(real, f))
      : []),
  ];

  it("preserves block, run and text shape across a full restyle", async () => {
    const slow: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file);
      const before = await shapeOf(src);
      const started = Date.now();
      const pkg = await DocxPackage.load(src);
      const classification = await classifyDocument(pkg);
      const stats = await restyleDocument(pkg, PACK, classification);
      const out = await pkg.save();
      const ms = Date.now() - started;
      const after = await shapeOf(out);
      const name = path.basename(file);
      expect({ name, ...after }).toEqual({ name, ...before });
      expect(stats.stylesPartMissing, name).toBe(false);
      if (ms >= 2000) slow.push(`${name}: ${ms}ms`);
    }
    expect(slow).toEqual([]);
  }, 120000);
});
