/**
 * Harvest Google autocomplete suggestions for seed queries.
 * Public suggestqueries.google.com endpoint — no auth needed.
 *
 * Usage: npx tsx scripts/google-suggest.ts
 * Output: docs/google-suggest.json + console markdown
 */

import { writeFileSync } from "fs";
import { resolve } from "path";

const SEEDS = [
  // GOST / formatting
  "оформление диплома",
  "оформление курсовой",
  "оформление реферата",
  "оформление по гост",
  "гост оформление диплома",
  "гост 7.32",
  "гост р 7.0.11",
  "шаблон диплома",
  "образец курсовой",
  "титульный лист",
  "список литературы",
  // AI / tools
  "нейросеть для курсовой",
  "нейросеть для диплома",
  "нейросеть для учебы",
  "ai для студентов",
  "chatgpt для курсовой",
  // Rewrite / uniqueness
  "рерайт онлайн",
  "перефразировать текст",
  "повысить уникальность",
  "повысить антиплагиат",
  "обойти антиплагиат",
  // Grammar
  "проверка орфографии",
  "проверка пунктуации",
  "проверить текст на ошибки",
  // Plan / summary
  "план курсовой",
  "план диплома",
  "содержание диплома",
  "аннотация к курсовой",
  "краткое содержание",
  // Sources
  "подбор литературы",
  "научные источники",
  // How-to
  "как написать диплом",
  "как написать курсовую",
  "как написать реферат",
  "как оформить диплом",
  "как оформить курсовую",
];

async function suggest(q: string): Promise<string[]> {
  // Google Suggest returns windows-1251 — decode manually
  const url = `https://www.google.com/complete/search?client=chrome&hl=ru&gl=ru&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const decoder = new TextDecoder("windows-1251");
    const text = decoder.decode(buf);
    const data = JSON.parse(text);
    return (data[1] || []) as string[];
  } catch {
    return [];
  }
}

async function main() {
  const all: Record<string, string[]> = {};
  const flat: Set<string> = new Set();

  for (const s of SEEDS) {
    const sug = await suggest(s);
    all[s] = sug;
    sug.forEach((x) => flat.add(x));
    console.log(`[${sug.length}] ${s}`);
    // Rate limit politeness
    await new Promise((r) => setTimeout(r, 200));
  }

  const outPath = resolve(process.cwd(), "docs/google-suggest.json");
  writeFileSync(
    outPath,
    JSON.stringify({ fetchedAt: new Date().toISOString(), seeds: SEEDS.length, suggestions: all, flat: Array.from(flat).sort() }, null, 2)
  );

  console.log(`\nTotal unique suggestions: ${flat.size}`);
  console.log(`Saved: ${outPath}`);

  // Markdown summary
  const mdPath = resolve(process.cwd(), "docs/google-suggest.md");
  const lines: string[] = ["# Google autocomplete — собранная семантика", "", `Дата: ${new Date().toISOString().slice(0, 10)}`, "", "## По группам", ""];
  for (const s of SEEDS) {
    lines.push(`### ${s}`);
    for (const x of all[s]) lines.push(`- ${x}`);
    lines.push("");
  }
  writeFileSync(mdPath, lines.join("\n"));
  console.log(`Saved: ${mdPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
