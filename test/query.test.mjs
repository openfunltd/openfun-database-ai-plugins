import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAggQuery, buildRecordsQuery } from "../build/lib/query.js";
import { parseQueryString } from "./helpers/php-parse.mjs";

const roundTrip = (qs) => {
  // 確認經過 WHATWG URL（fetch 使用）後字串不被改寫，再以後端解析器解析
  const u = new URL(`http://127.0.0.1/x?${qs}`);
  assert.equal(u.search.slice(1), qs, "URL 解析器不應改寫查詢字串");
  return parseQueryString(qs);
};

test("中文、空白、加號與 & 會正確編碼", () => {
  const qs = buildRecordsQuery({ q: "台 積+電&公司", filters: { 縣市: "臺北市" } });
  assert.equal(qs, "q=%E5%8F%B0%20%E7%A9%8D%2B%E9%9B%BB%26%E5%85%AC%E5%8F%B8&%E7%B8%A3%E5%B8%82=%E8%87%BA%E5%8C%97%E5%B8%82");
  assert.deepEqual(roundTrip(qs), { q: "台 積+電&公司", 縣市: "臺北市" });
});

test("範圍 >= <= > < 被後端解析為 gte/lte/gt/lt，不會變成 >==", () => {
  const qs = buildRecordsQuery({
    ranges: { 金額: { gte: "100", lt: "500" }, 設立日期: { lte: "2024-12-31", gt: "2024-01-01" } },
  });
  assert.ok(!qs.includes(">=="));
  assert.deepEqual(roundTrip(qs), {
    __range__: { 金額: { gte: "100", lt: "500" }, 設立日期: { lte: "2024-12-31", gt: "2024-01-01" } },
  });
});

test("同欄位多值使用重複 key，不使用 a[0]= 陣列語法", () => {
  const qs = buildRecordsQuery({ filters: { 縣市: ["臺北市", "新北市"], 行業代號: "932414" } });
  assert.ok(!qs.includes("%5B0%5D") && !qs.includes("[0]"));
  assert.deepEqual(roundTrip(qs), { 縣市: ["臺北市", "新北市"], 行業代號: "932414" });
});

test("q[欄位] 欄位全文搜尋", () => {
  const qs = buildRecordsQuery({ qFields: { 營業地址: "台北市 大安區", "董監事.姓名": "王小明" } });
  assert.deepEqual(roundTrip(qs), { q: { 營業地址: "台北市 大安區", "董監事.姓名": "王小明" } });
});

test("排序、分頁、_as_of、_ids", () => {
  const qs = buildRecordsQuery({
    sort: { field: "資本額", direction: "desc" },
    page: 3,
    perPage: 50,
    asOf: "2024-01-01",
    ids: ["A001", "A002"],
  });
  assert.deepEqual(roundTrip(qs), { sort: "資本額<", page: "3", per_page: "50", _as_of: "2024-01-01", _ids: "A001,A002" });
  assert.equal(roundTrip(buildRecordsQuery({ sort: { field: "資本額", direction: "asc" } })).sort, "資本額>");
});

test("精確篩選的值含有 >= 也不會被誤判為範圍", () => {
  const qs = buildRecordsQuery({ filters: { 備註: ">=100 <x>" } });
  assert.deepEqual(roundTrip(qs), { 備註: ">=100 <x>" });
});

test("點號子欄位與數字值", () => {
  const qs = buildRecordsQuery({ filters: { "營業地址.縣市": "臺北市" }, ranges: { 資本額: { gte: "1000000" } } });
  assert.deepEqual(roundTrip(qs), { "營業地址.縣市": "臺北市", __range__: { 資本額: { gte: "1000000" } } });
});

test("驗證：拒絕保留字、特殊字元、q 與 q_fields 並用、= 開頭範圍值、過長 q", () => {
  const bad = [
    { filters: { page: "1" } },
    { filters: { "a=b": "1" } },
    { filters: { "a>b": "1" } },
    { filters: { "q[x]": "1" } },
    { filters: { " 縣市": "1" } },
    { filters: { __range__: "1" } },
    { filters: { 縣市: [] } },
    { q: "a", qFields: { 縣市: "b" } },
    { ranges: { 金額: { gt: "=5" } } },
    { ranges: { 金額: {} } },
    { ranges: { 金額: { gte: "" } } },
    { filters: { 金額: "1" }, ranges: { 金額: { gte: "1" } } },
    { q: "測".repeat(67) },
    { ids: ["a,b"] },
    { filters: { 縣市: "a\u0000b" } },
  ];
  for (const b of bad) assert.throws(() => buildRecordsQuery(b), (e) => e.kind === "validation", JSON.stringify(b));
  assert.doesNotThrow(() => buildRecordsQuery({ q: "測".repeat(66) }));
});

test("agg 查詢字串", () => {
  const qs = buildAggQuery({ groupBy: "營業地址.縣市", field: "資本額", metrics: ["count", "avg"], filters: { 行業代號: ["932414", "561113"] } });
  assert.deepEqual(roundTrip(qs), {
    group_by: "營業地址.縣市",
    field: "資本額",
    metrics: "count,avg",
    行業代號: ["932414", "561113"],
  });
  assert.throws(() => buildAggQuery({}), (e) => e.kind === "validation");
  assert.throws(() => buildAggQuery({ field: "資本額" }), (e) => e.kind === "validation");
});
