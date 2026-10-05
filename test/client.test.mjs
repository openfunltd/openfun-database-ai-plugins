import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { OpenFunClient, paths } from "../build/lib/client.js";
import { formatError } from "../build/lib/errors.js";
import { EXPIRED_TOKEN, GOOD_TOKEN, INVALID_TOKEN, QUOTA_TOKEN, startMockApi } from "./helpers/mock-api.mjs";

let api;
before(async () => {
  api = await startMockApi();
});
after(async () => {
  await api.close();
});

const client = (token = GOOD_TOKEN, extra = {}) => new OpenFunClient({ baseUrl: api.url, token, timeoutMs: 1000, ...extra });
const last = () => api.requests[api.requests.length - 1];
const rejectsKind = (p, kind) => assert.rejects(p, (e) => e.kind === kind || assert.fail(`預期 ${kind}，實際 ${e.kind}: ${e.message}`));

test("各路由固定、需要時送出 Authorization: Bearer header", async () => {
  await client().getJson(paths.me(), { auth: "required" });
  assert.equal(last().path, "/api/v1/me");
  assert.equal(last().headers.authorization, `Bearer ${GOOD_TOKEN}`);
  assert.match(last().headers["user-agent"], /^openfun-claude-extension\//);

  await client().getJson(paths.search(), { query: "q=%E5%85%AC%E5%8F%B8", auth: "optional" });
  assert.equal(last().path, "/api/v1/search");
  assert.equal(last().headers.authorization, `Bearer ${GOOD_TOKEN}`, "search 帶 Token 才能看到使用者可用資料");

  await client().getText(paths.llms(), { auth: "none" });
  assert.equal(last().path, "/llms.txt");
  assert.equal(last().headers.authorization, undefined, "llms.txt 不需要 Token");

  await client().getText(paths.skill("tw.test~ref~company"), { auth: "optional" });
  assert.equal(last().path, "/datasets/tw.test~ref~company/skill.md");

  await client().getJson(paths.record("tw.test~ref~company", "臺北 1號"), { auth: "required" });
  assert.equal(last().rawUrl, "/api/v1/datasets/tw.test~ref~company/records/%E8%87%BA%E5%8C%97%201%E8%99%9F");
  for (const r of api.requests) assert.ok(!r.rawUrl.includes(GOOD_TOKEN), "Token 不可出現在 URL");
});

test("slug 與 record id 驗證，無法組出任意路徑", () => {
  for (const bad of ["../etc", "A-upper", "a/b", "https://evil.example", "", "a?x=1", "a#b", "%2e%2e"]) {
    assert.throws(() => paths.dataset(bad), (e) => e.kind === "validation", bad);
  }
  for (const bad of ["..", ".", "a/b", "a\\b", "x\n"]) {
    assert.throws(() => paths.record("tw.test~ref~company", bad), (e) => e.kind === "validation", bad);
  }
});

test("未設定 Token 時不送出需要認證的請求", async () => {
  const before = api.requests.length;
  await rejectsKind(new OpenFunClient({ baseUrl: api.url, token: null }).getJson(paths.me(), { auth: "required" }), "not_configured");
  assert.equal(api.requests.length, before);
});

test("401 區分 Token 過期、無效", async () => {
  await rejectsKind(client(EXPIRED_TOKEN).getJson(paths.me(), { auth: "required" }), "token_expired");
  await rejectsKind(client(INVALID_TOKEN).getJson(paths.me(), { auth: "required" }), "token_invalid");
});

test("403 權限不足、404 找不到、400 參數錯誤保留輔助欄位", async () => {
  await rejectsKind(client().getJson(paths.dataset("tw.test~ref~private"), { auth: "required" }), "forbidden");
  await rejectsKind(client().getJson(paths.dataset("tw.test~ref~missing"), { auth: "required" }), "not_found");
  await assert.rejects(client().getJson(paths.agg("tw.test~ref~company"), { query: "group_by=%E4%B8%8D%E5%AD%98%E5%9C%A8", auth: "required" }), (e) => {
    assert.equal(e.kind, "bad_request");
    assert.deepEqual(e.details.available_group_by_fields, ["縣市", "營業地址.縣市"]);
    return true;
  });
});

test("429 區分每日額度與頻率限制", async () => {
  await rejectsKind(client(QUOTA_TOKEN).getJson(paths.records("tw.test~ref~company"), { auth: "required" }), "quota_exceeded");
  await assert.rejects(client().getJson(paths.records("tw.test~ref~rate"), { auth: "required" }), (e) => {
    assert.equal(e.kind, "rate_limited");
    assert.equal(e.details.retry_after, "120");
    return true;
  });
});

test("500、HTML 錯誤頁、200 但非 JSON", async () => {
  await rejectsKind(client().getJson(paths.dataset("tw.test~err~500"), { auth: "required" }), "server_error");
  await assert.rejects(client().getJson(paths.dataset("tw.test~err~html"), { auth: "required" }), (e) => {
    assert.equal(e.kind, "server_error");
    const text = formatError(e, GOOD_TOKEN);
    assert.ok(!/<html|<script|secret/i.test(text), "不可回傳原始 HTML");
    return true;
  });
  await rejectsKind(client().getJson(paths.dataset("tw.test~err~nonjson"), { auth: "required" }), "invalid_response");
});

test("逾時", async () => {
  await rejectsKind(client(GOOD_TOKEN, { timeoutMs: 200 }).getJson(paths.dataset("tw.test~err~slow"), { auth: "required" }), "timeout");
});

test("網路失敗", async () => {
  const dead = createServer();
  await new Promise((r) => dead.listen(0, "127.0.0.1", r));
  const port = dead.address().port;
  await new Promise((r) => dead.close(r));
  await rejectsKind(new OpenFunClient({ baseUrl: `http://127.0.0.1:${port}`, token: GOOD_TOKEN }).getJson(paths.me(), { auth: "required" }), "network");
});

test("不跟隨 redirect，Token 不會送到其他主機", async () => {
  const other = [];
  const evil = createServer((req, res) => {
    other.push(req.headers);
    res.end("{}");
  });
  await new Promise((r) => evil.listen(0, "127.0.0.1", r));
  api.setOverride("__redirect_target__", `http://127.0.0.1:${evil.address().port}/steal`);
  try {
    await rejectsKind(client().getJson(paths.dataset("tw.test~err~redirect"), { auth: "required" }), "redirect");
    assert.equal(other.length, 0, "redirect 目標不應收到任何請求");
  } finally {
    await new Promise((r) => evil.close(r));
  }
});

test("回應大小上限", async () => {
  await rejectsKind(client(GOOD_TOKEN, { maxResponseBytes: 1000 }).getText(paths.skill("tw.test~ref~company"), { auth: "optional" }), "too_large");
});

test("API 錯誤訊息中的 Token 與 HTML 會被清除", async () => {
  await assert.rejects(client().getJson(paths.dataset("tw.test~err~reflect"), { auth: "required" }), (e) => {
    const text = formatError(e, GOOD_TOKEN);
    assert.ok(!text.includes(GOOD_TOKEN));
    assert.ok(!text.includes("<b>"));
    assert.ok(text.includes("[已遮蔽]"));
    return true;
  });
});
