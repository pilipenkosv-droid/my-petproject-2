import mammoth from "mammoth";
import * as fs from "fs";

(async () => {
  const buf = fs.readFileSync(process.argv[2]);
  const r = await (mammoth as unknown as { convertToMarkdown: (i: { buffer: Buffer }) => Promise<{ value: string }> })
    .convertToMarkdown({ buffer: buf });
  const md = r.value;
  console.log("md bytes:", md.length);
  console.log("has <table:", (md.match(/<table/g) ?? []).length);
  console.log("pipe lines:", md.split("\n").filter((l) => l.trim().startsWith("|")).length);
  const idx = md.search(/Таблица|<table|^\|/m);
  if (idx >= 0) console.log("sample at", idx, ":", md.slice(idx, idx + 500));
})();
