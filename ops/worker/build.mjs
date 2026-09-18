/**
 * Сборка воркера: esbuild складывает main.ts и child.ts в самодостаточные
 * ESM-бандлы. Сервер не собирает ничего сам — npm ci на 2 vCPU уходит в своп.
 */

import { execSync } from "child_process";
import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  } catch {
    return "unknown";
  }
}

// Часть зависимостей (mammoth, pdf-parse, xml2js, jszip) — CJS и ждёт require,
// __dirname и __filename, которых в ESM нет.
const banner = `import { createRequire } from "module";
import { fileURLToPath as __fileURLToPath } from "url";
import { dirname as __dirname_of } from "path";
const require = createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_of(__filename);`;

await build({
  entryPoints: [
    path.join(root, "ops/worker/main.ts"),
    path.join(root, "ops/worker/child.ts"),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outdir: path.join(root, "ops/worker/dist"),
  outExtension: { ".js": ".mjs" },
  alias: { "@": path.join(root, "src") },
  define: { "process.env.WORKER_GIT_SHA": JSON.stringify(gitSha()) },
  banner: { js: banner },
  logLevel: "info",
});
