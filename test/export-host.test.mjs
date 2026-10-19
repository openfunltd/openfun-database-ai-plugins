// Real packaged server / native Codex app-server, isolated home and mock API.
// These verify file delivery and MCP results, not the macOS/Windows GUI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { extractZip } from "./helpers/unzip.mjs";
import { startMockApi, GOOD_TOKEN, COMPANY_SLUG } from "./helpers/mock-api.mjs";
import { CodexAppServer } from "./helpers/codex-app-server.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const body = (r) => JSON.parse(r.content.find((c) => c.type === "text").text);

async function finish(call) {
  const start = body(await call("openfun_export_excel", { slug: COMPANY_SLUG, sort: { field: "資本額", direction: "desc" } }));
  for (let i = 0; i < 20; i++) {
    const result = await call("openfun_export_status", { export_id: start.export_id, wait_ms: 2000 });
    if (body(result).status !== "running") return result;
  }
  throw new Error("export did not finish");
}

for (const host of ["claude", "codex"]) {
  test(`${host} 打包版：背景匯出落在隔離下載資料夾，資源內容與本機檔一致`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "openfun-export-package-"));
    const home = join(dir, "使用者 家目錄");
    mkdirSync(home);
    const stage = join(dir, "外掛程式");
    extractZip(readFileSync(join(root, "dist", host === "claude" ? "openfun-claude-extension.mcpb" : "openfun-codex-plugin.zip")), stage);
    const api = await startMockApi();
    const transport = new StdioClientTransport({ command: process.execPath,
      args: [join(stage, "server", "index.mjs"), ...(host === "codex" ? ["--host=codex"] : [])], cwd: stage,
      env: { HOME: home, USERPROFILE: home, OPENFUN_API_TOKEN: GOOD_TOKEN, OPENFUN_DEV_BASE_URL: api.url }, stderr: "pipe" });
    let stderr = "";
    transport.stderr?.on("data", (d) => { stderr += d; });
    const client = new Client({ name: "export-host-test", version: "1" });
    try {
      await client.connect(transport);
      const result = await finish((name, args) => client.callTool({ name, arguments: args }));
      const status = body(result);
      assert.equal(status.complete, true);
      assert.equal(status.exported_rows, 45);
      assert.ok(status.file.path.startsWith(join(home, "Downloads", "OpenFun")));
      assert.ok(!status.file.path.startsWith(join(homedir(), "Downloads")), "不碰真實下載資料夾");
      assert.ok(!JSON.stringify(result).includes(GOOD_TOKEN));
      const resource = result.content.find((c) => c.type === "resource_link");
      const response = await client.readResource({ uri: resource.uri });
      assert.deepEqual(Buffer.from(response.contents[0].blob, "base64"), readFileSync(status.file.path));
      assert.ok(!stderr.includes(GOOD_TOKEN));
    } finally { await client.close(); await api.close(); rmSync(dir, { recursive: true, force: true }); }
  });
}

const hasCodex = spawnSync("codex", ["--version"], { encoding: "utf8" }).status === 0;
test("Codex 原生 app-server：匯出工具可呼叫、連結與實際完成檔均交回客戶端", { skip: hasCodex ? false : "沒有 Codex CLI" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "openfun-export-codex-native-"));
  const home = join(dir, "home");
  const codexHome = join(dir, "codex");
  for (const d of [home, codexHome]) mkdirSync(d);
  const api = await startMockApi();
  writeFileSync(join(codexHome, "config.toml"), `[mcp_servers.openfun-export]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(join(root, "build", "codex-plugin", "server", "index.mjs"))}, "--host=codex"]\n[mcp_servers.openfun-export.env]\nOPENFUN_API_TOKEN = ${JSON.stringify(GOOD_TOKEN)}\nOPENFUN_DEV_BASE_URL = ${JSON.stringify(api.url)}\n`);
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: codexHome, PATH: process.env.PATH };
  const app = new CodexAppServer(env);
  try {
    await app.initialize();
    const servers = await app.request("mcpServerStatus/list", { detail: "toolsAndAuthOnly" });
    const server = servers.data.find((s) => s.name === "openfun-export");
    assert.ok(server.tools.openfun_export_excel);
    const thread = await app.request("thread/start", { ephemeral: true, approvalPolicy: "never" });
    const result = await finish((tool, args) => app.request("mcpServer/tool/call", { threadId: thread.thread.id, server: "openfun-export", tool, arguments: args }));
    const status = body(result);
    assert.equal(status.complete, true);
    assert.equal(status.exported_rows, 45);
    assert.ok(status.file.path.startsWith(join(home, "Downloads", "OpenFun")));
    assert.ok(readFileSync(status.file.path).length > 100);
    assert.equal(result.content.find((c) => c.type === "resource_link").uri, status.file.uri);
    assert.ok(!JSON.stringify(result).includes(GOOD_TOKEN));
  } finally { await app.close(); await api.close(); rmSync(dir, { recursive: true, force: true }); }
});
