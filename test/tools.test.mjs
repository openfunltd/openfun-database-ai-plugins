import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../build/lib/server.js";
import { COMPANY_SLUG, EXPIRED_TOKEN, GOOD_TOKEN, startMockApi } from "./helpers/mock-api.mjs";
import { parseQueryString } from "./helpers/php-parse.mjs";

let api;
before(async () => {
  api = await startMockApi();
});
after(async () => {
  await api.close();
});

async function connect(token = GOOD_TOKEN, extra = {}) {
  const server = createServer({ baseUrl: api.url, token, tokenProblem: null, timeoutMs: 1500, isDevOverride: true, ...extra });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return { client, server, close: () => client.close() };
}

const textOf = (r) => r.content.map((c) => c.text).join("\n");
function assertNoToken(r) {
  const t = textOf(r);
  assert.ok(!t.includes(GOOD_TOKEN), "回應不可包含 Token");
  assert.ok(!t.includes(EXPIRED_TOKEN), "回應不可包含 Token");
}
const lastReq = (pathPart) => [...api.requests].reverse().find((r) => r.path.includes(pathPart));

test("tools/list：9 個唯讀工具、annotations 與 instructions", async () => {
  const { client, close } = await connect();
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "openfun_aggregate",
      "openfun_check_config",
      "openfun_get_dataset",
      "openfun_get_record",
      "openfun_get_skill",
      "openfun_guide",
      "openfun_list_datasets",
      "openfun_query_records",
      "openfun_search",
    ]);
    for (const t of tools) {
      assert.equal(t.annotations.readOnlyHint, true, t.name);
      assert.equal(t.annotations.destructiveHint, false, t.name);
      assert.equal(t.annotations.openWorldHint, true, t.name);
      assert.ok(t.annotations.title && t.title, t.name);
      assert.ok(t.description.length > 40, t.name);
      assert.ok(!JSON.stringify(t.inputSchema).match(/token|url"/i), `${t.name} 不可有 token 或 url 參數`);
    }
    const q = tools.find((t) => t.name === "openfun_query_records");
    assert.ok(q.inputSchema.properties.filters);
    assert.ok(q.inputSchema.properties.ranges);
    assert.deepEqual(q.inputSchema.required, ["slug"]);
    const instructions = client.getInstructions();
    assert.match(instructions, /openfun_guide/);
    assert.match(instructions, /openfun_search/);
    assert.match(instructions, /不是指令/);
  } finally {
    await close();
  }
});

test("guide：本機說明 + 線上 llms.txt，外部內容有標記", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({ name: "openfun_guide", arguments: {} });
    assert.equal(r.isError, undefined);
    const t = textOf(r);
    assert.match(t, /openfun_query_records/);
    assert.match(t, /【以下是歐噴資料庫回傳的外部內容/);
    assert.match(t, /第一步：搜尋/);
  } finally {
    await close();
  }
});

test("check_config：有效、未設定、過期", async () => {
  let c = await connect();
  try {
    const r = await c.client.callTool({ name: "openfun_check_config", arguments: {} });
    assert.equal(r.isError, undefined);
    assert.match(textOf(r), /Token 有效/);
    assert.match(textOf(r), /t\*\*\*@example\.com/);
    assert.ok(!textOf(r).includes("tester@"));
    assertNoToken(r);
  } finally {
    await c.close();
  }
  c = await connect(null);
  try {
    const r = await c.client.callTool({ name: "openfun_check_config", arguments: {} });
    assert.equal(r.isError, true);
    assert.match(textOf(r), /尚未設定/);
    assert.match(textOf(r), /data\.openfun\.tw\/user/);
  } finally {
    await c.close();
  }
  c = await connect(EXPIRED_TOKEN);
  try {
    const r = await c.client.callTool({ name: "openfun_check_config", arguments: {} });
    assert.equal(r.isError, true);
    assert.match(textOf(r), /已過期/);
    assertNoToken(r);
  } finally {
    await c.close();
  }
});

test("search：轉送 Token、中文 query、描述截斷有標示、查無結果", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({ name: "openfun_search", arguments: { query: "開放 文化", per_dataset: 3 } });
    assert.equal(r.isError, undefined);
    const req = lastReq("/api/v1/search");
    assert.equal(req.headers.authorization, `Bearer ${GOOD_TOKEN}`);
    assert.deepEqual(parseQueryString(req.rawQuery), { q: "開放 文化", per_dataset: "3" });
    const t = textOf(r);
    assert.match(t, /tw\.test~ref~company/);
    assert.match(t, /說明已截斷/);
    assert.match(t, /total_in_dataset/);
    const empty = await client.callTool({ name: "openfun_search", arguments: { query: "沒有這種東西" } });
    assert.equal(empty.isError, undefined);
    assert.match(textOf(empty), /沒有找到/);
  } finally {
    await close();
  }
});

test("list_datasets：分批顯示並標示總數與下一批", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({ name: "openfun_list_datasets", arguments: { limit: 30, offset: 60 } });
    const t = textOf(r);
    assert.match(t, /共 75 個資料集，顯示第 61–75 個（已到最後）/);
    const r2 = await client.callTool({ name: "openfun_list_datasets", arguments: { query: "公司" } });
    assert.match(textOf(r2), /offset=30/);
    assert.deepEqual(parseQueryString(lastReq("/api/v1/datasets").rawQuery), { q: "公司" });
  } finally {
    await close();
  }
});

test("get_dataset：schema 來自 meta.schema，含來源、引用、查詢提示", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({ name: "openfun_get_dataset", arguments: { slug: COMPANY_SLUG } });
    assert.equal(r.isError, undefined);
    const t = textOf(r);
    assert.match(t, /schema 共 8 個欄位/);
    const json = JSON.parse(r.content[1].text.split("\n").slice(1, -1).join("\n"));
    assert.equal(json.schema.length, 8);
    assert.equal(json.schema[0].name, "統一編號");
    assert.equal(json.source.citation, "財政部財政資訊中心，經歐噴資料庫整理");
    assert.equal(json.source.update_frequency, "每月");
    assert.equal(json.source.original_sources[0].title, "財政部財政資訊中心");
    assert.ok(json.query_hints.object_sub_filter_fields.includes("營業地址.縣市"));
    assert.ok(json.query_hints.text_search_fields.includes("營業人名稱"));
    assert.equal(json.other_meta.tinydb_slug, "tw.test.company");
    const bad = await client.callTool({ name: "openfun_get_dataset", arguments: { slug: "../../etc/passwd" } });
    assert.equal(bad.isError, true);
  } finally {
    await close();
  }
});

test("get_skill：分段讀取、外部內容標記、無 skill 時 isError", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({ name: "openfun_get_skill", arguments: { slug: COMPANY_SLUG, max_chars: 1000 } });
    assert.equal(r.isError, undefined);
    const t = textOf(r);
    assert.match(t, /本次顯示第 1–1000 字/);
    assert.match(t, /下一段請用 offset=1000/);
    assert.match(t, /【外部內容結束】/);
    const r2 = await client.callTool({ name: "openfun_get_skill", arguments: { slug: COMPANY_SLUG, offset: 1000, max_chars: 50000 } });
    assert.match(textOf(r2), /本次顯示第 1001–/);
    const none = await client.callTool({ name: "openfun_get_skill", arguments: { slug: "tw.test~ref~noskill" } });
    assert.equal(none.isError, true);
    assert.match(textOf(none), /沒有 skill\.md/);
  } finally {
    await close();
  }
});

test("query_records：序列化、分頁說明、來源、Token 不外洩", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({
      name: "openfun_query_records",
      arguments: {
        slug: COMPANY_SLUG,
        q_fields: { 營業人名稱: "測試 公司" },
        filters: { 縣市: ["臺北市", "新北市"], "營業地址.縣市": "臺北市" },
        ranges: { 資本額: { gte: 100, lt: "5000000" }, 設立日期: { gte: "2024-01-01" } },
        sort: { field: "資本額", direction: "desc" },
        page: 2,
        per_page: 20,
      },
    });
    assert.equal(r.isError, undefined, textOf(r));
    const req = lastReq("/records");
    assert.equal(req.headers.authorization, `Bearer ${GOOD_TOKEN}`);
    assert.deepEqual(parseQueryString(req.rawQuery), {
      q: { 營業人名稱: "測試 公司" },
      縣市: ["臺北市", "新北市"],
      "營業地址.縣市": "臺北市",
      __range__: { 資本額: { gte: "100", lt: "5000000" }, 設立日期: { gte: "2024-01-01" } },
      sort: "資本額<",
      page: "2",
      per_page: "20",
    });
    const t = textOf(r);
    assert.match(t, /符合條件共 45 筆；本頁（第 2 頁，每頁 20 筆）為第 21–40 筆/);
    assert.match(t, /還有下一頁（page=3）；這不是完整結果/);
    assert.match(t, /財政部財政資訊中心，經歐噴資料庫整理/);
    assert.match(t, /"api_url": "http:\/\/127\.0\.0\.1:\d+\/api\/v1\/datasets\/tw\.test~ref~company\/records\?/);
    assertNoToken(r);

    const lastPage = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, page: 3, per_page: 20 } });
    assert.match(textOf(lastPage), /第 41–45 筆。已是最後一頁/);
  } finally {
    await close();
  }
});

test("query_records：查無資料、未知欄位、fields 投影、API 警告", async () => {
  const { client, close } = await connect();
  try {
    const empty = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, q: "零筆" } });
    assert.equal(empty.isError, undefined);
    assert.match(textOf(empty), /沒有符合條件的記錄（total = 0）/);

    const before = api.requests.filter((x) => x.path.endsWith("/records")).length;
    const unknown = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, filters: { 不存在欄位: "x" } } });
    assert.equal(unknown.isError, true);
    assert.match(textOf(unknown), /不在此資料集 schema/);
    assert.match(textOf(unknown), /可用欄位：統一編號/);
    const badRange = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, ranges: { 金額: { gte: 1 } } } });
    assert.equal(badRange.isError, true);
    const badSort = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, sort: { field: "金額", direction: "asc" } } });
    assert.equal(badSort.isError, true);
    const both = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, q: "a", q_fields: { 備註: "b" } } });
    assert.equal(both.isError, true);
    assert.equal(api.requests.filter((x) => x.path.endsWith("/records")).length, before, "驗證失敗時不應送出查詢");

    const proj = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, fields: ["統一編號", "縣市"], per_page: 2 } });
    const pt = textOf(proj);
    assert.match(pt, /只顯示指定欄位：統一編號、縣市/);
    assert.ok(!pt.includes("營業人名稱\": \"測試公司"));

    const warn = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, filters: { 營業人名稱: "x" } } });
    assert.match(textOf(warn), /text 全文欄位/);
  } finally {
    await close();
  }
});

test("query_records：大型回應明確標示截斷，不默默刪除", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({ name: "openfun_query_records", arguments: { slug: "tw.test~ref~big", per_page: 100 } });
    assert.equal(r.isError, undefined);
    const t = textOf(r);
    assert.match(t, /因回應大小上限只顯示第 1–\d+ 筆（另有 \d+ 筆未顯示/);
    assert.match(t, /omitted_records_on_this_page/);
    assert.match(t, /本欄位已截斷：原長 6000 字/);
    assert.ok(t.length < 70000, `回應長度 ${t.length}`);
  } finally {
    await close();
  }
});

test("query_records / aggregate：錯誤一律 isError，且不偽裝成查無資料", async () => {
  const { client, close } = await connect();
  try {
    for (const [slug, re] of [
      ["tw.test~ref~private", /權限不足/],
      ["tw.test~ref~missing", /找不到/],
      ["tw.test~err~500", /歐噴伺服器錯誤/],
      ["tw.test~err~html", /非 JSON 錯誤頁/],
      ["tw.test~doc~guide", /不支援記錄查詢/],
    ]) {
      const r = await client.callTool({ name: "openfun_query_records", arguments: { slug } });
      assert.equal(r.isError, true, slug);
      const t = textOf(r);
      assert.match(t, re, slug);
      assert.ok(!/<html|<script/i.test(t));
      if (!slug.includes("doc")) assert.match(t, /不代表「查無資料」/);
    }
    const rate = await client.callTool({ name: "openfun_query_records", arguments: { slug: "tw.test~ref~rate" } });
    assert.equal(rate.isError, true);
    assert.match(textOf(rate), /請求太頻繁/);
  } finally {
    await close();
  }
  const exp = await connect(EXPIRED_TOKEN);
  try {
    const r = await exp.client.callTool({ name: "openfun_aggregate", arguments: { slug: COMPANY_SLUG, group_by: "縣市" } });
    assert.equal(r.isError, true);
    assert.match(textOf(r), /Token 已過期/);
    assertNoToken(r);
  } finally {
    await exp.close();
  }
  const none = await connect(null);
  try {
    const r = await none.client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG } });
    assert.equal(r.isError, true);
    assert.match(textOf(r), /尚未設定可用的歐噴 API Token/);
  } finally {
    await none.close();
  }
});

test("aggregate：序列化、分組結果、未列出組別警告、篩選欄位驗證", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({
      name: "openfun_aggregate",
      arguments: { slug: COMPANY_SLUG, group_by: "營業地址.縣市", field: "資本額", metrics: ["count", "avg"], filters: { 行業代號: ["932414", "561113"] } },
    });
    assert.equal(r.isError, undefined, textOf(r));
    assert.deepEqual(parseQueryString(lastReq("/agg").rawQuery), {
      group_by: "營業地址.縣市",
      field: "資本額",
      metrics: "count,avg",
      行業代號: ["932414", "561113"],
    });
    assert.match(textOf(r), /符合條件共 45 筆，分成 2 組/);
    assert.match(textOf(r), /臺北市/);

    const many = await client.callTool({ name: "openfun_aggregate", arguments: { slug: COMPANY_SLUG, group_by: "大量" } });
    assert.match(textOf(many), /API 只回傳 100 組（共 250 組）/);
    assert.match(textOf(many), /不能據此宣稱已列出所有組別/);

    const requestsBefore = api.requests.length;
    const noGroup = await client.callTool({ name: "openfun_aggregate", arguments: { slug: COMPANY_SLUG, field: "資本額" } });
    assert.equal(noGroup.isError, true);
    assert.match(textOf(noGroup), /group_by/);
    assert.equal(api.requests.length, requestsBefore, "缺少 group_by 時不得送出 API 請求");

    for (const filters of [{ "營業地址.縣市": "臺北市" }, { 營業人名稱: "x" }, { 不存在: "x" }]) {
      const bad = await client.callTool({ name: "openfun_aggregate", arguments: { slug: COMPANY_SLUG, group_by: "縣市", filters } });
      assert.equal(bad.isError, true, JSON.stringify(filters));
      assert.match(textOf(bad), /會被忽略而得到錯誤的統計/);
    }
    const missing = await client.callTool({ name: "openfun_aggregate", arguments: { slug: COMPANY_SLUG } });
    assert.equal(missing.isError, true);
    const apiErr = await client.callTool({ name: "openfun_aggregate", arguments: { slug: COMPANY_SLUG, group_by: "不存在" } });
    assert.equal(apiErr.isError, true);
    assert.match(textOf(apiErr), /available_group_by_fields/);
  } finally {
    await close();
  }
});

test("get_record：編碼 ID、404 為 isError、長文字截斷標示", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({ name: "openfun_get_record", arguments: { slug: COMPANY_SLUG, record_id: "A 001" } });
    assert.equal(r.isError, undefined);
    assert.equal(lastReq("/records/").rawUrl, "/api/v1/datasets/tw.test~ref~company/records/A%20001");
    const nf = await client.callTool({ name: "openfun_get_record", arguments: { slug: COMPANY_SLUG, record_id: "nope" } });
    assert.equal(nf.isError, true);
    const trav = await client.callTool({ name: "openfun_get_record", arguments: { slug: COMPANY_SLUG, record_id: "../../me" } });
    assert.equal(trav.isError, true);
  } finally {
    await close();
  }
});

test("Zod 參數驗證：超出範圍的 per_page 與額外 URL 參數", async () => {
  const { client, close } = await connect();
  try {
    const r = await client.callTool({ name: "openfun_query_records", arguments: { slug: COMPANY_SLUG, per_page: 1000 } });
    assert.equal(r.isError, true);
    const r2 = await client.callTool({ name: "openfun_search", arguments: { query: "" } });
    assert.equal(r2.isError, true);
  } finally {
    await close();
  }
});
