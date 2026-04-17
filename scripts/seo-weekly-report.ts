/**
 * Еженедельный SEO-отчёт: собирает GSC data + индексацию + сравнивает с предыдущей неделей.
 *
 * Usage: npx tsx scripts/seo-weekly-report.ts
 *
 * Output:
 *  - docs/seo-weekly/YYYY-MM-DD.md — снапшот на неделю
 *  - Консоль: diff vs предыдущий снапшот
 *
 * Запускать еженедельно (в воскресенье):
 *  0 10 * * 0  cd /Users/sergejpilipenko/DIplox && npx tsx scripts/seo-weekly-report.ts
 */

import { GoogleAuth } from "google-auth-library";
import { resolve } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";

const SERVICE_ACCOUNT_PATH = resolve(
  process.env.HOME || "~",
  ".config/indexing-api/service-account.json"
);
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const SITE_URL = "sc-domain:diplox.online";
const API = "https://searchconsole.googleapis.com/webmasters/v3";
const INSPECT_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const SITEMAP_URL = "https://diplox.online/sitemap.xml";

async function getToken() {
  const auth = new GoogleAuth({ keyFile: SERVICE_ACCOUNT_PATH, scopes: SCOPES });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("No access token");
  return t.token;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function gscQuery(token: string, body: object) {
  const url = `${API}/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()).rows || [];
}

async function inspect(token: string, url: string) {
  const res = await fetch(INSPECT_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL, languageCode: "ru-RU" }),
  });
  const data = await res.json();
  return data.inspectionResult?.indexStatusResult?.verdict || "?";
}

async function sitemapUrls(): Promise<string[]> {
  const res = await fetch(SITEMAP_URL);
  const xml = await res.text();
  const urls: string[] = [];
  const re = /<loc>(.*?)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) urls.push(m[1]);
  return urls;
}

async function main() {
  const token = await getToken();
  const startDate = daysAgo(8); // prev 7 days, with 1-day lag
  const endDate = daysAgo(1);

  console.log(`GSC weekly report: ${startDate} → ${endDate}`);

  // 1. Totals
  const totals = await gscQuery(token, { startDate, endDate });
  const total = totals[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  // 2. Top queries
  const queries = await gscQuery(token, { startDate, endDate, dimensions: ["query"], rowLimit: 30 });

  // 3. Top pages
  const pages = await gscQuery(token, { startDate, endDate, dimensions: ["page"], rowLimit: 30 });

  // 4. Sample inspection (10 random URLs from sitemap)
  const urls = await sitemapUrls();
  const sampleSize = Math.min(20, urls.length);
  const sample = [...urls].sort(() => Math.random() - 0.5).slice(0, sampleSize);
  const inspections: Record<string, string> = {};
  for (const u of sample) {
    inspections[u] = await inspect(token, u);
    await new Promise((r) => setTimeout(r, 300));
  }
  const indexed = Object.values(inspections).filter((v) => v === "PASS").length;
  const indexRate = (indexed / sampleSize) * 100;

  // 5. Build snapshot
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    period: { startDate, endDate },
    total,
    topQueries: queries.slice(0, 20),
    topPages: pages.slice(0, 20),
    indexRate: { sampled: sampleSize, indexed, percent: indexRate },
    sitemapSize: urls.length,
  };

  // 6. Save
  const dir = resolve(process.cwd(), "docs/seo-weekly");
  mkdirSync(dir, { recursive: true });
  const fname = `${endDate}.json`;
  const fpath = resolve(dir, fname);
  writeFileSync(fpath, JSON.stringify(snapshot, null, 2));

  // 7. Compare with previous snapshot
  const prevFiles = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== fname)
    .sort()
    .slice(-1);

  let diffLines: string[] = [];
  if (prevFiles.length > 0) {
    const prev = JSON.parse(readFileSync(resolve(dir, prevFiles[0]), "utf-8"));
    const deltaClicks = total.clicks - prev.total.clicks;
    const deltaImp = total.impressions - prev.total.impressions;
    const deltaPos = total.position - prev.total.position;
    const deltaIndex = indexRate - prev.indexRate.percent;
    diffLines = [
      `## Изменения vs ${prev.period.endDate}`,
      "",
      `- **Clicks:** ${prev.total.clicks} → ${total.clicks} (${deltaClicks > 0 ? "+" : ""}${deltaClicks})`,
      `- **Impressions:** ${prev.total.impressions} → ${total.impressions} (${deltaImp > 0 ? "+" : ""}${deltaImp})`,
      `- **Avg position:** ${prev.total.position.toFixed(1)} → ${total.position.toFixed(1)} (${deltaPos > 0 ? "+" : ""}${deltaPos.toFixed(1)})`,
      `- **Index rate:** ${prev.indexRate.percent.toFixed(1)}% → ${indexRate.toFixed(1)}% (${deltaIndex > 0 ? "+" : ""}${deltaIndex.toFixed(1)}%)`,
      "",
    ];
  }

  // 8. Markdown report
  const md: string[] = [
    `# SEO weekly report — ${endDate}`,
    "",
    `Period: ${startDate} → ${endDate} (7 days)`,
    "",
    ...diffLines,
    `## Totals`,
    "",
    `- Clicks: **${total.clicks}**`,
    `- Impressions: **${total.impressions}**`,
    `- CTR: **${(total.ctr * 100).toFixed(2)}%**`,
    `- Avg position: **${total.position.toFixed(1)}**`,
    `- Index rate (sample ${sampleSize}): **${indexRate.toFixed(1)}%** (${indexed}/${sampleSize})`,
    `- Sitemap URLs: ${urls.length}`,
    "",
    `## Топ-10 запросов (impressions)`,
    "",
    `| Query | Imp | Clk | Pos |`,
    `|---|---:|---:|---:|`,
    ...queries
      .slice()
      .sort((a: any, b: any) => b.impressions - a.impressions)
      .slice(0, 10)
      .map(
        (r: any) =>
          `| \`${r.keys[0].slice(0, 60)}\` | ${r.impressions} | ${r.clicks} | ${r.position.toFixed(1)} |`
      ),
    "",
    `## Топ-10 страниц`,
    "",
    `| Page | Imp | Clk | Pos |`,
    `|---|---:|---:|---:|`,
    ...pages
      .slice()
      .sort((a: any, b: any) => b.clicks - a.clicks)
      .slice(0, 10)
      .map((r: any) => {
        const path = r.keys[0].replace("https://diplox.online", "");
        return `| \`${path.slice(0, 60)}\` | ${r.impressions} | ${r.clicks} | ${r.position.toFixed(1)} |`;
      }),
    "",
  ];
  const mdPath = resolve(dir, `${endDate}.md`);
  writeFileSync(mdPath, md.join("\n"));

  // Console summary
  console.log("\n" + md.join("\n"));
  console.log(`\nSaved: ${mdPath}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
