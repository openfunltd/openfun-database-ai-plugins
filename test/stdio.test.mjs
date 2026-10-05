import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startMockApi, GOOD_TOKEN } from "./helpers/mock-api.mjs";
import { runStdioLifecycle } from "./helpers/stdio-lifecycle.mjs";

const entry = fileURLToPath(new URL("../build/bundle/server/index.mjs", import.meta.url));
let api;
before(async () => {
  assert.ok(existsSync(entry), "請先執行 npm run build");
  api = await startMockApi();
});
after(async () => {
  await api.close();
});

test("stdio：initialize / tools/list / tools/call / close", async () => {
  const before = api.requests.length;
  const { stderr } = await runStdioLifecycle({ args: [entry], apiUrl: api.url });
  assert.match(stderr, /已啟動（服務：http:\/\/127\.0\.0\.1:\d+，開發模式；Token：已設定）/);
  const sent = api.requests.slice(before);
  assert.ok(sent.length >= 3);
  for (const r of sent) assert.ok(!r.rawUrl.includes(GOOD_TOKEN));
  assert.ok(sent.filter((r) => r.path.startsWith("/api/v1/datasets")).every((r) => r.headers.authorization === `Bearer ${GOOD_TOKEN}`));
});

test("stdio：未設定 Token 仍可啟動，需要 Token 的工具回 isError", async () => {
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { OPENFUN_API_TOKEN: "${user_config.api_token}", OPENFUN_DEV_BASE_URL: api.url },
    stderr: "pipe",
  });
  const client = new Client({ name: "t", version: "1" });
  await client.connect(transport);
  try {
    const r = await client.callTool({ name: "openfun_query_records", arguments: { slug: "tw.test~ref~company" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /尚未設定/);
  } finally {
    await client.close();
  }
});

test("stdio：開發覆寫指向非 loopback 時拒絕啟動", async () => {
  const child = spawn(process.execPath, [entry], {
    env: { PATH: process.env.PATH, OPENFUN_API_TOKEN: GOOD_TOKEN, OPENFUN_DEV_BASE_URL: "https://evil.example" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (d) => (err += d));
  const code = await new Promise((r) => child.on("exit", r));
  assert.equal(code, 1);
  assert.match(err, /只允許本機 loopback/);
  assert.ok(!err.includes(GOOD_TOKEN));
});
