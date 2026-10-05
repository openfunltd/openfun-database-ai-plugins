// API 契約測試：HTTP 200 但內容為 {error: …}、{} 或結構不符時，工具一律 isError，
// 不可變成「Token 有效」「查無資料」或統計成功。
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../build/lib/server.js";
import { OpenFunClient, paths } from "../build/lib/client.js";
import { redact } from "../build/lib/errors.js";
import * as contracts from "../build/lib/contracts.js";
import { COMPANY_SLUG, GOOD_TOKEN, sendMock, startMockApi } from "./helpers/mock-api.mjs";

const SLUG = "tw.test~ref~contract";
let api;
let client;
before(async () => {
  api = await startMockApi();
  const server = createServer({ baseUrl: api.url, token: GOOD_TOKEN, tokenProblem: null, timeoutMs: 3000, isDevOverride: true });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "contracts", version: "1" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});
afterEach(() => api.clearOverrides());
after(async () => {
  await client.close();
  await api.close();
});

const textOf = (r) => r.content.map((c) => c.text).join("\n");
const reply200 = (rawPath, body) => api.setOverride(rawPath, (_req, res) => sendMock(res, 200, body));
const call = (name, args) => client.callTool({ name, arguments: args });

async function expectError(name, args, { re, notRe }) {
  const r = await call(name, args);
  assert.equal(r.isError, true, `${name} 應為 isError：${textOf(r)}`);
  const t = textOf(r);
  if (re) assert.match(t, re);
  for (const n of [].concat(notRe ?? [])) assert.doesNotMatch(t, n);
  assert.ok(!t.includes(GOOD_TOKEN));
  return t;
}

test("check_config：HTTP 200 {error: InvalidToken} 不可回報 Token 有效", async () => {
  reply200("/api/v1/me", { error: "InvalidToken", message: "提供的 Bearer Token 無效" });
  const t = await expectError("openfun_check_config", {}, { re: /Token 無效或已撤銷/, notRe: /Token 有效/ });
  assert.match(t, /HTTP 200 回傳錯誤內容/);
});

test("check_config：HTTP 200 {} 或缺少欄位不可回報 Token 有效", async () => {
  for (const body of [{}, { display_name: "x" }, { email: 1, display_name: "x" }, []]) {
    reply200("/api/v1/me", body);
    await expectError("openfun_check_config", {}, { re: /回應格式異常|格式不符預期/, notRe: /Token 有效/ });
  }
});

test("search：{}、{error}、元素格式錯誤不可變成「沒有找到」", async () => {
  for (const body of [
    {},
    { error: "q is required" },
    { datasets: { results: [] } },
    { datasets: { results: [] }, entities: { groups: [] } },
    { datasets: { results: [{ title: "無 slug" }] }, entities: { total: 0, groups: [] } },
    { datasets: { results: [] }, entities: { total: 1, groups: [{ dataset_slug: "x" }] } },
  ]) {
    reply200("/api/v1/search", body);
    await expectError("openfun_search", { query: "公司" }, { notRe: /沒有找到/ });
  }
});

test("search：{error: TooManyRequests} 於 HTTP 200 仍分類為頻率限制", async () => {
  reply200("/api/v1/search", { error: "TooManyRequests", message: "每小時最多可搜尋 60 次" });
  await expectError("openfun_search", { query: "公司" }, { re: /請求過於頻繁/ });
});

test("list_datasets：{}、total 不一致、元素缺 slug 不可變成「沒有符合條件」", async () => {
  for (const body of [{}, { datasets: [] }, { datasets: [], total: 3 }, { datasets: [{ title: "x" }], total: 1 }, { error: "Unauthorized" }]) {
    reply200("/api/v1/datasets", body);
    await expectError("openfun_list_datasets", {}, { notRe: /沒有符合條件的資料集/ });
  }
});

test("get_dataset：{}、slug 不符、缺 meta、schema 非陣列、{error} 皆為 isError", async () => {
  const good = { slug: SLUG, type: "tinydb", title: "t", meta: {} };
  for (const body of [
    {},
    { ...good, slug: "tw.other~x" },
    { ...good, meta: undefined },
    { ...good, meta: { schema: "x" } },
    { ...good, type: undefined },
    { error: "Access denied" },
  ]) {
    reply200(`/api/v1/datasets/${SLUG}`, body);
    await expectError("openfun_get_dataset", { slug: SLUG }, {});
  }
  reply200(`/api/v1/datasets/${SLUG}`, { error: "Access denied" });
  await expectError("openfun_get_dataset", { slug: SLUG }, { re: /權限不足/ });
  reply200(`/api/v1/datasets/${SLUG}`, good);
  const r = await call("openfun_get_dataset", { slug: SLUG });
  assert.equal(r.isError, undefined, textOf(r));
});

test("query_records：缺 total、records 非物件、筆數大於 total、{error} 不可變成查無資料", async () => {
  for (const body of [
    {},
    { records: [] },
    { records: [1, 2], total: 2 },
    { records: [{}, {}], total: 1 },
    { records: [], total: "0" },
    { error: "daily_quota_exceeded" },
  ]) {
    reply200(`/api/v1/datasets/${SLUG}/records`, body);
    await expectError("openfun_query_records", { slug: SLUG }, { notRe: /沒有符合條件的記錄/ });
  }
  reply200(`/api/v1/datasets/${SLUG}/records`, { error: "daily_quota_exceeded" });
  await expectError("openfun_query_records", { slug: SLUG }, { re: /今日查詢額度已用完/ });
});

test("get_record：{}、record 非物件、{error} 皆為 isError", async () => {
  for (const body of [{}, { record: "x" }, { record: [1] }, { error: "Dataset not found" }]) {
    reply200(`/api/v1/datasets/${SLUG}/records/A1`, body);
    await expectError("openfun_get_record", { slug: SLUG, record_id: "A1" }, {});
  }
});

test("aggregate：{}、缺 groups、groups 元素缺 stats、缺 group_by、{error} 不可變成統計成功", async () => {
  const groupCases = [{}, { total_records: 5 }, { total_records: 5, groups: [{ key: "a" }] }, { total_records: 5, groups: [], total_groups: "2" }, { error: "x" }];
  for (const body of groupCases) {
    reply200(`/api/v1/datasets/${SLUG}/agg`, body);
    await expectError("openfun_aggregate", { slug: SLUG, group_by: "縣市" }, { notRe: /統計完成/ });
  }
  reply200(`/api/v1/datasets/${SLUG}/agg`, { total_records: 5, field: "資本額" });
  await expectError("openfun_aggregate", { slug: SLUG, field: "資本額" }, { notRe: /統計完成/ });
  reply200(`/api/v1/datasets/${SLUG}/agg`, { total_records: 0, total_groups: 0, groups: [] });
  const r = await call("openfun_aggregate", { slug: SLUG, group_by: "縣市" });
  assert.equal(r.isError, undefined, textOf(r));
  assert.match(textOf(r), /沒有符合條件的記錄/);
});

test("contracts：正常回應通過", () => {
  assert.deepEqual(contracts.expectMe({ email: null, display_name: null }), { email: null, display_name: null });
  assert.doesNotThrow(() => contracts.expectSearch({ datasets: { total: 0, results: [] }, entities: { total: 0, groups: [] } }));
  assert.doesNotThrow(() => contracts.expectDatasetList({ datasets: [], total: 0 }));
  assert.doesNotThrow(() => contracts.expectRecords({ records: [], total: 0, page: 1, per_page: 20 }));
  assert.doesNotThrow(() => contracts.expectAgg({ total_records: 1, total_groups: 1, groups: [{ key: "臺北市", stats: { count: 1 } }] }));
  assert.throws(() => contracts.expectAgg({ total_records: 1, stats: { count: 1 } }), (e) => e.kind === "invalid_response");
});

// ---------- Token 遮蔽 ----------

test("redact：任何非空 Token 都會被遮蔽（不再有長度門檻）", () => {
  for (const tok of ["a", "ab", "abc", "abcd", GOOD_TOKEN]) {
    const out = redact(`前 ${tok} 後 ${tok}`, tok);
    assert.ok(!out.includes(` ${tok} `), tok);
    assert.match(out, /\[已遮蔽\]/);
  }
});

test("過短 Token 不會被使用：不送 header，工具回報設定問題", async () => {
  const c = new OpenFunClient({ baseUrl: api.url, token: "abc" });
  assert.equal(c.hasToken, false);
  assert.match(c.tokenProblem, /太短/);
  const before = api.requests.length;
  await assert.rejects(c.getJson(paths.me(), { auth: "required" }), (e) => e.kind === "not_configured" && /太短/.test(e.message));
  assert.equal(api.requests.length, before);
  await c.getJson(paths.search(), { query: "q=x", auth: "optional" });
  assert.equal(api.requests.at(-1).headers.authorization, undefined);

  const server = createServer({ baseUrl: api.url, token: "abc", tokenProblem: null, timeoutMs: 3000, isDevOverride: true });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const c2 = new Client({ name: "short", version: "1" });
  await Promise.all([server.connect(st), c2.connect(ct)]);
  try {
    const r = await c2.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(r.isError, true);
    assert.match(textOf(r), /Token 太短/);
  } finally {
    await c2.close();
  }
});
