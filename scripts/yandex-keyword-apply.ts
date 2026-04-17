/**
 * Применяет yandex-keyword-extend предложения к постам — осторожно и детерминированно.
 * Правило: только высоко-релевантные token-phrase пары (точное совпадение темы).
 *
 * Usage: npx tsx scripts/yandex-keyword-apply.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Tokens → phrases, только с высоким Wordstat (≥2000/мес)
const TOKEN_PHRASES: Record<string, string[]> = {
  "аннотац": ["аннотация к курсовой", "аннотация к диплому", "как написать аннотацию"],
  "план.*курсов": ["план курсовой работы"],
  "план.*диплом": ["план дипломной работы", "содержание дипломной работы"],
  "рерайт|перефраз": ["рерайт текста онлайн", "перефразировать текст"],
  "уникальн|антиплагиат": ["повысить уникальность текста", "повысить антиплагиат"],
  "орфограф": ["проверка орфографии онлайн"],
  "пунктуац": ["проверка пунктуации онлайн"],
  "краткое|пересказ|аннотац": ["краткое содержание текста"],
  "бот|telegram|телеграм": ["нейросеть для учёбы", "нейросеть для студентов"],
  "экзамен": ["подготовка к экзаменам"],
  "ChatGPT|чат.*gpt": ["ChatGPT для студентов"],
};

const files = [
  resolve(process.cwd(), "src/lib/blog/posts-gost.ts"),
  resolve(process.cwd(), "src/lib/blog/posts-second-brain.ts"),
];

let totalAdded = 0;
let postsTouched = 0;

for (const f of files) {
  let content = readFileSync(f, "utf-8");

  // Match each post block: { ... slug: "..." ... keywords: [...] ... }
  const postRegex = /(\{[\s\S]*?slug:\s*"([^"]+)"[\s\S]*?keywords:\s*\[)([\s\S]*?)(\],)/g;

  content = content.replace(postRegex, (m, pre, slug, kwBody, post) => {
    const kwLines = kwBody.split("\n");
    // Extract existing keywords lower-cased
    const existing = new Set<string>();
    for (const line of kwLines) {
      const mm = line.match(/"([^"]+)"/);
      if (mm) existing.add(mm[1].toLowerCase());
    }

    // Build haystack (title + keywords + slug)
    const titleMatch = pre.match(/title:\s*"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : "";
    const hay = (title + " " + Array.from(existing).join(" ") + " " + slug).toLowerCase();

    const toAdd: string[] = [];
    for (const [pattern, phrases] of Object.entries(TOKEN_PHRASES)) {
      if (new RegExp(pattern, "i").test(hay)) {
        for (const ph of phrases) {
          if (!existing.has(ph.toLowerCase())) {
            toAdd.push(ph);
            existing.add(ph.toLowerCase());
          }
        }
      }
    }

    if (toAdd.length === 0) return m;

    // Insert new keywords as lines before `],`. Find indentation from last non-empty line
    const lastLine = kwLines.filter((l: string) => l.trim()).pop() || '      ""';
    const indent = (lastLine.match(/^(\s*)/) || ["", "      "])[1];
    const newLines = toAdd.map((k) => `${indent}"${k}",`).join("\n");
    const newBody = kwBody.replace(/(\s*)$/, `\n${newLines}$1`);

    totalAdded += toAdd.length;
    postsTouched++;
    return pre + newBody + post;
  });

  writeFileSync(f, content);
  console.log(`${f}: processed`);
}

console.log(`\nTotal: +${totalAdded} keywords across ${postsTouched} posts`);
