// 驗證 build/bundle 並打包成 dist/openfun-claude-extension.mcpb（取代 `mcpb validate/pack/info`）。
// MCPB 是 ZIP：根目錄為 manifest.json。與官方 CLI 相同使用 fflate、壓縮等級 9，並保存 Unix 檔案權限；
// 檔案依路徑排序、時間戳固定，相同輸入產生相同檔案。本工具不提供簽章（產物為未簽章 MCPB）。
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "./validate-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "build", "bundle");
const outFile = join(root, "dist", "openfun-claude-extension.mcpb");
// 這些不應出現在安裝包中；出現代表暫存目錄被汙染，直接失敗而不是默默略過
const FORBIDDEN = [/(^|\/)node_modules(\/|$)/, /(^|\/)\.env/, /\.map$/, /\.mcpb$/, /(^|\/)\.git(\/|$)/, /\.log$/];

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return listFiles(p);
    if (!e.isFile()) throw new Error(`安裝包不可包含檔案以外的項目：${relative(bundle, p)}`);
    return [p];
  });
}

const result = validateManifest(join(bundle, "manifest.json"), { checkEntryPoint: true });
if (!result.ok) {
  console.error("manifest 驗證失敗，未打包：");
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}

const mtime = new Date("2026-01-01T00:00:00Z");
const files = listFiles(bundle)
  .map((abs) => ({ abs, rel: relative(bundle, abs).split(sep).join("/") }))
  .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
const entries = {};
let unpacked = 0;
for (const { abs, rel } of files) {
  const bad = FORBIDDEN.find((re) => re.test(rel));
  if (bad) throw new Error(`安裝包不可包含 ${rel}`);
  const data = new Uint8Array(readFileSync(abs));
  unpacked += data.length;
  const mode = statSync(abs).mode & 0o777;
  entries[rel] = [data, { level: 9, mtime, os: 3, attrs: mode << 16 }];
}

mkdirSync(dirname(outFile), { recursive: true });
rmSync(outFile, { force: true });
const zip = zipSync(entries);
writeFileSync(outFile, zip);

const { name, version } = result.manifest;
console.log(`📦 ${name}@${version}（manifest 已通過官方 schema v0.3 驗證）`);
for (const { rel } of files) console.log(`  ${String(entries[rel][0].length).padStart(9)}  ${rel}`);
console.log(`檔案數：${files.length}；解壓後 ${(unpacked / 1024).toFixed(1)} KB；未簽章`);
console.log(`sha256：${createHash("sha256").update(zip).digest("hex")}`);
console.log(`安裝包：${outFile}（${(zip.length / 1024).toFixed(1)} KB）`);
