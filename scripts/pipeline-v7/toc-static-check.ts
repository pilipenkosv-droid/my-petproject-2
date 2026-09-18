/**
 * Локальная проверка статического TOC (ADR-016, B3).
 *
 * Берёт синтетический корпусный документ, снимает его собственную строку
 * «СОДЕРЖАНИЕ» и добивает текстом (иначе aux-гарды не вставят поле), гоняет
 * v7, заполняет поле через fillTocStatic и печатает строки содержания плюс
 * текст второй страницы повторного рендера.
 *
 * Usage: npx tsx scripts/pipeline-v7/toc-static-check.ts [in.docx]
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { runPipelineV7 } from "../../src/lib/pipeline-v7/orchestrator";
import { fillTocStatic, hasSoffice } from "../../src/lib/pipeline-v7/aux/toc-static";

const OUT_DIR = "/tmp/v7-toc";
const P_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;

/** Документ без своей строки «СОДЕРЖАНИЕ» и с телом, которого хватит гардам. */
async function prepareSource(inPath: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(fs.readFileSync(inPath));
  let xml = await zip.file("word/document.xml")!.async("string");
  xml = xml.replace(
    /<w:p\b(?:(?!<\/w:p>)[\s\S])*?(?:СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ)(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g,
    ""
  );
  const paras = xml.match(P_RE) ?? [];
  const filler = paras.filter((p) => /<w:t/.test(p) && !/sectPr/.test(p)).slice(-6);
  const anchor = paras[paras.length - 1];
  xml = xml.replace(anchor, filler.join("") + filler.join("") + anchor);
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function tocLines(xml: string): string[] {
  const from = xml.indexOf("_dpx_aux_toc_1");
  return (xml.slice(from).match(P_RE) ?? [])
    .slice(0, 40)
    .filter((p) => p.includes("<w:tab/>"))
    .map((p) =>
      Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g))
        .map((m) => m[1])
        .join(" … ")
    );
}

async function main() {
  const inPath = process.argv[2] ?? "data/corpus/synthetic/05-multi-section.docx";
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("soffice+pdftotext:", hasSoffice());

  const source = await prepareSource(inPath);
  const result = await runPipelineV7(source, { documentId: "toc-static-check" });
  console.log("v7: гейт", result.report.gate.pass, "| поле TOC", result.report.aux.tocInserted);
  if (!result.output) throw new Error("v7 не вернул документ");

  const started = Date.now();
  const filledResult = await fillTocStatic(result.output);
  console.log(
    `fillTocStatic: filled=${filledResult.filled} skipped=${filledResult.skipped ?? "-"} ` +
      `ms=${Date.now() - started}`
  );

  const outPath = path.join(OUT_DIR, "out.docx");
  fs.writeFileSync(outPath, filledResult.output);
  const outXml = await (await JSZip.loadAsync(filledResult.output)).file("word/document.xml")!.async("string");
  console.log("--- строки содержания ---");
  for (const line of tocLines(outXml)) console.log(" ", line);

  // Повторный рендер: если LibreOffice открывает файл без починки — структура цела.
  execSync(
    `soffice --headless --norestore --convert-to 'pdf:writer_pdf_Export:UpdateFields=false' "${outPath}" --outdir "${OUT_DIR}"`,
    { stdio: "pipe" }
  );
  const pages = execSync(`pdftotext -layout "${path.join(OUT_DIR, "out.pdf")}" -`).toString().split("\f");
  console.log(`--- страница 2 из ${pages.length} ---`);
  console.log(pages[1]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
