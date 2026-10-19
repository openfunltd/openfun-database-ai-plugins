import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { unzipSync, strFromU8 } from "fflate";
import { createServer } from "../build/lib/server.js";
import { codexHost } from "../build/lib/host.js";
import { makeWorkbook } from "../build/lib/xlsx.js";
import { GOOD_TOKEN, COMPANY_SLUG, COMPANY_SCHEMA, startMockApi, sendMock } from "./helpers/mock-api.mjs";
import { parseQueryString } from "./helpers/php-parse.mjs";

const path = `/api/v1/datasets/${COMPANY_SLUG}/records`;
const json = (result) => JSON.parse(result.content.find((c) => c.type === "text").text);
const record = (i) => ({ 統一編號: String(i).padStart(8, "0"), 營業人名稱: i === 1 ? '=HYPERLINK("https://bad.invalid")' : `公司${i}`, 資本額: String(1000 * i), 設立日期: "2026-01-02", 備註: `原始 ${GOOD_TOKEN} & <測試> 😀` });

async function setup(total = 205, override) {
  const directory = await mkdtemp(join(tmpdir(), "openfun-excel-"));
  const api = await startMockApi();
  api.setOverride(path, (req, res, { rawQuery }) => {
    const q = parseQueryString(rawQuery);
    const page = Number(q.page), size = Number(q.per_page);
    if (override?.({ req, res, q, page, size, api })) return;
    const start = (page - 1) * size;
    const records = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, n) => record(start + n + 1));
    sendMock(res, 200, { total, page, per_page: size, records });
  });
  const server = createServer({ baseUrl: api.url, token: GOOD_TOKEN, tokenProblem: null, timeoutMs: 2000, isDevOverride: true }, {
    exportDirectory: directory, exportRetryDelayMs: 0, host: codexHost(),
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "export-test", version: "1" });
  await Promise.all([server.connect(st), client.connect(ct)]);
  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  return { directory, api, client, call,
    start: (args = {}) => call("openfun_export_excel", { slug: COMPANY_SLUG, ...args }),
    async finish(result) {
      const id = json(result).export_id;
      for (let n = 0; n < 100; n++) {
        const status = await call("openfun_export_status", { export_id: id, wait_ms: 2000 });
        if (json(status).status !== "running") return status;
      }
      throw new Error("Export did not finish");
    },
    async close() { await client.close(); await api.close(); await rm(directory, { recursive: true, force: true }); },
  };
}

test("Excel：9224 筆全部分頁、離線降冪、兩工作表、文字識別碼與資源交付", { timeout: 30000 }, async () => {
  const c = await setup(9224);
  try {
    const started = await c.start({ fields: ["統一編號", "營業人名稱", "設立日期", "備註"], sort: { field: "資本額", direction: "desc" }, ranges: { 資本額: { gt: 100 } } });
    assert.equal(json(started).status, "running");
    const result = await c.finish(started);
    assert.equal(result.isError, undefined);
    const status = json(result);
    assert.equal(status.complete, true);
    assert.equal(status.expected_rows, 9224);
    assert.equal(status.exported_rows, 9224);
    assert.equal(status.fetched_pages, 93);
    assert.ok(status.file.path.startsWith(c.directory));
    assert.ok(!JSON.stringify(result).includes(GOOD_TOKEN));
    const link = result.content.find((v) => v.type === "resource_link");
    assert.equal(link.uri, status.file.uri);
    const resource = await c.client.readResource({ uri: link.uri });
    const saved = await readFile(status.file.path);
    assert.deepEqual(Buffer.from(resource.contents[0].blob, "base64"), saved);
    const archive = unzipSync(saved);
    const allXml = Object.values(archive).map((data) => strFromU8(data)).join("\n");
    assert.ok(!allXml.includes(GOOD_TOKEN));
    assert.ok(!allXml.includes("<f>"), "formula-looking values must stay literal text");
    assert.match(allXml, /😀/);
    // Validate independently with Python's ZIP/XML readers, not the XLSX writer.
    const python = spawnSync("python3", ["-c", `
import sys,zipfile,xml.etree.ElementTree as E
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 for n in z.namelist(): E.fromstring(z.read(n))
 wb=E.fromstring(z.read('xl/workbook.xml'))
 assert [s.attrib['name'] for s in wb.find('s:sheets',ns)] == ['查詢結果','來源與處理說明']
 sheet=E.fromstring(z.read('xl/worksheets/sheet1.xml'))
 rows=sheet.findall('s:sheetData/s:row',ns)
 assert len(rows)==9225
 ids=[r[0].find('s:is/s:t',ns).text for r in rows[1:]]
 assert ids == [str(i).zfill(8) for i in range(9224,0,-1)]
 assert sheet.find('s:autoFilter',ns).attrib['ref']=='A1:D9225'
 assert sheet.find('s:sheetViews/s:sheetView/s:pane',ns).attrib['state']=='frozen'
 assert all(c.attrib.get('t')=='inlineStr' for r in rows for c in r if c.attrib['r'].startswith('A'))
 assert rows[-1][1].find('s:is/s:t',ns).text.startswith('=HYPERLINK')
`, status.file.path], { encoding: "utf8" });
    assert.equal(python.status, 0, python.stderr);
    const requests = c.api.requests.filter((r) => r.path === path);
    assert.equal(requests.length, 94, "93 data pages and one final consistency check");
    for (const r of requests) {
      const q = parseQueryString(r.rawQuery);
      assert.equal(q.sort, "統一編號>");
      assert.equal(q.__range__.資本額.gt, "100");
      assert.equal(r.headers.authorization, `Bearer ${GOOD_TOKEN}`);
    }
  } finally { await c.close(); }
});

test("Excel：數字、前導零、日期、物件與空值依型別保留", async () => {
  const c = await setup(1);
  try {
    const result = json(await c.finish(await c.start()));
    const z = unzipSync(await readFile(result.file.path));
    const xml = strFromU8(z["xl/worksheets/sheet1.xml"]);
    assert.match(xml, /t="inlineStr"[^>]*><is><t xml:space="preserve">00000001/);
    assert.match(xml, /<c r="D2" s="2"><v>1000<\/v>/);
    assert.match(xml, /2026-01-02/);
    assert.match(xml, /&amp; &lt;測試&gt;/);
  } finally { await c.close(); }
});

test("Excel：超出數字精度的原始字串保持原文，已失去精度的 JS 數字另行拒絕", async () => {
  const exact = "12345678901234567890";
  const c = await setup(1, ({ res, page, size }) => {
    return sendMock(res, 200, { total: 1, page, per_page: size, records: [{ ...record(1), 資本額: exact }] }), true;
  });
  try {
    const result = json(await c.finish(await c.start()));
    assert.equal(result.complete, true);
    const z = unzipSync(await readFile(result.file.path));
    assert.match(strFromU8(z["xl/worksheets/sheet1.xml"]), new RegExp(`<c r="D2" t="inlineStr"[^>]*><is><t xml:space="preserve">${exact}</t>`));
    for (const invalid of ["\ufffe", "\uffff"]) {
      assert.throws(() => makeWorkbook([{ name: "結果", rows: [[invalid]] }, { name: "說明", rows: [[]] }]), /Excel/);
    }
  } finally { await c.close(); }
});

for (const scenario of ["missing", "duplicate", "total", "page", "per_page", "cap", "quota", "unsafe", "long"]) {
  test(`Excel：${scenario} 會停止且不輸出冒充完整的檔案`, async () => {
    const total = scenario === "cap" ? 10001 : 101;
    const c = await setup(total, ({ res, page, size }) => {
      if (scenario === "quota") return sendMock(res, 429, { error: "daily_quota_exceeded" }), true;
      if (scenario === "unsafe" || scenario === "long") {
        const r = record(1);
        if (scenario === "unsafe") r.資本額 = 9007199254740992;
        else r.備註 = "字".repeat(32768);
        return sendMock(res, 200, { total: 1, page, per_page: size, records: [r] }), true;
      }
      if (page === 2) {
        const payload = { total, page, per_page: size, records: [record(101)] };
        if (scenario === "missing") payload.records = [];
        if (scenario === "duplicate") payload.records = [record(1)];
        if (scenario === "total") payload.total++;
        if (scenario === "page") payload.page = 1;
        if (scenario === "per_page") payload.per_page = 20;
        return sendMock(res, 200, payload), true;
      }
    });
    try {
      const result = await c.finish(await c.start());
      assert.equal(result.isError, true);
      assert.equal(json(result).status, "failed");
      assert.equal(json(result).complete, false);
      assert.equal(json(result).file, undefined);
      assert.deepEqual(await readdir(c.directory), []);
      assert.ok(!JSON.stringify(result).includes(GOOD_TOKEN));
      if (scenario === "cap" || scenario === "quota") assert.equal(c.api.requests.filter((r) => r.path === path).length, 1);
    } finally { await c.close(); }
  });
}

test("Excel：暫時性 500 會重試同頁；成功後筆數一致", async () => {
  let failures = 0;
  const c = await setup(101, ({ res, page }) => {
    if (page === 2 && failures++ === 0) return sendMock(res, 500, { error: "temporary" }), true;
  });
  try {
    const result = json(await c.finish(await c.start()));
    assert.equal(result.complete, true);
    assert.equal(result.retries, 1);
    assert.equal(result.exported_rows, 101);
  } finally { await c.close(); }
});

test("Excel：零筆仍產生只有標題的結果表與零筆說明", async () => {
  const c = await setup(0);
  try {
    const result = json(await c.finish(await c.start()));
    assert.equal(result.complete, true);
    assert.equal(result.exported_rows, 0);
    const z = unzipSync(await readFile(result.file.path));
    assert.equal((strFromU8(z["xl/worksheets/sheet1.xml"]).match(/<row /g) ?? []).length, 1);
  } finally { await c.close(); }
});

test("Excel：可取消、不可並行重複啟動，不刪已完成檔", async () => {
  const c = await setup();
  try {
    const started = await c.start();
    const duplicate = await c.start();
    assert.equal(duplicate.isError, true);
    const stopped = await c.call("openfun_cancel_export", { export_id: json(started).export_id });
    assert.equal(json(stopped).status, "cancelled");
    assert.equal(json(await c.finish(started)).complete, false);
    assert.deepEqual(await readdir(c.directory), []);
    // Give the cancelled in-flight request a chance to settle before retrying.
    await new Promise((r) => setTimeout(r, 130));
    const result = json(await c.finish(await c.start()));
    assert.equal(result.complete, true);
    await c.call("openfun_cancel_export", { export_id: result.export_id });
    assert.ok((await readFile(result.file.path)).length > 100);
  } finally { await c.close(); }
});

test("Excel：Token 清除後停止工作、拒絕舊狀態與任意本機資源", async () => {
  const c = await setup();
  try {
    const started = await c.start();
    await c.call("openfun_clear_token");
    const status = await c.call("openfun_export_status", { export_id: json(started).export_id });
    assert.equal(status.isError, true);
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(await readdir(c.directory), []);
    await assert.rejects(c.client.readResource({ uri: "file:///etc/passwd" }));
    assert.equal((await c.start()).isError, true);
  } finally { await c.close(); }
});

test("Excel：只接受查詢參數，不接受任意輸出路徑或指令", async () => {
  const c = await setup();
  try {
    const { tools } = await c.client.listTools();
    const start = tools.find((t) => t.name === "openfun_export_excel");
    for (const bad of ["path", "output_path", "filename", "command", "token"]) assert.equal(start.inputSchema.properties[bad], undefined);
    assert.equal(start.annotations.readOnlyHint, false);
    assert.equal((await c.start({ q: "x", q_fields: { 營業人名稱: "y" } })).isError, true);
    assert.equal((await c.start({ fields: ["不存在"] })).isError, true);
    assert.equal((await c.start({ fields: ["統一編號", "統一編號"] })).isError, true);
    assert.equal((await c.start({ sort: { field: "not_in_schema", direction: "desc" } })).isError, true);
    assert.deepEqual(await readdir(c.directory), []);
  } finally { await c.close(); }
});

test("Excel：前後 metadata 版本改變時不輸出，完成檔被修改後資源拒讀", async () => {
  const c = await setup(1);
  let n = 0;
  c.api.setOverride(`/api/v1/datasets/${COMPANY_SLUG}`, (req, res) => sendMock(res, 200, {
    slug: COMPANY_SLUG, type: "tinydb", meta: { schema: COMPANY_SCHEMA }, last_updated_at: String(++n),
  }));
  try {
    const failed = json(await c.finish(await c.start()));
    assert.equal(failed.complete, false);
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /版本或欄位改變/);
    assert.deepEqual(await readdir(c.directory), []);
  } finally { await c.close(); }
  const good = await setup(1);
  try {
    const complete = json(await good.finish(await good.start()));
    await writeFile(complete.file.path, "changed");
    await assert.rejects(good.client.readResource({ uri: complete.file.uri }));
    await good.call("openfun_clear_token");
    await assert.rejects(good.client.readResource({ uri: complete.file.uri }));
  } finally { await good.close(); }
});

test("Excel：已存在的同名檔案不覆寫", async () => {
  const c = await setup(205);
  try {
    const started = await c.start();
    const id = json(started).export_id;
    const path = join(c.directory, `openfun-${COMPANY_SLUG}-${id}.xlsx`);
    await writeFile(path, "do not overwrite");
    const result = json(await c.finish(started));
    assert.equal(result.status, "failed");
    assert.equal(result.complete, false);
    assert.equal(await readFile(path, "utf8"), "do not overwrite");
    assert.deepEqual(await readdir(c.directory), [basename(path)]);
  } finally { await c.close(); }
});

test("XLSX：無法表示的控制字元／過長文字拒絕，公式樣式為明確文字", () => {
  for (const bad of ["\u0001", "x".repeat(32768), "\ud800"]) {
    assert.throws(() => makeWorkbook([{ name: "結果", rows: [[bad]] }, { name: "來源", rows: [["x"]] }]));
  }
  const z = unzipSync(makeWorkbook([{ name: "結果", rows: [["=1+1", "+cmd", "@SUM(1)", "_x0041_", "😀"]] }, { name: "來源", rows: [["x"]] }]));
  const xml = strFromU8(z["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /_x005F_x0041_/);
  assert.ok(!xml.includes("<f>"));
});
