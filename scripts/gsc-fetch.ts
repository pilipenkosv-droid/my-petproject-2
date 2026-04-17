/**
 * Google Search Console data fetch.
 *
 * Usage:
 *   npx tsx scripts/gsc-fetch.ts [days=28]
 *
 * Dumps queries, pages, country, device breakdowns for the last N days.
 * Output: docs/gsc-data.json
 */

import { GoogleAuth } from "google-auth-library";
import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

const SERVICE_ACCOUNT_PATH = resolve(
  process.env.HOME || "~",
  ".config/indexing-api/service-account.json"
);

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const SITE_URL = "sc-domain:diplox.online";
const API = "https://searchconsole.googleapis.com/webmasters/v3";

type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function getToken() {
  const auth = new GoogleAuth({ keyFile: SERVICE_ACCOUNT_PATH, scopes: SCOPES });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("No access token");
  return t.token;
}

async function searchAnalytics(token: string, body: object): Promise<Row[]> {
  const url = `${API}/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GSC error: ${JSON.stringify(data)}`);
  return data.rows || [];
}

async function listSites(token: string) {
  const res = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function sitemapInfo(token: string) {
  const res = await fetch(
    `${API}/sites/${encodeURIComponent(SITE_URL)}/sitemaps`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const days = Number(process.argv[2] || 28);
  const startDate = daysAgo(days);
  const endDate = daysAgo(1); // GSC has 1-2 day lag

  const token = await getToken();

  console.log(`GSC: ${SITE_URL}`);
  console.log(`Period: ${startDate} → ${endDate} (${days} days)\n`);

  const sites = await listSites(token);
  console.log("Sites accessible:");
  for (const s of sites.siteEntry || []) {
    console.log(`  ${s.siteUrl}  (${s.permissionLevel})`);
  }
  console.log();

  // Totals (no dimensions)
  const totals = await searchAnalytics(token, { startDate, endDate });
  const total = totals[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  console.log(`TOTAL: clicks=${total.clicks}, impressions=${total.impressions}, ctr=${(total.ctr * 100).toFixed(2)}%, pos=${total.position.toFixed(1)}`);

  // Top queries
  const queries = await searchAnalytics(token, {
    startDate, endDate, dimensions: ["query"], rowLimit: 500,
  });

  // Top pages
  const pages = await searchAnalytics(token, {
    startDate, endDate, dimensions: ["page"], rowLimit: 500,
  });

  // Query × Page (to see which query drives which page)
  const queryPages = await searchAnalytics(token, {
    startDate, endDate, dimensions: ["query", "page"], rowLimit: 1000,
  });

  // Devices
  const devices = await searchAnalytics(token, {
    startDate, endDate, dimensions: ["device"], rowLimit: 10,
  });

  // Countries
  const countries = await searchAnalytics(token, {
    startDate, endDate, dimensions: ["country"], rowLimit: 20,
  });

  // Sitemaps info
  const sitemaps = await sitemapInfo(token);

  const out = {
    period: { startDate, endDate, days },
    total,
    sites: sites.siteEntry || [],
    queries,
    pages,
    queryPages,
    devices,
    countries,
    sitemaps,
    fetchedAt: new Date().toISOString(),
  };

  mkdirSync(resolve(process.cwd(), "docs"), { recursive: true });
  const outPath = resolve(process.cwd(), "docs/gsc-data.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`\nQueries: ${queries.length}`);
  console.log(`Pages: ${pages.length}`);
  console.log(`Q×P: ${queryPages.length}`);
  console.log(`Devices: ${devices.length}`);
  console.log(`Countries: ${countries.length}`);
  console.log(`\nSaved: ${outPath}`);

  console.log(`\nTop 10 queries by clicks:`);
  queries.slice().sort((a, b) => b.clicks - a.clicks).slice(0, 10).forEach((r) => {
    console.log(`  ${r.clicks.toString().padStart(4)} | ${r.impressions.toString().padStart(6)} imp | pos ${r.position.toFixed(1).padStart(5)} | ${r.keys?.[0]}`);
  });

  console.log(`\nTop 10 queries by impressions:`);
  queries.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 10).forEach((r) => {
    console.log(`  ${r.impressions.toString().padStart(6)} imp | ${r.clicks.toString().padStart(3)} clk | pos ${r.position.toFixed(1).padStart(5)} | ${r.keys?.[0]}`);
  });

  console.log(`\nTop 10 pages by clicks:`);
  pages.slice().sort((a, b) => b.clicks - a.clicks).slice(0, 10).forEach((r) => {
    console.log(`  ${r.clicks.toString().padStart(4)} | ${r.impressions.toString().padStart(6)} imp | pos ${r.position.toFixed(1).padStart(5)} | ${r.keys?.[0]}`);
  });
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
