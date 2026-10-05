// 回應大小上限回歸測試：所有成功回應的 text 總長（遮蔽後、含 summary、來源、wrapper、排版 JSON）
// 不得超過 MAX_TOOL_TEXT_CHARS；記錄只顯示能完整放入者並標示 omitted；其他過大內容回 isError。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../build/lib/server.js";
import { MAX_TOOL_TEXT_CHARS, EXTERNAL_BEGIN, EXTERNAL_END, external, fitItems, json, ok } from "../build/lib/format.js";
import { COMPANY_SLUG, GOOD_TOKEN, makeManyRecord, makeWideRecord, startMockApi } from "./helpers/mock-api.mjs";

const textOf = (r) => r.content.map((c) => c.text).join("");
const totalSize = (r) => r.content.reduce((n, c) => n + c.text.length, 0);
/** 取出外部內容標記中的 JSON 並解析（確認沒有被截成半段） */
function parseExternalJson(r) {
  const block = r.content.find((c) => c.text.startsWith(EXTERNAL_BEGIN));
  assert.ok(block, "應有外部內容區塊");
  const inner = block.text.slice(EXTERNAL_BEGIN.length + 1, block.text.length - EXTERNAL_END.length - 1);
  return JSON.parse(inner);
}

// ---------- 單元：fitItems / ok ----------

const renderRecords = (shown, info) => [`顯示 ${info.shown} 筆，未顯示 ${info.omitted} 筆`, external(json({ info, records: shown }))];

test("fitItems：單筆含 10000 個短物件的記錄不會被放行（review 重現案例）", () => {
  const record = { items: Array.from({ length: 10000 }, (_, i) => ({ id: i, text: "公共資料".repeat(8) })) };
  assert.ok(JSON.stringify(record).length > 500_000);
  const fit = fitItems([record], renderRecords, null);
  assert.equal(fit.shown, 0);
  assert.equal(fit.omitted, 1);
  assert.ok(fit.blocks.reduce((n, b) => n + b.length, 0) <= MAX_TOOL_TEXT_CHARS);
});

test("fitItems：大量由短字串陣列組成的記錄，只放入完整記錄且總長在上限內", () => {
  const records = Array.from({ length: 100 }, (_, i) => makeManyRecord(i + 1));
  const fit = fitItems(records, renderRecords, null);
  assert.ok(fit.shown > 0 && fit.shown < 100, `shown=${fit.shown}`);
  assert.equal(fit.shown + fit.omitted, 100);
  const size = fit.blocks.reduce((n, b) => n + b.length, 0);
  assert.ok(size <= MAX_TOOL_TEXT_CHARS, `size=${size}`);
  // 再多一筆就會超過：確認是「能放的最大值」而不是保守估計
  const more = renderRecords(records.slice(0, fit.shown + 1), { shown: fit.shown + 1, omitted: fit.omitted - 1, shortened: 0 });
  assert.ok(more.reduce((n, b) => n + b.length, 0) > MAX_TOOL_TEXT_CHARS);
  const inner = fit.blocks[1].slice(EXTERNAL_BEGIN.length + 1, fit.blocks[1].length - EXTERNAL_END.length - 1);
  const parsed = JSON.parse(inner);
  assert.deepEqual(parsed.records, records.slice(0, fit.shown), "放入的記錄必須完整、未被改動");
});

test("fitItems：長字串記錄先縮短並標記，讓更多筆完整列出", () => {
  // 原始資料連 3 筆都放不下；縮短後 20 筆可全部完整列出
  const records = Array.from({ length: 20 }, (_, i) => ({ id: i, 全文: "長".repeat(20000) }));
  const fit = fitItems(records, renderRecords, null);
  assert.equal(fit.shown, 20);
  assert.equal(fit.omitted, 0);
  assert.equal(fit.shortened, 20);
  assert.match(fit.blocks[1], /本欄位已截斷：原長 20000 字/);
});

test("ok：總長超過上限一律丟 too_large；剛好等於上限可通過；遮蔽後計算", () => {
  assert.throws(() => ok(null, ["x".repeat(MAX_TOOL_TEXT_CHARS + 1)], "請縮小"), (e) => e.kind === "too_large" && e.hint === "請縮小");
  assert.throws(() => ok(null, ["x".repeat(30_000), "y".repeat(30_001)], "請縮小"), (e) => e.kind === "too_large");
  assert.equal(ok(null, ["x".repeat(MAX_TOOL_TEXT_CHARS)], "h").content[0].text.length, MAX_TOOL_TEXT_CHARS);
  // 30 字的 Token 遮蔽成 [已遮蔽]（5 字）後才計算大小
  const r = ok(GOOD_TOKEN, [GOOD_TOKEN + "x".repeat(MAX_TOOL_TEXT_CHARS - 10)], "h");
  assert.ok(!r.content[0].text.includes(GOOD_TOKEN));
});

// ---------- 工具層 ----------

let api;
let client;
before(async () => {
  api = await startMockApi();
  const server = createServer({ baseUrl: api.url, token: GOOD_TOKEN, tokenProblem: null, timeoutMs: 3000, isDevOverride: true });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "limits", version: "1" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});
after(async () => {
  await client.close();
  await api.close();
});

const call = (name, args) => client.callTool({ name, arguments: args });

test("query_records：100 筆短字串陣列記錄，只顯示能完整放入者並標明 omitted 範圍", async () => {
  const r = await call("openfun_query_records", { slug: "tw.test~ref~many", per_page: 100 });
  assert.equal(r.isError, undefined, textOf(r));
  assert.ok(totalSize(r) <= MAX_TOOL_TEXT_CHARS, `size=${totalSize(r)}`);
  const j = parseExternalJson(r);
  assert.equal(j.records_on_this_page, 100);
  assert.ok(j.records_shown > 0 && j.records_shown < 100);
  assert.equal(j.records.length, j.records_shown);
  assert.equal(j.truncation.omitted_records_on_this_page, 100 - j.records_shown);
  assert.equal(j.truncation.omitted_range, `第 ${j.records_shown + 1}–100 筆`);
  j.records.forEach((rec, i) => assert.deepEqual(rec, makeManyRecord(i + 1), "顯示的記錄必須完整"));
  assert.match(textOf(r), /不可當作不存在/);
});

test("query_records：第一筆就超過上限時 isError，並提供 fields/per_page 建議與網頁來源", async () => {
  const r = await call("openfun_query_records", { slug: "tw.test~ref~wide", per_page: 3 });
  assert.equal(r.isError, true);
  const t = textOf(r);
  assert.ok(t.length <= MAX_TOOL_TEXT_CHARS);
  assert.match(t, /回應過大/);
  assert.match(t, /本頁第 1 筆記錄本身約 \d+ 字/);
  assert.match(t, /fields/);
  assert.match(t, /per_page=1/);
  assert.match(t, /\/datasets\/tw\.test~ref~wide/);
  assert.ok(!t.includes(GOOD_TOKEN));
  // 用 fields 排除大型欄位後可以成功
  const ok2 = await call("openfun_query_records", { slug: "tw.test~ref~wide", per_page: 3, fields: ["統一編號"] });
  assert.equal(ok2.isError, undefined, textOf(ok2));
  assert.equal(parseExternalJson(ok2).records_shown, 3);
});

test("get_record：單筆含 10000 個短物件時 isError 並提供 fields 與網頁；指定 fields 後成功", async () => {
  const r = await call("openfun_get_record", { slug: "tw.test~ref~wide", record_id: "10000001" });
  assert.equal(r.isError, true);
  const t = textOf(r);
  assert.ok(t.length <= MAX_TOOL_TEXT_CHARS);
  assert.match(t, /記錄 10000001 的內容約 \d+ 字，超過單次回應上限 60000 字/);
  assert.match(t, /fields/);
  assert.match(t, /\/datasets\/tw\.test~ref~wide/);
  const ok2 = await call("openfun_get_record", { slug: "tw.test~ref~wide", record_id: "10000001", fields: ["統一編號"] });
  assert.equal(ok2.isError, undefined, textOf(ok2));
  assert.deepEqual(parseExternalJson(ok2).record, { 統一編號: makeWideRecord(1).統一編號 });
  const badField = await call("openfun_get_record", { slug: COMPANY_SLUG, record_id: "1", fields: ["不存在"] });
  assert.equal(badField.isError, true);
});

test("search：大量短字串主體超過上限時 isError，建議減少 per_dataset / max_datasets", async () => {
  const r = await call("openfun_search", { query: "大量", per_dataset: 50, max_datasets: 100 });
  assert.equal(r.isError, true);
  const t = textOf(r);
  assert.ok(t.length <= MAX_TOOL_TEXT_CHARS);
  assert.match(t, /回應過大/);
  assert.match(t, /per_dataset（目前 50）/);
  assert.match(t, /max_datasets（目前 100）/);
  assert.doesNotMatch(t, /沒有找到/);
});

test("list_datasets：大量巢狀短字串超過上限時 isError，建議調小 limit；調小後成功", async () => {
  const r = await call("openfun_list_datasets", { query: "大量", limit: 100 });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /limit 調小（目前 100/);
  const ok2 = await call("openfun_list_datasets", { query: "大量", limit: 10 });
  assert.equal(ok2.isError, undefined, textOf(ok2));
  assert.ok(totalSize(ok2) <= MAX_TOOL_TEXT_CHARS);
  assert.equal(parseExternalJson(ok2).datasets.length, 10);
});

test("get_dataset：3000 欄 schema 超過上限時 isError 並指向 skill 分段與網頁", async () => {
  const r = await call("openfun_get_dataset", { slug: "tw.test~ref~hugeschema" });
  assert.equal(r.isError, true);
  const t = textOf(r);
  assert.match(t, /openfun_get_skill/);
  assert.match(t, /\/datasets\/tw\.test~ref~hugeschema/);
});

test("get_dataset：過長的其他 meta 不截成半段 JSON，改列 key 與大小", async () => {
  const r = await call("openfun_get_dataset", { slug: "tw.test~ref~bigmeta" });
  assert.equal(r.isError, undefined, textOf(r));
  const j = parseExternalJson(r);
  assert.equal(j.other_meta.omitted, true);
  assert.deepEqual(Object.keys(j.other_meta.keys).sort(), ["big_extra", "small"]);
});

test("aggregate：分組結果超過上限時 isError（不部分顯示），建議 filters/group_by", async () => {
  const r = await call("openfun_aggregate", { slug: COMPANY_SLUG, group_by: "超大" });
  assert.equal(r.isError, true);
  const t = textOf(r);
  assert.ok(t.length <= MAX_TOOL_TEXT_CHARS);
  assert.match(t, /filters/);
  assert.doesNotMatch(t, /統計完成/);
});

test("get_skill：max_chars 上限 50000 時總回應仍在上限內", async () => {
  const r = await call("openfun_get_skill", { slug: COMPANY_SLUG, max_chars: 50000 });
  assert.equal(r.isError, undefined);
  assert.ok(totalSize(r) <= MAX_TOOL_TEXT_CHARS);
});

test("guide：超長 llms.txt 截斷為純文字並標示，總回應在上限內", async () => {
  api.setOverride("/llms.txt", (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("說明文字\n".repeat(50000));
  });
  try {
    const r = await call("openfun_guide", {});
    assert.equal(r.isError, undefined);
    assert.ok(totalSize(r) <= MAX_TOOL_TEXT_CHARS, `size=${totalSize(r)}`);
    assert.ok(totalSize(r) > MAX_TOOL_TEXT_CHARS - 1000, "應盡量使用可用空間");
    assert.match(textOf(r), /線上說明過長，已截斷/);
  } finally {
    api.clearOverrides();
  }
});
