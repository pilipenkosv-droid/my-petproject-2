/**
 * Добавляет `dateModified: "2026-04-17",` под `datePublished:` в постах, где его нет.
 * Файлы: posts-gost.ts и posts-second-brain.ts.
 *
 * Usage: npx tsx scripts/seo-add-datemodified.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const TODAY = "2026-04-17";
const files = [
  resolve(process.cwd(), "src/lib/blog/posts-gost.ts"),
  resolve(process.cwd(), "src/lib/blog/posts-second-brain.ts"),
];

for (const f of files) {
  let content = readFileSync(f, "utf-8");
  // Split into blog-post blocks — each starts with "  {" (one-off: the array opener)
  // Simpler: regex-based — find `datePublished: "..."` lines that are NOT followed by a `dateModified:` line within next 120 chars.
  const lines = content.split("\n");
  const out: string[] = [];
  let added = 0;
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const pub = lines[i].match(/^(\s*)datePublished:\s*"([^"]+)"/);
    if (pub) {
      // check next line
      const next = lines[i + 1] || "";
      if (!/dateModified:/.test(next)) {
        // Insert dateModified line with same indentation
        out.push(`${pub[1]}dateModified: "${TODAY}",`);
        added++;
      }
    }
  }
  writeFileSync(f, out.join("\n"));
  console.log(`${f}: +${added} dateModified`);
}
