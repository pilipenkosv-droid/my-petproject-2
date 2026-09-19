import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { DocxPackage } from "@/lib/pipeline-v7/docx/package";
import { parseDocxXml } from "@/lib/xml/docx-xml";

const CORPORA: { label: string; dir: string }[] = [
  { label: "real", dir: "/Users/sergejpilipenko/diplox/data/corpus/real" },
  { label: "synthetic", dir: path.resolve(__dirname, "../../../data/corpus/synthetic") },
];

function listDocx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".docx") && !f.startsWith("~$"))
    .map((f) => path.join(dir, f));
}

const ENTITIES = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;
const EMPTY_PAIR = /<([A-Za-z_][\w.:-]*)((?:\s[^<>]*?)?)><\/\1>/g;

/** Byte-level difference classes between two serialisations of the same AST. */
function classifyDrift(before: string, after: string): Record<string, number> {
  const decl = (s: string) => (s.startsWith("<?xml") ? s.slice(0, s.indexOf("?>") + 2) : "");
  const eol = (s: string) => (/^<\?xml[^>]*\?>(\r?\n)/.exec(s)?.[1] ?? "").length;
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
  return {
    xmlDeclaration: decl(before) === decl(after) ? 0 : 1,
    declarationNewline: eol(before) === eol(after) ? 0 : 1,
    emptyElementForm: Math.abs(count(before, EMPTY_PAIR) - count(after, EMPTY_PAIR)),
    entityEscaping: Math.abs(count(before, ENTITIES) - count(after, ENTITIES)),
    byteLengthDelta: after.length - before.length,
    identical: before === after ? 1 : 0,
  };
}

function addDrift(total: Record<string, number>, one: Record<string, number>): void {
  for (const [k, v] of Object.entries(one)) total[k] = (total[k] ?? 0) + v;
}

for (const { label, dir } of CORPORA) {
  const files = listDocx(dir);

  describe.skipIf(files.length === 0)(`package round-trip — ${label} corpus`, () => {
    it("load → save with nothing touched is byte-identical", async () => {
      const failures: string[] = [];
      for (const file of files) {
        const input = fs.readFileSync(file);
        const out = await (await DocxPackage.load(input)).save();
        if (!input.equals(out)) failures.push(`${path.basename(file)}: ${input.length} → ${out.length}`);
      }
      expect(failures, `byte drift in untouched save (${label})`).toEqual([]);
    });

    // 20 s, not the default 5: see the note in classify-residue.test.ts.
    it("load → parse document.xml → markDirty → save preserves the AST", { timeout: 20_000 }, async () => {
      const drift: Record<string, number> = {};
      const perDoc: string[] = [];
      const astFailures: string[] = [];

      for (const file of files) {
        const input = fs.readFileSync(file);
        const pkg = await DocxPackage.load(input);
        const parts = await pkg.contentParts();
        const main = parts.find((p) => p.kind === "document");
        expect(main, `${path.basename(file)} has no main document part`).toBeDefined();

        const beforeXml = (await pkg.text(main!.name))!;
        await pkg.part(main!.name);
        pkg.markDirty(main!.name);
        const out = await pkg.save();

        const reopened = await DocxPackage.load(out);
        const afterXml = (await reopened.text(main!.name))!;

        const a = JSON.stringify(parseDocxXml(beforeXml));
        const b = JSON.stringify(parseDocxXml(afterXml));
        if (a !== b) astFailures.push(path.basename(file));

        const one = classifyDrift(beforeXml, afterXml);
        addDrift(drift, one);
        if (!one.identical) perDoc.push(`${path.basename(file)} ${JSON.stringify(one)}`);
      }

      process.stdout.write(
        `\n[${label}] ${files.length} docs — byte-drift classes after re-serialising word/document.xml:\n` +
          `  ${JSON.stringify(drift)}\n` +
          (perDoc.length ? `  drifting docs:\n    ${perDoc.join("\n    ")}\n` : "  no byte drift\n")
      );

      expect(astFailures, `AST inequality after re-serialisation (${label})`).toEqual([]);
    });

    it("output still opens and parses", async () => {
      for (const file of files) {
        const pkg = await DocxPackage.load(fs.readFileSync(file));
        const main = (await pkg.contentParts()).find((p) => p.kind === "document")!;
        await pkg.part(main.name);
        pkg.markDirty(main.name);
        const zip = await JSZip.loadAsync(await pkg.save());
        const xml = await zip.file(main.name)!.async("string");
        expect(parseDocxXml(xml).some((n) => "w:document" in n)).toBe(true);
      }
    });

    it("every entry survives with the same names and order", async () => {
      for (const file of files) {
        const input = fs.readFileSync(file);
        const pkg = await DocxPackage.load(input);
        const main = (await pkg.contentParts()).find((p) => p.kind === "document")!;
        await pkg.part(main.name);
        pkg.markDirty(main.name);
        const after = await DocxPackage.load(await pkg.save());
        expect(after.entryNames()).toEqual(pkg.entryNames());
      }
    });
  });
}

const PRESERVE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t xml:space="preserve">a  b </w:t></w:r><w:r><w:t></w:t></w:r><w:r><w:t xml:space="preserve">&amp;&lt;&gt;"</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="both"/></w:pPr></w:p></w:body></w:document>`;

async function minimalDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file("word/document.xml", PRESERVE_XML);
  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

describe("whitespace and entity hazards", () => {
  it("keeps xml:space='preserve' text nodes intact through parse → build", async () => {
    const pkg = await DocxPackage.load(await minimalDocx());
    await pkg.part("word/document.xml");
    pkg.markDirty("word/document.xml");
    const out = await (await DocxPackage.load(await pkg.save())).text("word/document.xml");

    expect(out).toContain(`<w:t xml:space="preserve"> </w:t>`);
    expect(out).toContain(`<w:t xml:space="preserve">a  b </w:t>`);
    expect(out).toContain(`&amp;&lt;&gt;`);
    expect(JSON.stringify(parseDocxXml(out!))).toBe(JSON.stringify(parseDocxXml(PRESERVE_XML)));
  });

  it("discovers the main document part from [Content_Types].xml", async () => {
    const pkg = await DocxPackage.load(await minimalDocx());
    expect(await pkg.contentParts()).toEqual([{ name: "word/document.xml", kind: "document" }]);
  });

  it("refuses to save a part marked dirty but never parsed", async () => {
    const pkg = await DocxPackage.load(await minimalDocx());
    pkg.markDirty("word/document.xml");
    await expect(pkg.save()).rejects.toThrow(/never parsed/);
  });
});
