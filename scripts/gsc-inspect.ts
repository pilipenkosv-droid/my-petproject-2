/**
 * GSC URL Inspection API — get real Google index status for all sitemap URLs.
 *
 * Usage: npx tsx scripts/gsc-inspect.ts
 * Output: docs/gsc-inspect.json
 *
 * Rate: ~2000/day per property. We have ~85 URLs so fine.
 */

import { GoogleAuth } from "google-auth-library";
import { resolve } from "path";
import { writeFileSync } from "fs";

const SERVICE_ACCOUNT_PATH = resolve(process.env.HOME || "~", ".config/indexing-api/service-account.json");
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const SITE_URL = "sc-domain:diplox.online";
const SITEMAP_URL = "https://diplox.online/sitemap.xml";
const API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

async function getToken() {
  const auth = new GoogleAuth({ keyFile: SERVICE_ACCOUNT_PATH, scopes: SCOPES });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("No access token");
  return t.token;
}

async function inspect(token: string, url: string) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL, languageCode: "ru-RU" }),
  });
  const data = await res.json();
  if (!res.ok) return { url, error: data.error?.message || res.statusText };
  const r = data.inspectionResult?.indexStatusResult || {};
  return {
    url,
    verdict: r.verdict,
    coverageState: r.coverageState,
    robotsTxtState: r.robotsTxtState,
    indexingState: r.indexingState,
    lastCrawlTime: r.lastCrawlTime,
    pageFetchState: r.pageFetchState,
    googleCanonical: r.googleCanonical,
    userCanonical: r.userCanonical,
    crawledAs: r.crawledAs,
    referringUrls: r.referringUrls?.length || 0,
    sitemap: r.sitemap,
  };
}

async function fetchSitemapUrls(): Promise<string[]> {
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
  const urls = await fetchSitemapUrls();
  console.log(`Inspecting ${urls.length} URLs...\n`);

  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const r = await inspect(token, url);
    results.push(r);
    const v = (r as any).verdict || (r as any).error || "?";
    const cov = (r as any).coverageState || "";
    console.log(`[${i + 1}/${urls.length}] ${v.padEnd(8)} | ${cov.slice(0, 40).padEnd(40)} | ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }

  const outPath = resolve(process.cwd(), "docs/gsc-inspect.json");
  writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), count: results.length, results }, null, 2));

  // Summary
  const by = (key: string) => {
    const m: Record<string, number> = {};
    for (const r of results) {
      const v = (r as any)[key] || "UNKNOWN";
      m[v] = (m[v] || 0) + 1;
    }
    return m;
  };
  console.log("\n=== Summary ===");
  console.log("verdict:", by("verdict"));
  console.log("coverageState:", by("coverageState"));
  console.log("indexingState:", by("indexingState"));
  console.log("robotsTxtState:", by("robotsTxtState"));
  console.log(`\nSaved: ${outPath}`);
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
