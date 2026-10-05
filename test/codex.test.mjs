// Codex plugin 端對端測試（實際產物 dist/openfun-codex-plugin.zip）：
// 解壓到含空白與中文的路徑 → 在隔離的 CODEX_HOME／HOME 中以 Codex CLI 安裝 → 由 Codex app-server
// 從快取啟動 MCP server（Codex 自己解析 mcp.json 的 command/args/cwd 與 PLUGIN_ROOT）→ 檢查工具與 Token 狀態。
// 需要網路的工具只對本機 mock API 執行，不呼叫 data.openfun.tw，也不送出模型對話。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { extractZip } from "./helpers/unzip.mjs";
import { CodexAppServer, descendantProcesses } from "./helpers/codex-app-server.mjs";
import { COMPANY_SLUG, startMockApi } from "./helpers/mock-api.mjs";
import { validateCodexPlugin } from "../scripts/validate-codex-plugin.mjs";
import { credentialsPath, writeCredentials } from "../build/lib/credentials.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const zipFile = join(root, "dist", "openfun-codex-plugin.zip");
const ALLOWLIST = [
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
const TOOLS = [
  "openfun_aggregate",
  "openfun_check_config",
  "openfun_get_dataset",
  "openfun_get_record",
  "openfun_get_skill",
  "openfun_guide",
  "openfun_list_datasets",
  "openfun_query_records",
  "openfun_search",
];
// 假 Token（mock 只接受 helpers/mock-api.mjs 的 GOOD_TOKEN；這裡另外檢查 header 內容即可）
const FAKE1 = "ofk_" + "c3".repeat(32);
const FAKE2 = "ofk_" + "d4".repeat(32);

const hasCodex = spawnSync("codex", ["--version"], { encoding: "utf8" }).status === 0;
const skip = hasCodex ? false : "找不到 codex CLI";
const linuxOnly = hasCodex && process.platform === "linux" ? false : "需要 Linux /proc 與 codex CLI";

let base, pluginDir, codexHome, userHome, env, cacheDir, api, realCodexConfig;

function codex(args) {
  const r = spawnSync("codex", args, { env, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `codex ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

function walk(d, prefix = "") {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  );
}

before(() => {
  if (!hasCodex) return;
  assert.ok(existsSync(zipFile), "請先執行 npm run pack");
  base = mkdtempSync(join(tmpdir(), "openfun-codex-"));
  pluginDir = join(base, "歐噴 Codex 外掛", "解壓 資料夾");
  codexHome = join(base, "codex home 測試");
  userHome = join(base, "使用者 家目錄");
  for (const d of [pluginDir, codexHome, userHome]) mkdirSync(d, { recursive: true });
  extractZip(readFileSync(zipFile), pluginDir);
  // 只傳必要變數：隔離 CODEX_HOME 與 HOME；刻意不含 OPENFUN_*
  env = { PATH: process.env.PATH, HOME: userHome, CODEX_HOME: codexHome, LANG: process.env.LANG ?? "C.UTF-8" };
  const realConfig = join(homedir(), ".codex", "config.toml");
  realCodexConfig = existsSync(realConfig) ? { path: realConfig, mtimeMs: statSync(realConfig).mtimeMs, size: statSync(realConfig).size } : null;
});
after(async () => {
  await api?.close();
  if (base) rmSync(base, { recursive: true, force: true });
});

test("ZIP：allowlist 檔案、官方格式驗證通過、沒有 Token 或執行期設定", { skip }, () => {
  assert.deepEqual(walk(pluginDir).sort(), ALLOWLIST);
  assert.deepEqual(validateCodexPlugin(pluginDir).errors, []);
  for (const rel of ALLOWLIST) {
    const text = readFileSync(join(pluginDir, rel)).toString("latin1");
    assert.doesNotMatch(text, /ofk_[0-9a-f]{64}/, `${rel} 不可含 Token`);
  }
  for (const rel of ["mcp.json", "plugin.json", ".agents/plugins/marketplace.json"]) {
    assert.doesNotMatch(readFileSync(join(pluginDir, rel), "utf8"), /OPENFUN_API_TOKEN|OPENFUN_DEV|credentials|127\.0\.0\.1|localhost/, rel);
  }
  const mcp = JSON.parse(readFileSync(join(pluginDir, "mcp.json"), "utf8"));
  assert.deepEqual(mcp.mcpServers["openfun-data"], {
    type: "stdio",
    command: "node",
    args: ["${PLUGIN_ROOT}/server/index.mjs", "--host=codex"],
    cwd: "${PLUGIN_ROOT}",
  });
  const pj = JSON.parse(readFileSync(join(pluginDir, "plugin.json"), "utf8"));
  assert.equal(pj.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(pj.version, JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version);
});

test("Codex CLI：從中文／空白路徑 marketplace add 與 plugin add 到隔離 CODEX_HOME", { skip }, () => {
  const m = codex(["plugin", "marketplace", "add", pluginDir, "--json"]);
  assert.equal(m.marketplaceName, "openfun");
  assert.equal(m.installedRoot, pluginDir);
  const p = codex(["plugin", "add", "openfun-data@openfun", "--json"]);
  assert.equal(p.pluginId, "openfun-data@openfun");
  assert.equal(p.version, "0.1.0");
  cacheDir = p.installedPath;
  assert.ok(cacheDir.startsWith(codexHome + sep), `快取應在隔離 CODEX_HOME 內：${cacheDir}`);
  assert.equal(relative(codexHome, cacheDir).split(sep).join("/"), "plugins/cache/openfun/openfun-data/0.1.0");
  assert.deepEqual(walk(cacheDir).sort(), ALLOWLIST, "快取內容與 ZIP allowlist 相同");
  const config = readFileSync(join(codexHome, "config.toml"), "utf8");
  assert.match(config, /\[plugins\."openfun-data@openfun"\]\s*\nenabled = true/);
  assert.ok(!existsSync(join(userHome, ".config", "openfun-data")), "安裝不應建立 Token 設定檔");
});

/** 啟動 app-server、建立 thread，回傳 Codex 實際啟動的 openfun MCP server 程序資訊 */
async function withCodex(fn) {
  const app = new CodexAppServer(env);
  try {
    await app.initialize();
    const st = await app.request("mcpServerStatus/list", { detail: "toolsAndAuthOnly" });
    const ours = st.data.find((s) => s.name === "openfun-data");
    assert.ok(ours, `Codex 應載入 openfun-data MCP server：${JSON.stringify(st.data.map((s) => s.name))}`);
    const thread = await app.request("thread/start", { ephemeral: true });
    return await fn({ app, status: ours, threadId: thread.thread.id });
  } finally {
    await app.close();
  }
}

function findServerProcess(app) {
  const procs = descendantProcesses(app.child.pid).filter((p) => p.argv.some((a) => a.endsWith(`${sep}server${sep}index.mjs`)));
  assert.equal(procs.length >= 1, true, "應找到 Codex 啟動的 server/index.mjs 程序");
  return procs[0];
}

const callText = (r) => r.content.map((c) => c.text).join("\n");

test("Codex app-server：從快取啟動 server、解析 PLUGIN_ROOT/cwd/args，9 個工具，未設定 Token 時給 Codex 專用提示", { skip: linuxOnly }, async () => {
  await withCodex(async ({ app, status, threadId }) => {
    assert.equal(status.pluginId, "openfun-data@openfun");
    assert.equal(status.serverInfo.name, "openfun-data");
    assert.deepEqual(Object.keys(status.tools).sort(), TOOLS);
    for (const t of Object.values(status.tools)) assert.equal(t.annotations.readOnlyHint, true);

    const proc = findServerProcess(app);
    const cache = realpathSync(cacheDir);
    assert.equal(proc.argv[1], join(cache, "server", "index.mjs"), "args 中的 ${PLUGIN_ROOT} 由 Codex 展開為快取路徑");
    assert.equal(proc.argv[2], "--host=codex");
    assert.equal(proc.argv.length, 3);
    assert.match(proc.argv[0], /(^|\/)node$/, "command 為 PATH 上的 node");
    assert.equal(proc.cwd, cache, "cwd 為快取內的 plugin 根目錄");
    assert.equal(proc.env.PLUGIN_ROOT, cache);
    assert.equal(proc.env.HOME, userHome);
    assert.ok(!Object.keys(proc.env).some((k) => k.startsWith("OPENFUN_")), "Codex 不會傳入 OPENFUN_* 環境變數");
    assert.ok(!proc.argv.join(" ").includes(pluginDir), "執行時不使用解壓資料夾");

    const r = await app.request("mcpServer/tool/call", { server: "openfun-data", threadId, tool: "openfun_check_config", arguments: {} });
    assert.equal(r.isError, true);
    const t = callText(r);
    assert.match(t, /尚未設定可用的歐噴 API Token：尚未在本機設定檔中設定 Token/);
    assert.ok(t.includes(`node "${join(cache, "setup.mjs")}"`), `提示應包含快取內 setup.mjs 的路徑：${t}`);
    assert.match(t, /AI 助理不要代為執行/);
    assert.doesNotMatch(t, /Claude Desktop/);
  });
});

test("Codex app-server：設定檔權限過寬或 Token 不合法時拒絕使用（不連網）", { skip: linuxOnly }, async () => {
  const path = credentialsPath({ HOME: userHome }, "linux");
  mkdirSync(join(userHome, ".config", "openfun-data"), { recursive: true, mode: 0o700 });
  for (const [body, mode, re] of [
    [JSON.stringify({ version: 1, api_token: FAKE1 }), 0o644, /權限過寬/],
    [JSON.stringify({ version: 1, api_token: "ofk_short" }), 0o600, /太短/],
  ]) {
    rmSync(path, { force: true });
    writeFileSync(path, body, { mode });
    chmodSync(path, mode);
    await withCodex(async ({ app, threadId }) => {
      const r = await app.request("mcpServer/tool/call", { server: "openfun-data", threadId, tool: "openfun_check_config", arguments: {} });
      assert.equal(r.isError, true);
      assert.match(callText(r), re);
      assert.ok(!callText(r).includes(FAKE1));
    });
  }
  rmSync(path, { force: true });
});

/** 以 Codex 實際使用的 argv/cwd/env 重新啟動 server，只額外加上指向本機 mock 的開發變數 */
async function runCapturedSpec(spec, fn) {
  const transport = new StdioClientTransport({
    command: spec.argv[0],
    args: spec.argv.slice(1),
    cwd: spec.cwd,
    env: { ...spec.env, OPENFUN_DEV_BASE_URL: api.url, OPENFUN_DEV_TIMEOUT_MS: "3000" },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (d) => (stderr += d));
  const client = new Client({ name: "codex-spec", version: "1" });
  await client.connect(transport);
  try {
    return await fn(client, () => stderr);
  } finally {
    await client.close();
  }
}

test("Token 設定檔：Codex 解析出的啟動方式讀到 Token；更新、移除後立即反映；Token 不出現在輸出", { skip: linuxOnly }, async () => {
  api = await startMockApi();
  const path = credentialsPath({ HOME: userHome }, "linux");
  writeCredentials(path, FAKE1, "linux");
  assert.equal(statSync(path).mode & 0o777, 0o600);

  // 有合法格式的 Token 時，只讓 Codex 啟動並列出工具（不透過 Codex 呼叫會連網的工具），擷取其啟動方式
  const spec = await withCodex(async ({ app }) => findServerProcess(app));
  assert.equal(spec.env.HOME, userHome);

  const lastAuth = () => [...api.requests].reverse().find((r) => r.path.startsWith("/api/v1/datasets"))?.headers.authorization;
  await runCapturedSpec(spec, async (client, stderr) => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
    const r = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(lastAuth(), `Bearer ${FAKE1}`, "Token 來自使用者設定檔");
    assert.ok(!JSON.stringify(r).includes(FAKE1), "工具輸出不可含 Token");
    assert.match(stderr(), /宿主：Codex；來源：credentials-file/);
    assert.ok(!stderr().includes(FAKE1), "stderr 不可含 Token");
    assert.match(client.getInstructions(), /不要在對話中索取/);
  });

  writeCredentials(path, FAKE2, "linux");
  await runCapturedSpec(spec, async (client) => {
    await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(lastAuth(), `Bearer ${FAKE2}`, "取代 Token 後下次啟動使用新值");
  });

  rmSync(path);
  const before = api.requests.length;
  await runCapturedSpec(spec, async (client) => {
    const r = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(r.isError, true);
    assert.match(callText(r), /尚未設定/);
  });
  assert.equal(api.requests.length, before, "移除 Token 後不送出需要認證的請求");
});

test("解除安裝：plugin remove 刪除快取、marketplace remove；真實 ~/.codex 未被修改", { skip }, () => {
  const r = spawnSync("codex", ["plugin", "remove", "openfun-data@openfun"], { env, encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(cacheDir), false);
  const m = spawnSync("codex", ["plugin", "marketplace", "remove", "openfun"], { env, encoding: "utf8", timeout: 60_000 });
  assert.equal(m.status, 0, m.stderr);
  assert.doesNotMatch(readFileSync(join(codexHome, "config.toml"), "utf8"), /openfun/);
  assert.ok(existsSync(join(pluginDir, "plugin.json")), "不刪除使用者解壓的資料夾");
  if (realCodexConfig) {
    const now = statSync(realCodexConfig.path);
    assert.equal(now.mtimeMs, realCodexConfig.mtimeMs, "真實 ~/.codex/config.toml 不可被修改");
    assert.equal(now.size, realCodexConfig.size);
  }
});
