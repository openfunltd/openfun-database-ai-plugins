// Codex 對話 Token（openfun_set_token／openfun_clear_token）測試。全部只連本機 mock API，使用假 Token。
// - Claude Desktop 維持 9 個工具；Codex 為 11 個
// - 缺 Token → 設定 → 查詢；上游拒絕、格式錯誤、redirect 時保留原狀態
// - 取代 Token 時更換 schema 快取；清除後不回退；設定與清除依呼叫順序執行
// - 並行的慢查詢在 Token 被取代後，仍遮蔽它自己使用的舊 Token
// - 打包後的 server：stdout／stderr 不含 Token、不寫任何檔案
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../build/lib/server.js";
import { CLAUDE_DESKTOP_HOST, codexHost } from "../build/lib/host.js";
import { ALT_TOKEN, ALT_TOKEN_2, COMPANY_SLUG, EXPIRED_TOKEN, GOOD_TOKEN, INVALID_TOKEN, sendMock, startMockApi } from "./helpers/mock-api.mjs";

const PROMPT = "請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。";
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
const TOKEN_TOOLS = ["openfun_clear_token", "openfun_set_token"];
const DETAIL_PATH = `/api/v1/datasets/${COMPANY_SLUG}`;

let api;
before(async () => {
  api = await startMockApi();
});
after(async () => {
  await api.close();
});

async function connect({ token = null, host = codexHost("/p/setup.mjs"), tokenSource } = {}) {
  const server = createServer({ baseUrl: api.url, token, tokenProblem: null, timeoutMs: 3000, isDevOverride: true }, { host, tokenSource });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  return { client, call, close: () => client.close() };
}

const textOf = (r) => r.content.map((c) => c.text).join("\n");
const authOf = (path) => [...api.requests].reverse().find((r) => r.path === path)?.headers.authorization;
const count = (path) => api.requests.filter((r) => r.path === path).length;
function assertNo(r, ...tokens) {
  const all = JSON.stringify(r);
  for (const t of tokens) assert.ok(!all.includes(t), `輸出不可包含 Token（${t.slice(0, 6)}…）`);
}

test("工具清單：Claude Desktop 只有 9 個唯讀工具；Codex 為 11 個，Token 管理工具不是 readOnly", async () => {
  const claude = await connect({ host: CLAUDE_DESKTOP_HOST, token: GOOD_TOKEN });
  try {
    const { tools } = await claude.client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), QUERY_TOOLS);
    assert.doesNotMatch(claude.client.getInstructions(), /openfun_set_token|短效/);
  } finally {
    await claude.close();
  }
  const codex = await connect();
  try {
    const { tools } = await codex.client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [...QUERY_TOOLS, ...TOKEN_TOOLS].sort());
    for (const t of tools) {
      const isTokenTool = TOKEN_TOOLS.includes(t.name);
      assert.equal(t.annotations.readOnlyHint, !isTokenTool, t.name);
      assert.equal(t.annotations.destructiveHint, false, t.name);
      if (!isTokenTool) assert.ok(!JSON.stringify(t.inputSchema).match(/token/i), `${t.name} 不可有 token 參數`);
    }
    const set = tools.find((t) => t.name === "openfun_set_token");
    assert.deepEqual(set.inputSchema.required, ["token"]);
    assert.match(set.description, /驗證成功才取代/);
    assert.match(set.description, /不要用 shell、curl、命令列或寫檔/);
    assert.deepEqual(Object.keys(tools.find((t) => t.name === "openfun_clear_token").inputSchema.properties ?? {}), []);
    assert.ok(codex.client.getInstructions().includes(PROMPT));
  } finally {
    await codex.close();
  }
});

test("缺 Token → 提示（含對話選項）→ 使用者在對話貼 Token → set_token 以 /api/v1/me 驗證 → 查詢使用新 Token", async () => {
  const { call, close } = await connect();
  try {
    const before = api.requests.length;
    const missing = await call("openfun_query_records", { slug: COMPANY_SLUG });
    assert.equal(missing.isError, true);
    assert.ok(textOf(missing).includes(PROMPT), textOf(missing));
    assert.equal(api.requests.length, before, "未設定時不送出需要認證的請求");

    const set = await call("openfun_set_token", { token: `  ${GOOD_TOKEN}\n` });
    assert.notEqual(set.isError, true, textOf(set));
    assert.equal(authOf("/api/v1/me"), `Bearer ${GOOD_TOKEN}`, "以固定的 /api/v1/me 驗證");
    const t = textOf(set);
    assert.match(t, /Token 已通過驗證並設定/);
    assert.match(t, /t\*\*\*@example\.com/);
    assert.match(t, /只存在這個本機 MCP server 程序的記憶體/);
    assert.match(t, /重新啟動後需要重新貼上/);
    assert.match(t, /其他對話也可能共用/);
    assert.match(t, /仍留在對話與工具呼叫紀錄中/);
    assert.match(t, /無法從 Token 判斷有效期限/);
    assert.doesNotMatch(t, /只限這段|只在這段對話|已確認.*短效|短效.*已驗證|限縮/);
    assertNo(set, GOOD_TOKEN);

    const q = await call("openfun_query_records", { slug: COMPANY_SLUG });
    assert.equal(q.isError, undefined, textOf(q));
    assert.equal(authOf(`${DETAIL_PATH}/records`), `Bearer ${GOOD_TOKEN}`);
    assertNo(q, GOOD_TOKEN);

    const cfg = await call("openfun_check_config");
    assert.match(textOf(cfg), /"token_source": "對話中設定（只存在本機 MCP server 記憶體/);
  } finally {
    await close();
  }
});

test("上游拒絕、格式錯誤、redirect、伺服器錯誤：保留先前的 Token 與快取，不洩漏新舊 Token", async () => {
  const { call, close } = await connect({ token: ALT_TOKEN, tokenSource: "credentials-file" });
  try {
    await call("openfun_query_records", { slug: COMPANY_SLUG });
    const details = count(DETAIL_PATH);

    for (const [bad, re] of [
      [EXPIRED_TOKEN, /Token 已過期/],
      [INVALID_TOKEN, /Token 無效或已撤銷/],
    ]) {
      const r = await call("openfun_set_token", { token: bad });
      assert.equal(r.isError, true);
      assert.match(textOf(r), /新 Token 未套用，目前狀態維持不變/);
      assert.match(textOf(r), re);
      assert.ok(textOf(r).includes(PROMPT), "對話方式設定失敗時，提示仍包含對話選項的固定說法");
      assert.doesNotMatch(textOf(r), /不代表「查無資料」/);
      assertNo(r, bad, ALT_TOKEN);
    }

    const beforeFormat = count("/api/v1/me");
    for (const [bad, re] of [
      [`Bearer ${GOOD_TOKEN}`, /不需要加「Bearer」/],
      ["ofk_short", /太短/],
      ["ofk_has space in the middle 1234", /空白、換行/],
      ["   ", /沒有收到 Token/],
    ]) {
      const r = await call("openfun_set_token", { token: bad });
      assert.equal(r.isError, true, bad);
      assert.match(textOf(r), re);
      assertNo(r, ALT_TOKEN, GOOD_TOKEN);
    }
    assert.equal(count("/api/v1/me"), beforeFormat, "格式錯誤時不連網驗證");

    // /api/v1/me 回 redirect、500、HTTP 200 但格式不符：都不取代
    let stolen = 0;
    api.setOverride("/steal", (_req, res) => (stolen++, sendMock(res, 200, {})));
    for (const handler of [
      (_req, res) => (res.writeHead(302, { Location: `${api.url}/steal` }), res.end()),
      (_req, res) => sendMock(res, 500, { error: "boom" }),
      (req, res) => sendMock(res, 200, { email: 1, display_name: req.headers.authorization }),
    ]) {
      api.setOverride("/api/v1/me", handler);
      const r = await call("openfun_set_token", { token: ALT_TOKEN_2 });
      assert.equal(r.isError, true, textOf(r));
      assertNo(r, ALT_TOKEN_2, ALT_TOKEN);
    }
    api.clearOverrides();
    assert.equal(stolen, 0, "不跟隨 redirect");

    // 長度超過上限：由參數驗證拒絕，錯誤不回顯輸入
    const huge = "Z".repeat(5000);
    const tooLong = await call("openfun_set_token", { token: huge });
    assert.equal(tooLong.isError, true);
    assertNo(tooLong, huge.slice(0, 64));

    const q = await call("openfun_query_records", { slug: COMPANY_SLUG });
    assert.equal(q.isError, undefined, textOf(q));
    assert.equal(authOf(`${DETAIL_PATH}/records`), `Bearer ${ALT_TOKEN}`, "失敗後仍使用原本的 Token");
    assert.equal(count(DETAIL_PATH), details, "失敗的設定不清除原 Token 的 schema 快取");
    assert.match(textOf(await call("openfun_check_config")), /本機設定檔/);
  } finally {
    api.clearOverrides();
    await close();
  }
});

test("取代 Token：schema 快取依 Token 隔離，新 Token 重新取得資料集資訊", async () => {
  const { call, close } = await connect({ token: ALT_TOKEN, tokenSource: "env" });
  try {
    await call("openfun_query_records", { slug: COMPANY_SLUG });
    const n = count(DETAIL_PATH);
    await call("openfun_aggregate", { slug: COMPANY_SLUG, group_by: "縣市" });
    assert.equal(count(DETAIL_PATH), n, "同一個 Token 內使用快取");

    const set = await call("openfun_set_token", { token: ALT_TOKEN_2 });
    assert.match(textOf(set), /已取代先前的 Token（來源：環境變數/);
    assertNo(set, ALT_TOKEN, ALT_TOKEN_2);
    await call("openfun_query_records", { slug: COMPANY_SLUG });
    assert.equal(count(DETAIL_PATH), n + 1, "換 Token 後不沿用舊 Token 取得的 schema");
    assert.equal(authOf(DETAIL_PATH), `Bearer ${ALT_TOKEN_2}`);
    assert.equal(authOf(`${DETAIL_PATH}/records`), `Bearer ${ALT_TOKEN_2}`);
  } finally {
    await close();
  }
});

test("清除：本程序不再有 Token、不改用啟動時的來源；之後可再設定", async () => {
  const { call, close } = await connect({ token: ALT_TOKEN, tokenSource: "credentials-file" });
  try {
    const clear = await call("openfun_clear_token");
    assert.notEqual(clear.isError, true);
    const t = textOf(clear);
    assert.match(t, /已清除本程序記憶體中的 Token（原來源：本機設定檔/);
    assert.match(t, /不會改用設定檔或環境變數/);
    assert.match(t, /不會刪除對話紀錄中的 Token，也不會撤銷 Token/);
    assert.match(t, /重新啟動 Codex 後可能再次載入/);
    assertNo(clear, ALT_TOKEN);

    const before = api.requests.length;
    for (const tool of ["openfun_query_records", "openfun_check_config"]) {
      const r = await call(tool, tool === "openfun_check_config" ? {} : { slug: COMPANY_SLUG });
      assert.equal(r.isError, true);
      assert.match(textOf(r), /已清除這次執行中的 Token/);
      assert.ok(textOf(r).includes(PROMPT));
    }
    assert.equal(api.requests.length, before, "清除後不送出需要認證的請求");
    assert.match(textOf(await call("openfun_clear_token")), /目前沒有有效的 Token/);

    await call("openfun_set_token", { token: ALT_TOKEN_2 });
    const q = await call("openfun_query_records", { slug: COMPANY_SLUG });
    assert.equal(q.isError, undefined);
    assert.equal(authOf(`${DETAIL_PATH}/records`), `Bearer ${ALT_TOKEN_2}`);
  } finally {
    await close();
  }
});

test("並行：慢查詢在 Token 被取代或清除後，仍遮蔽它使用的舊 Token；新查詢遮蔽新 Token", async () => {
  // 回應中直接帶出收到的 Token（不含 ofk_ 或 Bearer 字樣，只能靠實際 Token 值遮蔽）
  let release;
  const gate = new Promise((r) => (release = r));
  let arrived;
  const reached = new Promise((r) => (arrived = r));
  const reflect = (slow) => async (req, res) => {
    const used = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (slow) {
      arrived();
      await gate;
    }
    sendMock(res, 400, { error: `token=${used}`, message: `you sent ${used}`, echo: used });
  };
  api.setOverride("/api/v1/datasets/tw.test~err~slowreflect", reflect(true));
  api.setOverride("/api/v1/datasets/tw.test~err~reflectnow", reflect(false));
  const { call, close } = await connect({ token: ALT_TOKEN, tokenSource: "env" });
  try {
    const slow = call("openfun_get_dataset", { slug: "tw.test~err~slowreflect" });
    await reached;
    assert.notEqual((await call("openfun_set_token", { token: ALT_TOKEN_2 })).isError, true);
    release();
    const r = await slow;
    assert.equal(r.isError, true);
    assert.equal(authOf("/api/v1/datasets/tw.test~err~slowreflect"), `Bearer ${ALT_TOKEN}`, "慢查詢用的是開始時的 Token");
    assert.match(textOf(r), /\[已遮蔽\]/);
    assertNo(r, ALT_TOKEN, ALT_TOKEN_2);

    const now = await call("openfun_get_dataset", { slug: "tw.test~err~reflectnow" });
    assert.equal(authOf("/api/v1/datasets/tw.test~err~reflectnow"), `Bearer ${ALT_TOKEN_2}`);
    assertNo(now, ALT_TOKEN_2);

    // 清除時進行中的查詢
    let release2;
    const gate2 = new Promise((r) => (release2 = r));
    let arrived2;
    const reached2 = new Promise((r) => (arrived2 = r));
    api.setOverride("/api/v1/datasets/tw.test~err~slowreflect", async (req, res) => {
      arrived2();
      await gate2;
      const used = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      sendMock(res, 400, { error: `token=${used}` });
    });
    const slow2 = call("openfun_get_dataset", { slug: "tw.test~err~slowreflect" });
    await reached2;
    await call("openfun_clear_token");
    release2();
    assertNo(await slow2, ALT_TOKEN_2);
  } finally {
    release?.();
    api.clearOverrides();
    await close();
  }
});

test("並行：設定依呼叫順序生效，較慢的先前設定不會覆蓋之後的設定", async () => {
  api.setOverride("/api/v1/me", async (req, res) => {
    if (req.headers.authorization === `Bearer ${ALT_TOKEN}`) await new Promise((r) => setTimeout(r, 300));
    sendMock(res, 200, { email: "tester@example.com", display_name: "測試者" });
  });
  const { call, close } = await connect();
  try {
    const [a, b] = await Promise.all([call("openfun_set_token", { token: ALT_TOKEN }), call("openfun_set_token", { token: ALT_TOKEN_2 })]);
    assert.notEqual(a.isError, true);
    assert.notEqual(b.isError, true);
    api.clearOverrides();
    await call("openfun_query_records", { slug: COMPANY_SLUG });
    assert.equal(authOf(`${DETAIL_PATH}/records`), `Bearer ${ALT_TOKEN_2}`, "最後呼叫的設定生效");

    // 設定進行中呼叫清除：清除排在設定之後
    api.setOverride("/api/v1/me", async (_req, res) => {
      await new Promise((r) => setTimeout(r, 200));
      sendMock(res, 200, { email: "tester@example.com", display_name: "測試者" });
    });
    await Promise.all([call("openfun_set_token", { token: ALT_TOKEN }), call("openfun_clear_token")]);
    const r = await call("openfun_query_records", { slug: COMPANY_SLUG });
    assert.equal(r.isError, true);
    assert.match(textOf(r), /已清除/);
  } finally {
    api.clearOverrides();
    await close();
  }
});

// ---------- 打包後的 server（Codex 啟動方式）：原始 stdout／stderr、檔案系統 ----------

const entry = fileURLToPath(new URL("../build/codex-plugin/server/index.mjs", import.meta.url));

/** 以原始 JSON-RPC 驅動 server，保留 stdout／stderr 的完整位元組 */
function rawServer(env) {
  const child = spawn(process.execPath, [entry, "--host=codex"], { env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let buf = "";
  const pending = new Map();
  child.stdout.on("data", (d) => {
    stdout += d;
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      pending.get(msg.id)?.(msg);
    }
  });
  child.stderr.on("data", (d) => (stderr += d));
  let id = 0;
  const request = (method, params) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return {
    request,
    notify: (method) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n"),
    call: (name, args = {}) => request("tools/call", { name, arguments: args }),
    close: () => new Promise((r) => (child.on("exit", r), child.stdin.end())),
    output: () => ({ stdout, stderr }),
  };
}

test("打包後的 Codex server：stdout／stderr 不含 Token，不寫任何檔案，重新啟動後需要重貼", async () => {
  assert.ok(existsSync(entry), "請先執行 npm run build");
  const home = mkdtempSync(join(tmpdir(), "openfun-chat-token-"));
  const env = { PATH: process.env.PATH, HOME: home, OPENFUN_DEV_BASE_URL: api.url, OPENFUN_DEV_TIMEOUT_MS: "3000" };
  try {
    const s = rawServer(env);
    await s.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "1" } });
    s.notify("notifications/initialized");
    const list = await s.request("tools/list", {});
    assert.equal(list.result.tools.length, 11);
    const bad = await s.call("openfun_set_token", { token: EXPIRED_TOKEN });
    assert.equal(bad.result.isError, true);
    const ok = await s.call("openfun_set_token", { token: GOOD_TOKEN });
    assert.notEqual(ok.result.isError, true, JSON.stringify(ok));
    const q = await s.call("openfun_query_records", { slug: COMPANY_SLUG });
    assert.equal(q.result.isError, undefined);
    await s.call("openfun_set_token", { token: ALT_TOKEN });
    await s.call("openfun_clear_token");
    await s.close();
    const { stdout, stderr } = s.output();
    for (const t of [GOOD_TOKEN, EXPIRED_TOKEN, ALT_TOKEN]) {
      assert.ok(!stdout.includes(t), "stdout（MCP 回應）不可含 Token");
      assert.ok(!stderr.includes(t), "stderr 不可含 Token");
    }
    assert.match(stderr, /Token：未設定；宿主：Codex；來源：none/);
    assert.deepEqual(readdirSync(home), [], "不可在 HOME 寫入任何檔案");

    const again = rawServer(env);
    await again.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "1" } });
    again.notify("notifications/initialized");
    const r = await again.call("openfun_check_config");
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /這次執行中還沒有設定 Token/);
    await again.close();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("文件：三份說明的下載連結都指向目前版本；Codex 預設在安裝時以 setup.mjs 存本機，對話 Token 為選用，不要求限縮權限", async () => {
  const { readFileSync } = await import("node:fs");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const read = (rel) => readFileSync(join(root, rel), "utf8");
  const { version } = JSON.parse(read("package.json"));
  const docs = { "README.md": read("README.md"), "codex/README.md": read("codex/README.md"), "docs/CLAUDE_DESKTOP.md": read("docs/CLAUDE_DESKTOP.md") };
  for (const [name, md] of Object.entries(docs)) {
    const tags = [...md.matchAll(/releases\/(?:download|tag)\/v([0-9.]+)/g)].map((m) => m[1]);
    assert.ok(tags.length > 0, name);
    assert.deepEqual([...new Set(tags)], [version], `${name} 的下載連結版本`);
    assert.doesNotMatch(md, /限縮|最小權限/, name);
  }
  for (const f of ["openfun-claude-extension.mcpb", "openfun-chat-plugin.zip"]) assert.ok(docs["docs/CLAUDE_DESKTOP.md"].includes(`download/v${version}/${f}`));
  for (const f of ["openfun-claude-extension.mcpb", "openfun-chat-plugin.zip", "openfun-codex-plugin.zip"]) assert.ok(docs["README.md"].includes(`download/v${version}/${f}`));
  assert.ok(docs["codex/README.md"].includes(`download/v${version}/openfun-codex-plugin.zip`));
  // Codex 預設：安裝指令接著執行 setup.mjs 存本機；對話短效 Token 是另一章的選用方式
  const install = /codex plugin marketplace add [^\n]+\n\s*codex plugin add openfun-data@openfun\n\s*node [^\n]*setup\.mjs"?\n/;
  for (const name of ["README.md", "codex/README.md"]) assert.match(docs[name], install, `${name} 的安裝指令包含 setup.mjs`);
  const codex = docs["codex/README.md"];
  const optional = codex.indexOf("## 選用：在對話中使用短效 Token");
  assert.ok(optional > 0);
  assert.ok(!codex.slice(0, optional).includes(PROMPT), "主要流程不請使用者把 Token 貼到對話");
  assert.ok(codex.slice(optional).includes(PROMPT));
  assert.match(codex, /沒有加密/);
  assert.match(codex, /重新啟動後需要重新貼上/);
  assert.match(codex, /setup\.mjs --remove`：刪除本機設定檔/);
  assert.match(codex, /不會刪除設定檔或聊天紀錄，也不會撤銷 Token/);
  assert.doesNotMatch(codex + docs["README.md"], /進階/);
  assert.doesNotMatch(docs["README.md"], /都.{0,6}不要把 Token 貼到聊天|尚未支援/);
});
