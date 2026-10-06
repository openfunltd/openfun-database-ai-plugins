// scripts/validate-codex-plugin.mjs：合法 plugin 通過，非法 plugin.json／mcp.json／marketplace／skill 必須被拒絕。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCodexPlugin } from "../scripts/validate-codex-plugin.mjs";
import { CodexAppServer } from "./helpers/codex-app-server.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const stage = join(root, "build", "codex-plugin");
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function variant(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "openfun-codex-validate-"));
  dirs.push(dir);
  cpSync(stage, dir, { recursive: true });
  const edit = (rel, fn) => {
    const p = join(dir, rel);
    writeFileSync(p, JSON.stringify(fn(JSON.parse(readFileSync(p, "utf8"))), null, 2));
  };
  mutate({ dir, edit });
  return { dir, ...validateCodexPlugin(dir) };
}
const server = (j) => j.mcpServers["openfun-data"];

test("build/codex-plugin 通過驗證", () => {
  assert.deepEqual(validateCodexPlugin(stage).errors, []);
});

const INVALID = {
  "plugin.json 未知欄位": [({ edit }) => edit("plugin.json", (j) => ({ ...j, mcpServers: {} })), /additional properties/],
  "plugin.json 錯誤 $schema": [({ edit }) => edit("plugin.json", (j) => ({ ...j, $schema: "https://agent-plugins.org/schemas/9.9.9/plugin.schema.json" })), /constant/],
  "plugin.json 名稱非 kebab-case": [({ edit }) => edit("plugin.json", (j) => ({ ...j, name: "OpenFun Data" })), /pattern/],
  "plugin.json 版本不同步": [({ edit }) => edit("plugin.json", (j) => ({ ...j, version: "9.9.9" })), /package\.json/],
  "composerIcon 不存在": [({ edit }) => edit("plugin.json", (j) => (j.extensions["com.openai"].interface.composerIcon = "./assets/none.png", j)), /composerIcon/],
  "composerIcon 未以 ./ 開頭": [({ edit }) => edit("plugin.json", (j) => (j.extensions["com.openai"].interface.composerIcon = "assets/icon.png", j)), /composerIcon/],
  "mcp.json 缺 type": [({ edit }) => edit("mcp.json", (j) => (delete server(j).type, j)), /mcp\.json/],
  "mcp.json 未知欄位": [({ edit }) => edit("mcp.json", (j) => ((server(j).timeout = 5), j)), /additional properties/],
  "command 絕對路徑": [({ edit }) => edit("mcp.json", (j) => ((server(j).command = "/usr/bin/node"), j)), /裸指令名/],
  "command 含路徑但非 ./": [({ edit }) => edit("mcp.json", (j) => ((server(j).command = "bin/node"), j)), /裸指令名/],
  "command 離開 plugin": [({ edit }) => edit("mcp.json", (j) => ((server(j).command = "./../node"), j)), /離開/],
  "cwd 在 plugin 外": [({ edit }) => edit("mcp.json", (j) => ((server(j).cwd = "/tmp"), j)), /cwd/],
  "env 覆寫 PLUGIN_ROOT": [({ edit }) => edit("mcp.json", (j) => ((server(j).env = { PLUGIN_ROOT: "/x" }), j)), /PLUGIN_ROOT/],
  "env 放入 Token": [({ edit }) => edit("mcp.json", (j) => ((server(j).env = { OPENFUN_API_TOKEN: "x" }), j)), /Token/],
  "args 指向不存在檔案": [({ edit }) => edit("mcp.json", (j) => ((server(j).args = ["${PLUGIN_ROOT}/server/missing.mjs"]), j)), /不存在/],
  "改用 SSE": [({ edit }) => edit("mcp.json", (j) => ((j.mcpServers["openfun-data"] = { type: "sse", url: "https://x.example/sse" }), j)), /stdio/],
  "marketplace 路徑非 ./": [({ edit }) => edit(".agents/plugins/marketplace.json", (j) => ((j.plugins[0].source.path = "plugin"), j)), /source/],
  "marketplace 缺 policy": [({ edit }) => edit(".agents/plugins/marketplace.json", (j) => (delete j.plugins[0].policy, j)), /policy/],
  "marketplace 名稱與 plugin 不符": [({ edit }) => edit(".agents/plugins/marketplace.json", (j) => ((j.plugins[0].name = "other"), j)), /name/],
  "skill name 與資料夾不符": [
    ({ dir }) => {
      const p = join(dir, "skills", "openfun-data", "SKILL.md");
      writeFileSync(p, readFileSync(p, "utf8").replace("name: openfun-data", "name: other"));
    },
    /資料夾名稱/,
  ],
  "相容 manifest 空白": [({ dir }) => writeFileSync(join(dir, ".codex-plugin", "plugin.json"), "{}"), /\.codex-plugin/],
  "相容 manifest 為 null": [({ edit }) => edit(".codex-plugin/plugin.json", () => null), /JSON object/],
  "相容 MCP 為 null": [({ edit }) => edit(".mcp.json", () => null), /JSON object/],
  "缺少相容入口": [({ dir }) => rmSync(join(dir, ".codex-plugin"), { recursive: true }), /缺少相容入口/],
  "缺少封存檔匯入入口": [({ dir }) => rmSync(join(dir, ".claude-plugin"), { recursive: true }), /\.claude-plugin/],
  "封存檔匯入入口遺失 MCP": [({ edit }) => edit(".claude-plugin/plugin.json", (j) => (delete j.mcpServers, j)), /\.claude-plugin/],
  "相容入口不是目錄": [({ dir }) => { rmSync(join(dir, ".codex-plugin"), { recursive: true }); writeFileSync(join(dir, ".codex-plugin"), "{}"); }, /必須是目錄/],
  "相容 manifest 版本不同步": [({ edit }) => edit(".codex-plugin/plugin.json", (j) => ({ ...j, version: "9.9.9" })), /version/],
  "相容技能路徑離開 plugin": [({ edit }) => edit(".codex-plugin/plugin.json", (j) => ({ ...j, skills: "./../skills/" })), /skills/],
  "相容 MCP 使用 placeholder": [({ edit }) => edit(".mcp.json", (j) => ((server(j).args = ["${PLUGIN_ROOT}/server/index.mjs"]), j)), /placeholder/],
  "相容 MCP 多出 server": [({ edit }) => edit(".mcp.json", (j) => ((j.mcpServers.other = { ...server(j) }), j)), /server 名稱/],
  "相容 MCP server 非 object": [({ edit }) => edit(".mcp.json", (j) => ((j.mcpServers["openfun-data"] = null), j)), /JSON object/],
  "相容 MCP args 非字串": [({ edit }) => edit(".mcp.json", (j) => ((server(j).args = [null]), j)), /字串陣列/],
};

for (const [name, [mutate, re]] of Object.entries(INVALID)) {
  test(`拒絕非法 Codex plugin：${name}`, () => {
    const r = variant(mutate);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => re.test(e)), r.errors.join("\n"));
  });
}

const hasCodex = spawnSync("codex", ["--version"], { encoding: "utf8" }).status === 0;

test("與 Codex 本身一致：絕對路徑 command 被 Codex 拒絕載入（隔離 CODEX_HOME）", { skip: hasCodex ? false : "找不到 codex CLI" }, async () => {
  const { dir } = variant(({ edit }) => edit("mcp.json", (j) => ((server(j).command = process.execPath), j)));
  const home = mkdtempSync(join(tmpdir(), "openfun-codex-parity-"));
  dirs.push(home);
  const env = { PATH: process.env.PATH, HOME: home, CODEX_HOME: join(home, "codex") };
  mkdirSync(env.CODEX_HOME);
  for (const args of [["plugin", "marketplace", "add", dir], ["plugin", "add", "openfun-data@openfun"]]) {
    const r = spawnSync("codex", args, { env, encoding: "utf8", timeout: 120_000 });
    assert.equal(r.status, 0, r.stderr);
  }
  const app = new CodexAppServer(env);
  try {
    await app.initialize();
    const st = await app.request("mcpServerStatus/list", { detail: "toolsAndAuthOnly" });
    assert.equal(st.data.find((s) => s.name === "openfun-data"), undefined, "Codex 應拒絕載入絕對路徑 command 的 server");
  } finally {
    await app.close();
  }
});
