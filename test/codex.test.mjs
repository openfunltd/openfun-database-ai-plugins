// Codex plugin 端對端測試（實際產物 dist/openfun-codex-plugin.zip）：
// 解壓到含空白與中文的路徑 → 在隔離的 CODEX_HOME／HOME 中以 Codex CLI 安裝 → 由 Codex app-server
// 從快取啟動 MCP server（Codex 自己解析 mcp.json 的 command/args/cwd 與 PLUGIN_ROOT）→ 檢查工具與 Token 狀態。
// ZIP 另含相容入口（.codex-plugin/plugin.json、.mcp.json）；這裡確認同時存在時 Codex 仍只啟動一個 server、skill 只載入一次。
// 相容入口本身的載入見 codex-compat.test.mjs。
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
import { COMPANY_SLUG, GOOD_TOKEN, startMockApi } from "./helpers/mock-api.mjs";
import { validateCodexPlugin } from "../scripts/validate-codex-plugin.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const zipFile = join(root, "dist", "openfun-codex-plugin.zip");
const ALLOWLIST = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_LICENSES.md",
  "assets/icon.png",
  "mcp.json",
  "plugin.json",
  "server/index.mjs",
  "skills/openfun-data/SKILL.md",
];
const QUERY_TOOLS = [
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
// Codex 另有兩個對話 Token 管理工具（Claude Desktop 只有上面 9 個）
const TOKEN_TOOLS = ["openfun_clear_token", "openfun_set_token"];
const TOOLS = [...QUERY_TOOLS, ...TOKEN_TOOLS].sort();
const PROMPT = "請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。";
const VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
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
  for (const rel of ["mcp.json", "plugin.json", ".agents/plugins/marketplace.json", ".codex-plugin/plugin.json", ".mcp.json"]) {
    assert.doesNotMatch(readFileSync(join(pluginDir, rel), "utf8"), /OPENFUN_DEV|credentials|127\.0\.0\.1|localhost/, rel);
  }
  const mcp = JSON.parse(readFileSync(join(pluginDir, "mcp.json"), "utf8"));
  assert.deepEqual(mcp.mcpServers["openfun-data"], {
    type: "stdio",
    command: "node",
    args: ["${PLUGIN_ROOT}/server/index.mjs", "--host=codex"],
    cwd: "${PLUGIN_ROOT}",
  });
  assert.deepEqual(JSON.parse(readFileSync(join(pluginDir, ".mcp.json"), "utf8")).mcpServers["openfun-data"], {
    type: "stdio",
    command: "node",
    args: ["./server/index.mjs", "--host=codex"],
    cwd: ".",
  });
  const pj = JSON.parse(readFileSync(join(pluginDir, "plugin.json"), "utf8"));
  assert.equal(pj.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(pj.version, JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version);
});

test("ZIP：標準 ZIP reader 可辨識每個 entry 為 Unix 一般檔案", () => {
  const r = spawnSync("python3", ["-c", `
import sys,zipfile,stat
with zipfile.ZipFile(sys.argv[1]) as z:
    assert z.testzip() is None
    for item in z.infolist():
        mode = item.external_attr >> 16
        assert item.create_system == 3, item.filename
        assert stat.S_ISREG(mode), (item.filename, oct(mode))
        assert stat.S_IMODE(mode) == 0o644, (item.filename, oct(mode))
`, zipFile], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("Codex CLI：從中文／空白路徑 marketplace add 與 plugin add 到隔離 CODEX_HOME", { skip }, () => {
  const m = codex(["plugin", "marketplace", "add", pluginDir, "--json"]);
  assert.equal(m.marketplaceName, "openfun");
  assert.equal(m.installedRoot, pluginDir);
  const p = codex(["plugin", "add", "openfun-data@openfun", "--json"]);
  assert.equal(p.pluginId, "openfun-data@openfun");
  assert.equal(p.version, VERSION);
  cacheDir = p.installedPath;
  assert.ok(cacheDir.startsWith(codexHome + sep), `快取應在隔離 CODEX_HOME 內：${cacheDir}`);
  assert.equal(relative(codexHome, cacheDir).split(sep).join("/"), `plugins/cache/openfun/openfun-data/${VERSION}`);
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
    const all = st.data.filter((s) => s.name === "openfun-data");
    assert.equal(all.length, 1, "相容入口不可多出第二個 openfun-data server");
    const ours = all[0];
    assert.ok(ours, `Codex 應載入 openfun-data MCP server：${JSON.stringify(st.data.map((s) => s.name))}`);
    const thread = await app.request("thread/start", { ephemeral: true });
    return await fn({ app, status: ours, threadId: thread.thread.id });
  } finally {
    await app.close();
  }
}

function findServerProcess(app) {
  const procs = descendantProcesses(app.child.pid).filter((p) => p.argv.some((a) => a.endsWith(`${sep}server${sep}index.mjs`)));
  assert.equal(procs.length, 1, `Codex 應只啟動一個 server/index.mjs 程序：${JSON.stringify(procs.map((p) => p.argv))}`);
  return procs[0];
}

const callText = (r) => r.content.map((c) => c.text).join("\n");

test("Codex app-server：從快取啟動 server，11 個工具，提示畫面環境變數與選用對話 Token；Token 工具不連網的路徑", { skip: linuxOnly }, async () => {
  await withCodex(async ({ app, status, threadId }) => {
    assert.equal(status.pluginId, "openfun-data@openfun");
    assert.equal(status.serverInfo.name, "openfun-data");
    assert.deepEqual(Object.keys(status.tools).sort(), TOOLS);
    for (const [name, t] of Object.entries(status.tools)) {
      assert.equal(t.annotations.readOnlyHint, !TOKEN_TOOLS.includes(name), `${name} readOnlyHint`);
    }

    const proc = findServerProcess(app);
    const cache = realpathSync(cacheDir);
    const skills = (await app.request("skills/list", { forceReload: true })).data.flatMap((e) => e.skills);
    const ourSkills = skills.filter((sk) => realpathSync(sk.path).startsWith(cache + sep));
    assert.equal(ourSkills.length, 1, `plugin skill 只載入一次：${JSON.stringify(ourSkills.map((sk) => sk.path))}`);
    assert.equal(proc.argv[1], join(cache, "server", "index.mjs"), "args 中的 ${PLUGIN_ROOT} 由 Codex 展開為快取路徑");
    assert.equal(proc.argv[2], "--host=codex");
    assert.equal(proc.argv.length, 3);
    assert.match(proc.argv[0], /(^|\/)node$/, "command 為 PATH 上的 node");
    assert.equal(proc.cwd, cache, "cwd 為快取內的 plugin 根目錄");
    assert.equal(proc.env.PLUGIN_ROOT, cache);
    assert.equal(proc.env.HOME, userHome);
    assert.ok(!Object.keys(proc.env).some((k) => k.startsWith("OPENFUN_")), "Codex 不會傳入 OPENFUN_* 環境變數");
    assert.ok(!proc.argv.join(" ").includes(pluginDir), "執行時不使用解壓資料夾");

    const call = (tool, args = {}) => app.request("mcpServer/tool/call", { server: "openfun-data", threadId, tool, arguments: args });
    const r = await call("openfun_check_config");
    assert.equal(r.isError, true);
    const t = callText(r);
    assert.match(t, /尚未設定可用的歐噴 API Token：這次執行中還沒有設定 Token/);
    assert.match(t, /設定 → MCP 伺服器/);
    assert.match(t, /OPENFUN_API_TOKEN/);
    assert.doesNotMatch(t, /setup\.mjs/);
    assert.ok(t.includes(PROMPT), "對話短效 Token 仍是可選方式");
    assert.match(t, /openfun_set_token/);
    assert.doesNotMatch(t, /Claude Desktop/);

    // 以下都不連網：格式錯誤在送出前就拒絕；清除只改本程序記憶體（Codex 啟動的 server 指向正式站，所以不測合法 Token）
    const bad = "ofk_bad value with spaces 1234567890";
    const set = await call("openfun_set_token", { token: bad });
    assert.equal(set.isError, true);
    assert.match(callText(set), /新 Token 未套用，目前狀態維持不變/);
    assert.match(callText(set), /空白、換行/);
    assert.ok(!callText(set).includes(bad), "錯誤不可回顯貼上的值");
    const clear = await call("openfun_clear_token");
    assert.notEqual(clear.isError, true);
    assert.match(callText(clear), /不會改用環境變數/);
    const after = await call("openfun_check_config");
    assert.equal(after.isError, true);
    assert.match(callText(after), /已清除這次執行中的 Token/);
    assert.ok(!app.stderr.includes(bad), "Codex app-server 的 stderr 不可含貼上的值");
    assert.ok(!existsSync(join(userHome, ".config", "openfun-data")), "對話 Token 工具不可建立設定檔");
  });
});

test("Codex 啟動方式：合法、格式錯誤及權限過寬的舊 Token 檔都不載入（本機模擬 API）", { skip: linuxOnly }, async () => {
  api = await startMockApi();
  const spec = await withCodex(async ({ app }) => findServerProcess(app));
  const path = join(userHome, ".config", "openfun-data", "credentials.json");
  mkdirSync(join(userHome, ".config", "openfun-data"), { recursive: true, mode: 0o700 });
  for (const [body, mode] of [
    [JSON.stringify({ version: 1, api_token: FAKE1 }), 0o600],
    [JSON.stringify({ version: 1, api_token: FAKE1 }), 0o644],
    [JSON.stringify({ version: 1, api_token: "ofk_short" }), 0o600],
    ["invalid-json", 0o600],
  ]) {
    rmSync(path, { force: true });
    writeFileSync(path, body, { mode });
    chmodSync(path, mode);
    const before = api.requests.length;
    await runCapturedSpec(spec, async (client) => {
      const r = await client.callTool({ name: "openfun_check_config", arguments: {} });
      assert.equal(r.isError, true);
      assert.match(callText(r), /這次執行中還沒有設定 Token/);
      assert.doesNotMatch(callText(r), /權限過寬|太短|格式異常/);
      assert.ok(!callText(r).includes(FAKE1));
      assert.equal(readFileSync(path, "utf8"), body, "不修改舊 Token 檔");
      assert.equal(api.requests.length, before, "尚未設定時不送出認證請求");
    });
  }
  rmSync(path, { force: true });
  await api.close();
  api = undefined;
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

test("環境變數與對話 Token：設定、清除與重啟規則；永不使用舊 Token 檔且不洩漏", { skip: linuxOnly }, async () => {
  api = await startMockApi();
  const path = join(userHome, ".config", "openfun-data", "credentials.json");
  mkdirSync(join(userHome, ".config", "openfun-data"), { recursive: true, mode: 0o700 });
  const legacy = JSON.stringify({ version: 1, api_token: FAKE2 });
  writeFileSync(path, legacy, { mode: 0o600 });

  const spec = await withCodex(async ({ app }) => findServerProcess(app));
  assert.equal(spec.env.HOME, userHome);
  spec.env.OPENFUN_API_TOKEN = FAKE1;
  const lastAuth = () => [...api.requests].reverse().find((r) => r.path.startsWith("/api/v1/datasets"))?.headers.authorization;
  await runCapturedSpec(spec, async (client, stderr) => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
    const r = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(lastAuth(), `Bearer ${FAKE1}`, "使用 MCP 環境變數，不使用舊 Token 檔");
    assert.ok(!JSON.stringify(r).includes(FAKE1));
    assert.match(stderr(), /宿主：Codex；來源：env/);
    assert.ok(!stderr().includes(FAKE1));
    assert.match(client.getInstructions(), /openfun_set_token/);

    const set = await client.callTool({ name: "openfun_set_token", arguments: { token: GOOD_TOKEN } });
    assert.notEqual(set.isError, true, callText(set));
    assert.match(callText(set), /已取代先前的 Token（來源：環境變數/);
    assert.ok(!JSON.stringify(set).includes(GOOD_TOKEN) && !JSON.stringify(set).includes(FAKE1));
    assert.equal([...api.requests].reverse().find((x) => x.path === "/api/v1/me").headers.authorization, `Bearer ${GOOD_TOKEN}`);
    const q = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(q.isError, undefined, callText(q));
    assert.equal(lastAuth(), `Bearer ${GOOD_TOKEN}`);

    const clear = await client.callTool({ name: "openfun_clear_token", arguments: {} });
    assert.match(callText(clear), /重新啟動 Codex 後可能再次載入/);
    const before = api.requests.length;
    const none = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(none.isError, true);
    assert.match(callText(none), /已清除這次執行中的 Token/);
    assert.equal(api.requests.length, before, "清除後不使用任何啟動時的 Token 送出請求");
    assert.ok(![GOOD_TOKEN, FAKE1, FAKE2].some((t) => stderr().includes(t)));
  });

  await runCapturedSpec(spec, async (client, stderr) => {
    await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(lastAuth(), `Bearer ${FAKE1}`, "重啟只重新載入環境變數；對話 Token 不保留");
    assert.match(stderr(), /來源：env/);
  });
  spec.env.OPENFUN_API_TOKEN = GOOD_TOKEN;
  await runCapturedSpec(spec, async (client) => {
    await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(lastAuth(), `Bearer ${GOOD_TOKEN}`, "更新畫面 Token 後，下次啟動使用新值");
  });

  delete spec.env.OPENFUN_API_TOKEN;
  const before = api.requests.length;
  await runCapturedSpec(spec, async (client) => {
    const r = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(r.isError, true);
    assert.match(callText(r), /尚未設定/);
    assert.equal(api.requests.length, before, "移除環境變數後不回退到合法舊 Token 檔");
    const set = await client.callTool({ name: "openfun_set_token", arguments: { token: GOOD_TOKEN } });
    assert.notEqual(set.isError, true, callText(set));
  });
  const afterChat = api.requests.length;
  await runCapturedSpec(spec, async (client) => {
    const r = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(r.isError, true);
    assert.match(callText(r), /尚未設定/);
  });
  assert.equal(api.requests.length, afterChat, "重啟後對話 Token 消失，不使用舊 Token 檔");
  assert.equal(readFileSync(path, "utf8"), legacy, "整個流程不修改舊 Token 檔");
  rmSync(path);
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
