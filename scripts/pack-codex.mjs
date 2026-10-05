// 驗證 build/codex-plugin 並打包成 dist/openfun-codex-plugin.zip。
// ZIP 根目錄即 plugin 根目錄，同時也是 marketplace 根目錄（.agents/plugins/marketplace.json 的 source.path 為 ./）。
// 只封裝 allowlist；暫存目錄出現未列出的檔案時直接失敗。檔案排序、時間戳固定，保存 Unix 權限。
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCodexPlugin } from "./validate-codex-plugin.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, "build", "codex-plugin");
const outFile = join(root, "dist", "openfun-codex-plugin.zip");

export const CODEX_PLUGIN_FILES = [
  ".agents/plugins/marketplace.json",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_LICENSES.md",
  "assets/icon.png",
  "mcp.json",
  "plugin.json",
  "server/index.mjs",
  "setup.mjs",
  "skills/openfun-data/SKILL.md",
];

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return listFiles(p);
    if (!e.isFile()) throw new Error(`plugin 不可包含檔案以外的項目：${relative(stage, p)}`);
    return [relative(stage, p).split(sep).join("/")];
  });
}

const r = validateCodexPlugin(stage);
if (!r.ok) {
  console.error("Codex plugin 驗證失敗，未打包：");
  for (const e of r.errors) console.error(`  - ${e}`);
  process.exit(1);
}
const present = listFiles(stage).sort();
const expected = [...CODEX_PLUGIN_FILES].sort();
if (JSON.stringify(present) !== JSON.stringify(expected)) {
  throw new Error(`build/codex-plugin 內容與 allowlist 不符：\n實際：${present.join(", ")}\n預期：${expected.join(", ")}`);
}

const mtime = new Date("2026-01-01T00:00:00Z");
const entries = {};
for (const rel of expected) {
  const abs = join(stage, rel);
  const mode = statSync(abs).mode & 0o777;
  entries[rel] = [new Uint8Array(readFileSync(abs)), { level: 9, mtime, os: 3, attrs: mode << 16 }];
}
mkdirSync(dirname(outFile), { recursive: true });
rmSync(outFile, { force: true });
const zip = zipSync(entries);
writeFileSync(outFile, zip);
console.log(`Codex plugin：${outFile}（${(zip.length / 1024).toFixed(1)} KB，${expected.length} 個檔案）`);
console.log(`sha256：${createHash("sha256").update(zip).digest("hex")}`);
