/**
 * Добавляет к keywords каждого поста релевантные фразы из Wordstat (Yandex seeds),
 * которых ещё нет в списке.
 *
 * Usage: npx tsx scripts/yandex-keyword-extend.ts
 * Output: docs/yandex-keyword-suggestions.md (ручная сверка)
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { blogPosts } from "../src/lib/blog/posts";

const wordstat = JSON.parse(
  readFileSync(resolve(process.cwd(), "docs/wordstat-raw-data.json"), "utf-8")
) as { query: string; wordstat: number }[];

const tokens: Record<string, string[]> = {
  // post-token-category: yandex phrases that should be considered
  "аннотац": [
    "аннотация к курсовой",
    "аннотация к диплому",
    "как написать аннотацию",
    "аннотация пример",
  ],
  "план": [
    "план курсовой работы",
    "план дипломной работы",
    "содержание дипломной работы",
  ],
  "литератур|источник": [
    "подбор литературы для курсовой",
    "список литературы по ГОСТ",
    "научные источники для диплома",
  ],
  "рерайт|перефраз|уникальн": [
    "рерайт текста онлайн",
    "перефразировать текст",
    "повысить уникальность текста",
    "повысить антиплагиат",
  ],
  "орфограф|грамматик|пунктуац": [
    "проверка орфографии онлайн",
    "проверка пунктуации онлайн",
    "проверить текст на ошибки",
  ],
  "краткое|пересказ|summary": [
    "краткое содержание текста",
    "пересказ текста онлайн",
  ],
  "бот|telegram|телеграм|second-brain|ai-бот": [
    "нейросеть для учёбы",
    "нейросеть для студентов",
    "ChatGPT для студентов",
    "телеграм бот для учёбы",
  ],
  "экзамен|подготов": [
    "подготовка к экзаменам",
    "нейросеть для решения задач",
  ],
  "антиплагиат|уникальн": [
    "повысить антиплагиат",
    "повысить уникальность текста",
  ],
};

type Suggestion = { slug: string; title: string; current: string[]; toAdd: string[] };
const suggestions: Suggestion[] = [];

for (const p of blogPosts) {
  const hay = (p.title + " " + (p.keywords || []).join(" ") + " " + p.slug).toLowerCase();
  const currentKeywords = new Set((p.keywords || []).map((k) => k.toLowerCase()));
  const toAdd: string[] = [];

  for (const [tokenPattern, phrases] of Object.entries(tokens)) {
    if (new RegExp(tokenPattern, "i").test(hay)) {
      for (const ph of phrases) {
        if (!currentKeywords.has(ph.toLowerCase())) {
          // Check wordstat volume
          const w = wordstat.find((x) => x.query.toLowerCase() === ph.toLowerCase());
          if (w && w.wordstat > 500) {
            toAdd.push(`${ph} (${w.wordstat}/мес)`);
          } else if (!w) {
            toAdd.push(ph);
          }
        }
      }
    }
  }

  if (toAdd.length > 0) {
    suggestions.push({ slug: p.slug, title: p.title, current: p.keywords || [], toAdd });
  }
}

const lines: string[] = [
  "# Yandex keyword extension suggestions",
  "",
  `Дата: ${new Date().toISOString().slice(0, 10)}`,
  `Постов с предложениями: ${suggestions.length}/${blogPosts.length}`,
  "",
  "## Рекомендуемые дополнения",
  "",
];

for (const s of suggestions) {
  lines.push(`### \`${s.slug}\``);
  lines.push(`**${s.title}**`);
  lines.push(`**Текущих keywords:** ${s.current.length}`);
  lines.push(`**Добавить:** ${s.toAdd.join(", ")}`);
  lines.push("");
}

const out = resolve(process.cwd(), "docs/yandex-keyword-suggestions.md");
writeFileSync(out, lines.join("\n"));
console.log(`Suggested additions for ${suggestions.length} posts.`);
console.log(`Saved: ${out}`);
