// 打包伺服器為單一檔案，建立 MCPB 暫存目錄 build/bundle/ 與 Codex plugin 暫存目錄 build/codex-plugin/。
// 產物不需要 node_modules：所有執行期依賴都由 esbuild 內嵌。兩者使用同一份 server/index.mjs。
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "build", "bundle");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "server"), { recursive: true });

const result = await build({
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(out, "server", "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
  banner: {
    js: 'import { createRequire as __openfunCreateRequire } from "node:module"; const require = __openfunCreateRequire(import.meta.url);',
  },
});

// 依 metafile 收集實際內嵌的第三方套件授權
const pkgs = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
  if (!m) continue;
  const rel = m.join("").replace(/\/$/, "");
  const dir = join(root, rel);
  const name = m[m.length - 1].replace(/^node_modules\//, "").replace(/\/$/, "");
  if (!pkgs.has(dir)) pkgs.set(dir, name);
}
const sections = [];
for (const [dir, name] of [...pkgs].sort((a, b) => a[1].localeCompare(b[1]))) {
  const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const licFile = ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "LICENCE"].map((f) => join(dir, f)).find(existsSync);
  const text = licFile ? readFileSync(licFile, "utf8").trim() : `(套件未附 LICENSE 檔；package.json license: ${pj.license ?? "未標示"})`;
  sections.push(`## ${pj.name}@${pj.version} — ${pj.license ?? "unknown"}\n\n${text}`);
}
writeFileSync(
  join(out, "THIRD_PARTY_LICENSES.md"),
  `# 內嵌於 server/index.mjs 的第三方套件授權\n\n${sections.join("\n\n---\n\n")}\n`,
);

for (const f of ["manifest.json", "icon.png", "LICENSE"]) cpSync(join(root, f), join(out, f));
cpSync(join(root, "docs", "BUNDLE_README.md"), join(out, "README.md"));
console.log(`build/bundle 完成：內嵌 ${pkgs.size} 個第三方套件`);

// ---------- Codex plugin ----------
const codexOut = join(root, "build", "codex-plugin");
rmSync(codexOut, { recursive: true, force: true });
mkdirSync(join(codexOut, "server"), { recursive: true });
const setup = await build({
  entryPoints: [join(root, "src", "codex-setup-cli.ts")],
  outfile: join(codexOut, "setup.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
});
const setupThirdParty = Object.keys(setup.metafile.inputs).filter((i) => i.includes("node_modules/"));
if (setupThirdParty.length) throw new Error(`setup.mjs 不應內嵌第三方套件：${setupThirdParty.join(", ")}`);

// 檔案逐一列出；codex/ 目錄中未列出的檔案不會進入產物
const CODEX_STATIC = [
  "plugin.json",
  "mcp.json",
  ".agents/plugins/marketplace.json",
  "skills/openfun-data/SKILL.md",
  "README.md",
];
for (const rel of CODEX_STATIC) {
  mkdirSync(dirname(join(codexOut, rel)), { recursive: true });
  cpSync(join(root, "codex", rel), join(codexOut, rel));
}
cpSync(join(out, "server", "index.mjs"), join(codexOut, "server", "index.mjs"));
cpSync(join(out, "THIRD_PARTY_LICENSES.md"), join(codexOut, "THIRD_PARTY_LICENSES.md"));
cpSync(join(root, "LICENSE"), join(codexOut, "LICENSE"));
mkdirSync(join(codexOut, "assets"), { recursive: true });
cpSync(join(root, "icon.png"), join(codexOut, "assets", "icon.png"));
console.log("build/codex-plugin 完成");
