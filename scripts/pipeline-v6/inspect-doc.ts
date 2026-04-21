import { extractDocument } from "../../src/lib/pipeline-v6/extractor/mammoth-extractor";
import * as fs from "fs";

const file = process.argv[2];
if (!file) throw new Error("usage: inspect-doc <path>");
const t0 = Date.now();
extractDocument(fs.readFileSync(file)).then(r => {
  console.log("extract ms:", Date.now() - t0);
  console.log("md bytes:", r.markdown.length);
  console.log("tables:", r.assets.tables.length);
  console.log("images:", r.assets.images.length);
  const lines = r.markdown.split("\n");
  console.log("h1:", lines.filter((l: string) => /^# /.test(l)).length);
  console.log("h2:", lines.filter((l: string) => /^## /.test(l)).length);
  console.log("h3:", lines.filter((l: string) => /^### /.test(l)).length);
  console.log("stats:", r.statistics);
});
