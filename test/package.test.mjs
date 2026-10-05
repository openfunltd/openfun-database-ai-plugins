// 驗證實際交付的 dist/openfun-claude-extension.mcpb：解壓到暫存目錄（沒有 node_modules、
// 沒有原始碼），以 manifest 的 mcp_config 啟動並走完 MCP lifecycle。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { builtinModules } from "node:module";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startMockApi } from "./helpers/mock-api.mjs";
import { extractZip } from "./helpers/unzip.mjs";
import { validateManifest } from "../scripts/validate-manifest.mjs";
import { runStdioLifecycle } from "./helpers/stdio-lifecycle.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const mcpbFile = join(root, "dist", "openfun-claude-extension.mcpb");
let api;
let dir;
let zipInfo;

before(async () => {
  assert.ok(existsSync(mcpbFile), "請先執行 npm run pack");
  dir = mkdtempSync(join(tmpdir(), "openfun-mcpb-"));
  zipInfo = extractZip(readFileSync(mcpbFile), dir);
  api = await startMockApi();
});
after(async () => {
  await api?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function walk(d, prefix = "") {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  );
}

test("安裝包內容：只有執行所需檔案，沒有 node_modules / 原始碼 / 測試", () => {
  const files = walk(dir).sort();
  assert.deepEqual(files, ["LICENSE", "README.md", "THIRD_PARTY_LICENSES.md", "icon.png", "manifest.json", "server/index.mjs"]);
});

test("ZIP 結構：根目錄即 bundle 根目錄、路徑安全、保存 Unix 權限", () => {
  assert.deepEqual([...zipInfo.names].sort(), ["LICENSE", "README.md", "THIRD_PARTY_LICENSES.md", "icon.png", "manifest.json", "server/index.mjs"]);
  for (const n of zipInfo.names) assert.ok(zipInfo.modes.get(n) > 0, `${n} 應帶 Unix 權限`);
});

test("解壓後的 manifest 通過官方 schema v0.3 驗證，entry_point 與 icon 存在", () => {
  const r = validateManifest(join(dir, "manifest.json"), { checkEntryPoint: true });
  assert.deepEqual(r.errors, []);
});

test("manifest：Token 為唯一必填設定、sensitive、以環境變數注入", () => {
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  assert.equal(m.manifest_version, "0.3");
  assert.equal(m.server.type, "node");
  assert.equal(m.server.entry_point, "server/index.mjs");
  assert.deepEqual(m.server.mcp_config.args, ["${__dirname}/server/index.mjs"]);
  assert.deepEqual(m.server.mcp_config.env, { OPENFUN_API_TOKEN: "${user_config.api_token}" });
  assert.deepEqual(Object.keys(m.user_config), ["api_token"]);
  assert.equal(m.user_config.api_token.sensitive, true);
  assert.equal(m.user_config.api_token.required, true);
  assert.deepEqual(m.compatibility.platforms, ["darwin", "win32"]);
  assert.ok(!JSON.stringify(m).includes("OPENFUN_DEV"), "開發用覆寫不可出現在 manifest");
  assert.equal(m.tools.length, 9);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const versionTs = readFileSync(join(root, "src", "version.ts"), "utf8").match(/VERSION = "([^"]+)"/)[1];
  assert.equal(m.version, pkg.version, "manifest.json 與 package.json 版本需一致");
  assert.equal(versionTs, pkg.version, "src/version.ts 與 package.json 版本需一致");
});

test("server/index.mjs 只依賴 Node 內建模組", () => {
  const src = readFileSync(join(dir, "server", "index.mjs"), "utf8");
  const specs = new Set();
  // 排除註解行；排除程式碼產生器內的字串（例如 ajv 的 'require("ajv/…")'，前面緊接引號）
  const code = src
    .split("\n")
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join("\n");
  for (const m of code.matchAll(/^\s*import\s[^;]*?from\s*["']([^"']+)["']/gm)) specs.add(m[1]);
  for (const m of code.matchAll(/(?<![`'"])\b(?:__require|require|import)\s*\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]);
  assert.ok(specs.has("node:module"), "應偵測到 banner 的 node:module import");
  const builtins = new Set(builtinModules.flatMap((b) => [b, `node:${b}`]));
  const external = [...specs].filter((s) => !builtins.has(s) && !s.startsWith("./") && !s.startsWith("../"));
  assert.deepEqual(external, [], `外部依賴：${external.join(", ")}`);
});

test("解壓後的安裝包可在無開發依賴的目錄中完成 MCP lifecycle", async () => {
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const args = m.server.mcp_config.args.map((a) => a.replace("${__dirname}", dir));
  await runStdioLifecycle({ args, cwd: dir, apiUrl: api.url });
});
