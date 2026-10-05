// 把 plugin/ 打包成 dist/openfun-chat-plugin.zip（Customize > Plugins 上傳用的聊天指引 plugin）。
// 只封裝 allowlist 中的檔案；ZIP 根目錄即 plugin 根目錄（.claude-plugin/plugin.json 在最上層）。
// 固定時間戳與檔案順序，相同輸入產生相同 ZIP。
import { zipSync } from "fflate";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = join(root, "plugin");
const outFile = join(root, "dist", "openfun-chat-plugin.zip");

export const PLUGIN_FILES = [
  ".claude-plugin/plugin.json",
  "skills/openfun-data/SKILL.md",
  "README.md",
  "LICENSE",
];

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
if (manifest.version !== pkg.version) {
  throw new Error(`plugin.json version ${manifest.version} 與 package.json ${pkg.version} 不一致`);
}
for (const forbidden of ["mcpServers", "userConfig", "lspServers"]) {
  if (forbidden in manifest) throw new Error(`plugin.json 不可包含 ${forbidden}（聊天指引 plugin 不啟動本機 MCP）`);
}

const mtime = new Date("2026-01-01T00:00:00Z");
const entries = {};
for (const rel of PLUGIN_FILES) {
  const abs = join(pluginDir, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`缺少 plugin 檔案：${rel}`);
  entries[rel] = [new Uint8Array(readFileSync(abs)), { mtime, level: 9 }];
}
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, zipSync(entries));
console.log(`聊天指引 plugin：${outFile}（${(statSync(outFile).size / 1024).toFixed(1)} KB，${PLUGIN_FILES.length} 個檔案）`);
