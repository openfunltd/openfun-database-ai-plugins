// Codex 相容入口（.codex-plugin/plugin.json、.mcp.json）的整合測試，全部使用本機實際的 codex 執行檔：
// 1. `codex exec-server --listen stdio` 的 capabilityRoots/discoverV1（executor 端 capability discovery）
//    只認 .codex-plugin/ 等路徑：有相容入口才找得到 plugin 與 MCP 設定；拿掉相容入口（舊包）時找不到。
// 2. 拿掉 portable 入口（root plugin.json、mcp.json），讓 Codex 只能走 legacy manifest／.mcp.json：
//    實際安裝、由 app-server 啟動 server，列出 11 個工具，openfun_check_config 回報尚未設定。
// 只在隔離 CODEX_HOME／HOME 中執行；不含 Token、不連正式 API、不送出模型對話。
// 限制：只驗證本機的 Codex CLI 版本，不代表任何較舊版本或桌面 app 介面的行為。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractZip } from "./helpers/unzip.mjs";
import { CodexAppServer, descendantProcesses } from "./helpers/codex-app-server.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const zipFile = join(root, "dist", "openfun-codex-plugin.zip");
const TOOLS = [
  "openfun_aggregate",
  "openfun_check_config",
  "openfun_clear_token",
  "openfun_get_dataset",
  "openfun_get_record",
  "openfun_get_skill",
  "openfun_guide",
  "openfun_list_datasets",
  "openfun_query_records",
  "openfun_search",
  "openfun_set_token",
];

const hasCodex = spawnSync("codex", ["--version"], { encoding: "utf8" }).status === 0;
const skip = hasCodex ? false : "找不到 codex CLI";
const linuxOnly = hasCodex && process.platform === "linux" ? false : "需要 Linux /proc 與 codex CLI";

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** 解壓實際 ZIP 到含空白與中文的路徑，刪除指定檔案後回傳 plugin 目錄與隔離環境 */
function fixture(remove = []) {
  assert.ok(existsSync(zipFile), "請先執行 npm run pack");
  const base = mkdtempSync(join(tmpdir(), "openfun-codex-compat-"));
  dirs.push(base);
  const pluginDir = join(base, "歐噴 外掛");
  const codexHome = join(base, "codex home");
  const userHome = join(base, "家目錄");
  for (const d of [pluginDir, codexHome, userHome]) mkdirSync(d, { recursive: true });
  extractZip(readFileSync(zipFile), pluginDir);
  for (const rel of remove) rmSync(join(pluginDir, rel), { recursive: true, force: true });
  const env = { PATH: process.env.PATH, HOME: userHome, CODEX_HOME: codexHome, LANG: process.env.LANG ?? "C.UTF-8" };
  return { pluginDir, codexHome, userHome, env };
}

async function discover(remove) {
  const { pluginDir, env } = fixture(remove);
  const server = new CodexAppServer(env, ["exec-server", "--listen", "stdio"]);
  try {
    await server.request("initialize", { clientName: "openfun-compat-test" });
    server.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
    const uri = pathToFileURL(pluginDir).href;
    const r = await server.request("capabilityRoots/discoverV1", { roots: [{ id: "openfun", path: uri }] });
    const found = r.roots[0];
    assert.equal(found.error, null, JSON.stringify(found.error));
    return { found, uri };
  } finally {
    await server.close();
  }
}

test("executor discovery：有相容入口時找到 plugin、MCP 設定與 skill", { skip }, async () => {
  const { found, uri } = await discover([]);
  assert.ok(found.plugin, `應找到 plugin：${JSON.stringify(found.warnings)}`);
  assert.equal(found.plugin.manifest.path, `${uri}/.codex-plugin/plugin.json`);
  assert.equal(JSON.parse(found.plugin.manifest.contents).name, "openfun-data");
  assert.equal(found.plugin.mcpConfig?.path, `${uri}/.mcp.json`);
  assert.deepEqual(Object.keys(JSON.parse(found.plugin.mcpConfig.contents).mcpServers), ["openfun-data"]);
  assert.deepEqual(found.skills.map((s) => s.instructions.path), [`${uri}/skills/openfun-data/SKILL.md`]);
  assert.deepEqual(found.warnings, []);
});

test("executor discovery：沒有相容入口（只有 portable 入口）時找不到 plugin 與 MCP 設定", { skip }, async () => {
  const { found } = await discover([".codex-plugin", ".claude-plugin", ".mcp.json"]);
  assert.equal(found.plugin, null, "只有 root plugin.json 時 executor discovery 找不到 plugin（相容入口要修補的缺口）");
  assert.equal(found.skills.length, 1, "skill 本身仍會被找到，但不屬於任何 plugin、也沒有 MCP 設定");
});

const callText = (r) => r.content.map((c) => c.text).join("\n");

// 使用桌面 app 的公開 backend API 安裝；不經 codex plugin CLI。
// 另移除 portable／Codex manifest，驗證封存檔相容入口本身仍有 MCP，避免只成功匯入 skill。
test("封存檔相容入口：app-server 市集安裝後能列出 11 個工具並呼叫設定檢查", { skip }, async () => {
  const { pluginDir, env } = fixture(["plugin.json", "mcp.json", ".codex-plugin"]);
  const { found, uri } = await discover(["plugin.json", "mcp.json", ".codex-plugin"]);
  assert.equal(found.plugin?.manifest.path, `${uri}/.claude-plugin/plugin.json`);
  assert.ok(found.plugin.mcpConfig);
  const app = new CodexAppServer(env);
  try {
    await app.initialize();
    const market = await app.request("marketplace/add", { source: pluginDir });
    assert.equal(market.marketplaceName, "openfun");
    await app.request("plugin/install", {
      marketplacePath: join(market.installedRoot, ".agents", "plugins", "marketplace.json"),
      pluginName: "openfun-data",
    });
    const status = await app.request("mcpServerStatus/list", { detail: "toolsAndAuthOnly" });
    const ours = status.data.filter((s) => s.name === "openfun-data");
    assert.equal(ours.length, 1);
    assert.deepEqual(Object.keys(ours[0].tools).sort(), TOOLS);
    const thread = await app.request("thread/start", { ephemeral: true });
    const r = await app.request("mcpServer/tool/call", {
      server: "openfun-data", threadId: thread.thread.id,
      tool: "openfun_check_config", arguments: {},
    });
    assert.equal(r.isError, true);
    assert.match(callText(r), /尚未設定可用的歐噴 API Token/);
  } finally {
    await app.close();
  }
});

test("legacy 入口：只有 .codex-plugin/plugin.json 與 .mcp.json 時，Codex 實際安裝、啟動一個 server、11 個工具、未設定 Token 的回覆", { skip: linuxOnly }, async () => {
  const { pluginDir, codexHome, userHome, env } = fixture(["plugin.json", "mcp.json", ".claude-plugin"]);
  const codex = (args) => {
    const r = spawnSync("codex", [...args, "--json"], { env, encoding: "utf8", timeout: 120_000 });
    assert.equal(r.status, 0, `codex ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(r.stdout);
  };
  assert.equal(codex(["plugin", "marketplace", "add", pluginDir]).marketplaceName, "openfun");
  const p = codex(["plugin", "add", "openfun-data@openfun"]);
  const cache = realpathSync(p.installedPath);
  assert.ok(cache.startsWith(realpathSync(codexHome) + sep));
  assert.ok(!existsSync(join(cache, "plugin.json")) && existsSync(join(cache, ".codex-plugin", "plugin.json")), "快取中只有 legacy 入口");

  const app = new CodexAppServer(env);
  try {
    await app.initialize();
    const st = await app.request("mcpServerStatus/list", { detail: "toolsAndAuthOnly" });
    const ours = st.data.filter((s) => s.name === "openfun-data");
    assert.equal(ours.length, 1, JSON.stringify(st.data.map((s) => s.name)));
    assert.equal(ours[0].pluginId, "openfun-data@openfun");
    assert.deepEqual(Object.keys(ours[0].tools).sort(), TOOLS);

    // 狀態查詢使用短暫的探索程序；建立 thread 後再檢查對話實際使用的 MCP 程序。
    const thread = await app.request("thread/start", { ephemeral: true });
    const procs = descendantProcesses(app.child.pid).filter((x) => x.argv.some((a) => a.endsWith(`server${sep}index.mjs`)));
    assert.equal(procs.length, 1, JSON.stringify(procs.map((x) => x.argv)));
    const [proc] = procs;
    assert.deepEqual(proc.argv.slice(1), ["./server/index.mjs", "--host=codex"], "legacy args 不含 placeholder，由 cwd 解析");
    assert.match(proc.argv[0], /(^|\/)node$/);
    assert.equal(realpathSync(proc.cwd), cache, "相對 cwd 由 Codex 接到快取內的 plugin 根目錄");
    assert.equal(proc.env.HOME, userHome);
    assert.ok(!Object.keys(proc.env).some((k) => k.startsWith("OPENFUN_")));

    const skills = (await app.request("skills/list", { forceReload: true })).data.flatMap((e) => e.skills);
    assert.equal(skills.filter((sk) => realpathSync(sk.path).startsWith(cache + sep)).length, 1, "legacy 入口也載入 plugin skill");

    const r = await app.request("mcpServer/tool/call", { server: "openfun-data", threadId: thread.thread.id, tool: "openfun_check_config", arguments: {} });
    assert.equal(r.isError, true);
    const t = callText(r);
    assert.match(t, /尚未設定可用的歐噴 API Token/);
    assert.match(t, /OPENFUN_API_TOKEN/);
    assert.doesNotMatch(t, /setup\.mjs/);
  } finally {
    await app.close();
  }
  assert.ok(!existsSync(join(userHome, ".config", "openfun-data")), "不建立 Token 設定檔");
});
