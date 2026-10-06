// 實際 Codex 對話 → functions.exec 的 ALL_TOOLS → plugin MCP。
// 模型由 loopback HTTP 的固定回應代替；不使用帳號、API Key 或真實 Token。
// 另驗證「MCP 有工具但被 code mode 排除」及 plugin 工具白名單為空的差異。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServer } from "./helpers/codex-app-server.mjs";
import { extractZip } from "./helpers/unzip.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const hasCodex = spawnSync("codex", ["--version"], { encoding: "utf8" }).status === 0;
const skip = hasCodex ? false : "找不到 codex CLI";
const probe = `const found = ALL_TOOLS.filter(x => x.name.includes("openfun"));
text({ openfunToolCount: found.length });
const check = found.find(x => x.name.includes("openfun_check_config"));
if (check) text(await tools[check.name]({}));`;
const completed = (id) => ({
  type: "response.completed",
  response: { id, usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
});

async function runProbe({ excluded = false, emptyAllowlist = false, standalone = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), "openfun-model-tools-"));
  const userHome = join(base, "home");
  const codexHome = join(base, "codex");
  const pluginDir = join(base, "歐噴 外掛");
  for (const dir of [userHome, codexHome, pluginDir]) mkdirSync(dir);
  extractZip(readFileSync(join(root, "dist/openfun-codex-plugin.zip")), pluginDir);
  const standaloneDir = join(base, "歐噴 本機 MCP");
  if (standalone) {
    mkdirSync(join(standaloneDir, "server"), { recursive: true });
    for (const file of ["server/index.mjs", "setup.mjs", "LICENSE", "THIRD_PARTY_LICENSES.md"]) {
      copyFileSync(join(pluginDir, file), join(standaloneDir, file));
    }
  }
  const requests = [];
  const model = createServer(async (req, res) => {
    if (req.method !== "POST") { res.writeHead(404).end(); return; }
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      requests.push(body);
      const id = `response-${requests.length}`;
      const namespace = body.tools?.find((tool) => tool.type === "namespace" && tool.tools?.some((t) => t.name === "exec"));
      const item = requests.length === 1 ? {
        type: "custom_tool_call", call_id: "probe", name: "exec", input: probe,
        ...(namespace ? { namespace: namespace.name } : {}),
      } : {
        type: "message", id: "done", role: "assistant",
        content: [{ type: "output_text", text: "Local probe completed." }],
      };
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const event of [{ type: "response.created", response: { id } }, { type: "response.output_item.done", item }, completed(id)]) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.end();
    } catch { res.writeHead(500).end(); }
  });
  let app, timer;
  try {
    await new Promise((resolve) => model.listen(0, "127.0.0.1", resolve));
    const codeMode = excluded
      ? '[features.code_mode]\nenabled = true\nexcluded_tool_namespaces = ["mcp__openfun_data"]\n'
      : "[features]\ncode_mode = true\n";
    const allowlist = standalone
      ? '[plugins."openfun-data@openfun".mcp_servers.openfun-data]\nenabled = false\n' +
        '[mcp_servers.openfun-local]\ncommand = "node"\n' +
        `args = ${JSON.stringify([join(standaloneDir, "server/index.mjs"), "--host=codex"])}\ncwd = ${JSON.stringify(standaloneDir)}\n`
      : emptyAllowlist
      ? '[plugins."openfun-data@openfun".mcp_servers.openfun-data]\nenabled_tools = []\n'
      : "";
    writeFileSync(join(codexHome, "config.toml"),
      'model = "gpt-6-astra"\nmodel_provider = "fixture"\n' + codeMode + allowlist +
      `[model_providers.fixture]\nname = "Local test fixture"\nbase_url = "http://127.0.0.1:${model.address().port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n`);
    app = new CodexAppServer({ PATH: process.env.PATH, HOME: userHome, CODEX_HOME: codexHome });
    let buffer = "";
    const end = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("本機模型介面測試逾時")), 30_000);
      app.child.stdout.on("data", (data) => {
        buffer += data;
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.method === "turn/completed") resolve(msg.params.turn);
        }
      });
    });
    // 初始化先失敗時也需等到 finally 清理，避免未被 await 的逾時 promise 造成 unhandled rejection。
    end.catch(() => {});
    await app.request("initialize", { clientInfo: { name: "openfun-model-tools-test", version: "0" }, capabilities: { experimentalApi: true } });
    app.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
    const { thread } = await app.request("thread/start", {
      ephemeral: true, cwd: base, approvalPolicy: "never", sandbox: "danger-full-access",
      selectedCapabilityRoots: [{ id: "openfun-data@openfun", location: { type: "environment", environmentId: "local", path: pluginDir } }],
    });
    const status = await app.request("mcpServerStatus/list", { threadId: thread.id, detail: "toolsAndAuthOnly" });
    await app.request("turn/start", { threadId: thread.id, input: [{ type: "text", text: "Run the local tool catalog probe.", text_elements: [] }] });
    assert.equal((await end).status, "completed");
    assert.equal(requests.length, 2, "應實際執行 code mode，並將結果送回模型介面");
    const output = requests[1].input.find((item) => item.call_id === "probe" && item.type === "custom_tool_call_output");
    assert.ok(Array.isArray(output?.output));
    const count = output.output.find((item) => item.text?.startsWith('{"openfunToolCount":'));
    assert.ok(count, "應取得 ALL_TOOLS 的實際數量，不能以 MCP startup status 代替");
    const mcp = status.data.find((server) => server.name === (standalone ? "openfun-local" : "openfun-data"));
    assert.ok(mcp, "thread-scoped MCP inventory 應包含歐噴");
    return { mcpCount: Object.keys(mcp.tools).length, count: JSON.parse(count.text).openfunToolCount, output: output.output };
  } finally {
    clearTimeout(timer);
    await app?.close();
    model.closeAllConnections();
    await new Promise((resolve) => model.close(resolve));
    rmSync(base, { recursive: true, force: true });
  }
}

test("Codex 對話：ALL_TOOLS 包含 11 個歐噴工具，並能實際呼叫 check_config", { skip }, async () => {
  const result = await runProbe();
  assert.equal(result.mcpCount, 11);
  assert.equal(result.count, 11);
  const call = result.output.find((item) => item.text?.startsWith('{"content":'));
  assert.ok(call, "應取得真實 MCP 的回傳結果");
  const config = JSON.parse(call.text);
  assert.equal(config.isError, true);
  assert.match(config.content[0].text, /尚未設定可用的歐噴 API Token/);
});

test("Codex 對話：namespace 排除時 MCP 仍有 11 個工具，但 ALL_TOOLS 為 0", { skip }, async () => {
  const result = await runProbe({ excluded: true });
  assert.equal(result.mcpCount, 11);
  assert.equal(result.count, 0);
  assert.equal(result.output.some((item) => item.text?.startsWith('{"content":')), false);
});

test("Codex 對話：plugin enabled_tools 空白名單時 MCP 與 ALL_TOOLS 都為 0", { skip }, async () => {
  const result = await runProbe({ emptyAllowlist: true });
  assert.equal(result.mcpCount, 0);
  assert.equal(result.count, 0);
});

test("Codex 對話：停用外掛 MCP、改用同一程式的獨立本機 MCP，仍有 11 個工具且能呼叫", { skip }, async () => {
  const result = await runProbe({ standalone: true });
  assert.equal(result.mcpCount, 11);
  assert.equal(result.count, 11, "應只有獨立 MCP 的工具，避免同時啟動兩組歐噴工具");
  const call = result.output.find((item) => item.text?.startsWith('{"content":'));
  assert.ok(call);
  assert.match(JSON.parse(call.text).content[0].text, /尚未設定可用的歐噴 API Token/);
});
