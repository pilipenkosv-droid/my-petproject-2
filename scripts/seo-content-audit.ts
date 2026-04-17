/**
 * SEO content audit — скорит каждый блог-пост по Google-friendly паттернам.
 *
 * Критерии (по SERP-анализу и Google Suggest harvest):
 *  + year (2026 или 2025 в title/description)
 *  + "бесплатно"
 *  + "пример" / "образец" / "шаблон"
 *  + "в ворде" / "в word"
 *  + "скачать"
 *  + description длина 140-160 символов (оптимум для SERP)
 *  + title длина ≤ 70 символов
 *  + keywords ≥ 10 штук
 *  + dateModified указан
 *
 * Usage: npx tsx scripts/seo-content-audit.ts
 * Output: docs/seo-content-audit.md
 */

import { blogPosts } from "../src/lib/blog/posts";
import { writeFileSync } from "fs";
import { resolve } from "path";

type Post = (typeof blogPosts)[number];

type Audit = {
  slug: string;
  title: string;
  score: number;
  titleLen: number;
  descLen: number;
  keywordCount: number;
  hasYear: boolean;
  hasFree: boolean;
  hasExample: boolean;
  hasWord: boolean;
  hasDownload: boolean;
  hasDateModified: boolean;
  issues: string[];
};

function auditPost(p: Post): Audit {
  const t = p.title.toLowerCase();
  const d = p.description.toLowerCase();
  const hay = t + " " + d;

  const hasYear = /\b(2025|2026|2027)\b/.test(hay);
  const hasFree = /\bбесплатн/.test(hay);
  const hasExample = /пример|образец|шаблон/.test(hay);
  const hasWord = /\bв\s+ворд|\bв\s+word|ворде/.test(hay);
  const hasDownload = /скачать|загрузить/.test(hay);
  const hasDateModified = !!p.dateModified;

  const titleLen = p.title.length;
  const descLen = p.description.length;
  const keywordCount = (p.keywords || []).length;

  const issues: string[] = [];
  if (!hasYear) issues.push("без года в title/description");
  if (titleLen > 70) issues.push(`title ${titleLen} > 70 симв (обрезается в SERP)`);
  if (descLen < 120) issues.push(`description ${descLen} симв (слишком коротко)`);
  if (descLen > 180) issues.push(`description ${descLen} симв (обрезается в SERP)`);
  if (keywordCount < 10) issues.push(`keywords ${keywordCount} < 10`);
  if (!hasDateModified) issues.push("нет dateModified — Google не видит свежесть");
  if (!hasFree && !/\bpro\b|pro\s+plus|платн/i.test(hay)) issues.push("нет 'бесплатно'");
  if (!hasExample) issues.push("нет 'пример/образец/шаблон'");

  // score
  let score = 0;
  score += hasYear ? 20 : 0;
  score += titleLen <= 70 ? 15 : 5;
  score += descLen >= 120 && descLen <= 180 ? 15 : 5;
  score += keywordCount >= 10 ? 15 : 5;
  score += hasDateModified ? 10 : 0;
  score += hasFree ? 10 : 0;
  score += hasExample ? 10 : 0;
  score += hasDownload ? 5 : 0;

  return {
    slug: p.slug,
    title: p.title,
    score,
    titleLen,
    descLen,
    keywordCount,
    hasYear,
    hasFree,
    hasExample,
    hasWord,
    hasDownload,
    hasDateModified,
    issues,
  };
}

const audits = blogPosts.map(auditPost).sort((a, b) => a.score - b.score);

const lines: string[] = [
  "# SEO content audit — блог-посты Diplox",
  "",
  `Дата: ${new Date().toISOString().slice(0, 10)}`,
  `Всего постов: ${audits.length}`,
  "",
  "## Scoring",
  "",
  "Max 100. Критерии: year (20), title length ≤70 (15), desc length 120-180 (15), keywords ≥10 (15), dateModified (10), бесплатно (10), пример/образец (10), скачать (5).",
  "",
  "## Сводка",
  "",
  `- **Отличные (≥80):** ${audits.filter((a) => a.score >= 80).length}`,
  `- **Хорошие (60-79):** ${audits.filter((a) => a.score >= 60 && a.score < 80).length}`,
  `- **Слабые (40-59):** ${audits.filter((a) => a.score >= 40 && a.score < 60).length}`,
  `- **Плохие (<40):** ${audits.filter((a) => a.score < 40).length}`,
  "",
  "### Распределение признаков",
  `- С годом (2025/2026): ${audits.filter((a) => a.hasYear).length}/${audits.length}`,
  `- С "бесплатно": ${audits.filter((a) => a.hasFree).length}/${audits.length}`,
  `- С "пример/образец/шаблон": ${audits.filter((a) => a.hasExample).length}/${audits.length}`,
  `- С "в ворде/word": ${audits.filter((a) => a.hasWord).length}/${audits.length}`,
  `- С "скачать": ${audits.filter((a) => a.hasDownload).length}/${audits.length}`,
  `- С dateModified: ${audits.filter((a) => a.hasDateModified).length}/${audits.length}`,
  "",
  "## Топ-20 постов для срочной правки (score ↑)",
  "",
  "| Score | Slug | Issues |",
  "|---:|---|---|",
  ...audits.slice(0, 20).map((a) => `| ${a.score} | \`${a.slug}\` | ${a.issues.join("; ")} |`),
  "",
  "## Полный список",
  "",
];
for (const a of audits) {
  lines.push(`### \`${a.slug}\` — score ${a.score}`);
  lines.push(`**Title (${a.titleLen}):** ${a.title}`);
  lines.push(`**Keywords:** ${a.keywordCount}`);
  if (a.issues.length) lines.push(`**Issues:** ${a.issues.join("; ")}`);
  lines.push("");
}

const out = resolve(process.cwd(), "docs/seo-content-audit.md");
writeFileSync(out, lines.join("\n"));
console.log(`Audited ${audits.length} posts.`);
console.log(`Avg score: ${(audits.reduce((s, a) => s + a.score, 0) / audits.length).toFixed(1)}`);
console.log(`\nTop-10 weakest:`);
audits.slice(0, 10).forEach((a) => console.log(`  ${a.score}  ${a.slug}`));
console.log(`\nSaved: ${out}`);
