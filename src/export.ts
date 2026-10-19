/** Background exports reuse the server's Token; raw records never enter the model context. */
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { paths } from "./client.js";
import { expectDatasetDetail, expectRecords } from "./contracts.js";
import { formatError, OpenFunError, redact } from "./errors.js";
import { buildRecordsQuery, type RecordsQuery } from "./query.js";
import { getSchema, indexSchema, type DatasetDetail, type SchemaColumn } from "./schema.js";
import type { TokenSession, TokenSnapshot } from "./session.js";
import { type Cell, makeWorkbook } from "./xlsx.js";
import { summarize, summaryCell, type NumericSummary } from "./export-summary.js";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PAGE_SIZE = 100;
const MAX_BYTES = 32 * 1024 * 1024;
const NUMERIC = new Set(["number", "integer", "long", "float", "double"]);
type State = "running" | "completed" | "failed" | "cancelled";
export interface ExportSpec {
  detail: DatasetDetail;
  query: Omit<RecordsQuery, "page" | "perPage">;
  fields?: string[];
  maxRows: number;
  summaryFields?: string[];
}
interface Job {
  id: string;
  state: State;
  owner: TokenSnapshot;
  expectedRows: number | null;
  rows: number;
  pages: number;
  retries: number;
  startedAt: string;
  finishedAt?: string;
  file?: { path: string; uri: string; name: string; bytes: number; sha256: string };
  error?: string;
  summary?: { record_count: number; numeric_fields: NumericSummary[]; average_decimal_places: number; note: string };
  done: Promise<void>;
}

function invalid(message: string): never {
  throw new OpenFunError("validation", message + " 匯出未完成，沒有產生完整 Excel；請縮小條件或稍後重新匯出。");
}

function valueAt(record: Record<string, unknown>, name: string): unknown {
  if (Object.hasOwn(record, name)) return record[name];
  return name.split(".").reduce<unknown>((v, key) => v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined, record);
}

function numberValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function cellValue(v: unknown, column: SchemaColumn, token: string | null): Cell {
  if (v === null || v === undefined) return null;
  if (NUMERIC.has(column.type ?? "") && !column.multi) {
    const n = numberValue(v);
    if (n === null) invalid(`數值欄位「${column.name}」含無法可靠匯出的數字。`);
    // Preserve the original text before checking JS integer safety: API strings are exact.
    if (typeof v === "string" && v.replace(/[-+.eE]/g, "").length > 15) return redact(v, token);
    if (Number.isInteger(n) && !Number.isSafeInteger(n)) invalid(`數值欄位「${column.name}」含無法可靠匯出的數字。`);
    return n;
  }
  return redact(typeof v === "object" ? JSON.stringify(v) : String(v), token);
}

export class ExcelExports {
  readonly #session: TokenSession;
  readonly #directory: string;
  readonly #retryDelay: number;
  readonly #jobs = new Map<string, Job>();
  #closed = false;

  constructor(session: TokenSession, opts: { directory?: string; retryDelayMs?: number } = {}) {
    this.#session = session;
    this.#directory = opts.directory ?? join(homedir(), "Downloads", "OpenFun");
    this.#retryDelay = opts.retryDelayMs ?? 1000;
  }

  start(owner: TokenSnapshot, spec: ExportSpec): Record<string, unknown> {
    if (this.#closed) invalid("匯出服務已關閉。");
    if (!owner.client.hasToken) throw new OpenFunError("not_configured", "尚未設定可用的歐噴 Token，請先完成原本的 Token 設定。");
    if ([...this.#jobs.values()].some((j) => j.state === "running")) invalid("已有一項匯出進行中，請先查進度或取消。");
    // Keep a bounded, process-local job history. No Token or job data is persisted.
    if (this.#jobs.size >= 20) this.#jobs.delete(this.#jobs.keys().next().value!);
    const job: Job = { id: randomUUID(), state: "running", owner, expectedRows: null, rows: 0, pages: 0, retries: 0, startedAt: new Date().toISOString(), done: Promise.resolve() };
    this.#jobs.set(job.id, job);
    job.done = this.#execute(job, spec).catch((err) => {
      if (job.state === "running") {
        job.state = "failed";
        const code = (err as NodeJS.ErrnoException)?.code;
        const problem = !(err instanceof OpenFunError) && code
          ? new OpenFunError("validation", "無法寫入本機 Excel 檔，請檢查下載資料夾的寫入權限、硬碟空間與檔案系統支援。", { apiMessage: String(code) })
          : err;
        job.error = formatError(problem, owner.client.secretForRedaction);
      }
    }).finally(() => { job.finishedAt = new Date().toISOString(); });
    return this.#view(job);
  }

  #get(id: string): Job {
    const job = this.#jobs.get(id);
    if (!job || job.owner !== this.#session.snapshot()) {
      if (job?.state === "running") job.state = "cancelled";
      throw new OpenFunError("not_found", "找不到目前 Token 對應的匯出工作；重啟程式或更換 Token 後，請重新匯出。已完成的檔案仍留在本機。");
    }
    return job;
  }

  async status(id: string, waitMs: number): Promise<Record<string, unknown>> {
    const job = this.#get(id);
    if (job.state === "running" && waitMs > 0) {
      // Clear the timer when the export completes instead of keeping the process alive.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([job.done, new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs); })]); }
      finally { if (timer) clearTimeout(timer); }
    }
    return this.#view(this.#get(id));
  }

  cancel(id: string): Record<string, unknown> {
    const job = this.#get(id);
    if (job.state === "running") job.state = "cancelled";
    return this.#view(job);
  }

  async readResource(uri: string): Promise<{ contents: { uri: string; mimeType: string; blob: string }[] }> {
    const job = [...this.#jobs.values()].find((j) => j.state === "completed" && j.file?.uri === uri);
    if (!job?.file || job.owner !== this.#session.snapshot()) throw new OpenFunError("not_found", "找不到目前 Token 對應的匯出檔。");
    const handle = await open(job.file.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const st = await handle.stat();
      if (!st.isFile() || st.size !== job.file.bytes) invalid("匯出檔已變動。");
      const bytes = await handle.readFile();
      if (createHash("sha256").update(bytes).digest("hex") !== job.file.sha256) invalid("匯出檔已變動。");
      return { contents: [{ uri, mimeType: XLSX_MIME, blob: bytes.toString("base64") }] };
    } finally { await handle.close(); }
  }

  close(): void {
    this.#closed = true;
    for (const job of this.#jobs.values()) if (job.state === "running") job.state = "cancelled";
  }

  #active(job: Job): void {
    if (this.#closed || job.state !== "running" || this.#session.snapshot() !== job.owner) {
      job.state = "cancelled";
      throw new OpenFunError("validation", "匯出已取消，未產生完整 Excel。");
    }
  }

  #view(job: Job): Record<string, unknown> {
    return {
      export_id: job.id, status: job.state, expected_rows: job.expectedRows, exported_rows: job.rows,
      fetched_pages: job.pages, retries: job.retries, started_at: job.startedAt,
      ...(job.finishedAt ? { finished_at: job.finishedAt } : {}),
      complete: job.state === "completed",
      ...(job.file ? { file: job.file, delivery: "檔案已存到執行此外掛的電腦，家目錄的 Downloads/OpenFun（下載／OpenFun）資料夾。若聊天不支援本機檔案連結，請從該資料夾開啟；不需要終端機。" } : {}),
      ...(job.file ? { workbook: { worksheets: ["查詢結果", "統計摘要", "來源與處理說明"], auto_filter: true, frozen_header_rows: 1, summary: job.summary } } : {}),
      ...(job.error ? { error: job.error } : {}),
      ...(job.state === "running" ? { next_step: "請用 openfun_export_status 查詢這個 export_id（wait_ms=2000），直到 completed、failed 或 cancelled；不要逐頁轉抄資料或在完成前宣稱已完整匯出。" } : {}),
      ...(job.state === "failed" || job.state === "cancelled" ? { next_step: "未完成匯出，沒有完整結果檔；解決錯誤後可重新呼叫 openfun_export_excel。" } : {}),
    };
  }

  async #page(job: Job, slug: string, query: RecordsQuery): Promise<ReturnType<typeof expectRecords>> {
    for (let attempt = 0; ; attempt++) {
      this.#active(job);
      try {
        const { data } = await job.owner.client.getJson(paths.records(slug), { query: buildRecordsQuery(query), auth: "required" });
        this.#active(job);
        return expectRecords(data);
      } catch (err) {
        this.#active(job);
        if (!(err instanceof OpenFunError) || !["network", "timeout", "server_error"].includes(err.kind) || attempt >= 2) throw err;
        job.retries++;
        await sleep(this.#retryDelay * 2 ** attempt);
      }
    }
  }

  async #execute(job: Job, spec: ExportSpec): Promise<void> {
    const token = job.owner.client.secretForRedaction;
    const schema = getSchema(spec.detail);
    const idColumn = schema.find((c) => c.alias === "_id");
    if (!idColumn) invalid("資料集沒有提供可核對重複的識別欄位。");
    const columns = spec.fields ? spec.fields.map((name) => {
      const col = schema.find((c) => c.name === name);
      if (!col) invalid(`不支援匯出欄位「${name}」。`);
      return col;
    }) : schema;
    if (!columns.length || columns.length > 200) invalid("匯出欄位必須介於 1–200 欄。");
    const numeric = (c: SchemaColumn) => NUMERIC.has(c.type ?? "") && !c.multi;
    const summaryNames = spec.summaryFields ?? [...new Set([
      ...columns.filter(numeric).map((c) => c.name),
      ...schema.filter((c) => numeric(c) && c.name === spec.query.sort?.field).map((c) => c.name),
    ])];
    if (summaryNames.length > 20) invalid("數值欄位超過 20 個，請用 summary_fields 指定最多 20 個要統計的欄位。");
    if (summaryNames.some((name) => !schema.some((c) => c.name === name && numeric(c)))) invalid("統計欄位必須是 schema 中的單值數值欄位。");
    const records: Record<string, unknown>[] = [];
    const ids = new Set<string>();
    const warnings = new Set<string>();
    let bytes = 0;
    let firstId: string | undefined;
    // Page by the unique ID to avoid unstable ties in a user-selected sort column.
    // Apply the requested output sort locally after verifying all pages.
    const fetchQuery = { ...spec.query, sort: { field: idColumn.name, direction: "asc" as const } };
    for (let page = 1; ; page++) {
      const data = await this.#page(job, spec.detail.slug, { ...fetchQuery, page, perPage: PAGE_SIZE });
      if (job.expectedRows === null) job.expectedRows = data.total;
      if (data.total !== job.expectedRows) invalid("查詢期間符合總筆數改變。");
      if (data.total > spec.maxRows) invalid(`符合 ${data.total} 筆，超過本次上限 ${spec.maxRows} 筆；不會只匯出前幾頁冒充完整結果。`);
      if ((data.page !== undefined && data.page !== page) || (data.per_page !== undefined && data.per_page !== PAGE_SIZE)) invalid("API 回傳的頁碼或每頁筆數與請求不符。");
      const expected = Math.min(PAGE_SIZE, Math.max(0, data.total - records.length));
      if (data.records.length !== expected) invalid("API 回傳不完整頁面或提早結束。");
      for (const record of data.records) {
        const rawId = record[idColumn.name];
        if ((typeof rawId !== "string" && typeof rawId !== "number") || String(rawId) === "" || (typeof rawId === "number" && !Number.isSafeInteger(rawId))) invalid("記錄缺少有效識別碼。");
        const id = String(rawId);
        if (ids.has(id)) invalid("分頁間出現重複識別碼，可能資料已變動。");
        ids.add(id);
        firstId ??= id;
        const projected = Object.fromEntries(columns.map((c) => [c.name, valueAt(record, c.name)]));
        if (spec.query.sort) projected[spec.query.sort.field] = valueAt(record, spec.query.sort.field);
        for (const name of summaryNames) projected[name] = valueAt(record, name);
        bytes += Buffer.byteLength(JSON.stringify(projected));
        if (bytes > MAX_BYTES) invalid("資料超過 32 MiB 匯出大小上限。");
        records.push(projected);
      }
      if (Array.isArray(data.warnings)) for (const w of data.warnings) warnings.add(redact(typeof w === "string" ? w : JSON.stringify(w), token));
      job.rows = records.length;
      job.pages++;
      if (records.length === data.total) break;
      await sleep(100); // Sequential, bounded requests; do not overwhelm the API.
    }
    // Recheck the first record/total and metadata after fetching all pages.
    const end = await this.#page(job, spec.detail.slug, { ...fetchQuery, page: 1, perPage: 1 });
    if (end.total !== job.expectedRows || (firstId !== undefined && String(end.records[0]?.[idColumn.name]) !== firstId)) invalid("資料在匯出期間發生變動。");
    const { data: latestRaw } = await job.owner.client.getJson(paths.dataset(spec.detail.slug), { auth: "required" });
    const latest = expectDatasetDetail(latestRaw, spec.detail.slug);
    if (latest.last_updated_at !== spec.detail.last_updated_at || JSON.stringify(getSchema(latest)) !== JSON.stringify(schema)) invalid("匯出期間資料集版本或欄位改變。");
    this.#active(job);

    if (spec.query.sort) {
      const { field, direction } = spec.query.sort;
      const numeric = NUMERIC.has(indexSchema(schema).typeOf.get(field) ?? "");
      const collator = new Intl.Collator("zh-Hant", { numeric: true });
      records.sort((a, b) => {
        const av = valueAt(a, field), bv = valueAt(b, field);
        if (av === undefined || av === null) return bv === undefined || bv === null ? 0 : 1;
        if (bv === undefined || bv === null) return -1;
        let cmp: number;
        if (numeric) {
          const an = numberValue(av), bn = numberValue(bv);
          if (an === null || bn === null) invalid(`排序欄位「${field}」含無效數字。`);
          cmp = an - bn;
        } else cmp = collator.compare(String(av), String(bv));
        return direction === "asc" ? cmp : -cmp;
      });
    }
    const metadata: Cell[][] = [["項目", "內容"], ["完成狀態", "完整匯出（符合筆數與識別碼核對通過）"],
      ["符合總筆數", job.expectedRows], ["實際取得筆數", job.rows], ["唯一識別碼筆數", ids.size],
      ["資料集", spec.detail.title ?? spec.detail.slug], ["資料集網址", job.owner.client.publicUrl(`/datasets/${spec.detail.slug}`)],
      ["資料更新時間", spec.detail.last_updated_at ?? "未提供"], ["查詢開始時間", job.startedAt], ["檔案製作時間", new Date().toISOString()],
      ["查詢條件", JSON.stringify(spec.query)], ["輸出欄位", columns.map((c) => c.name).join("、")],
      ["來源與授權", JSON.stringify(spec.detail.meta?.sources ?? [])], ["引用資訊", spec.detail.citation ?? "未提供"],
      ["資料集注意事項", JSON.stringify(spec.detail.warnings ?? [])], ["API 注意事項", [...warnings].join("\n") || "無"],
      ["處理方式", "外掛分頁讀取原始記錄、核對總筆數與唯一識別碼，再產生 Excel。未經聊天轉抄，未自行去重或刪除記錄。"],
      ["資料格式", "數值欄位保留為數字；識別碼與日期為文字；物件與陣列為 JSON 文字。超出 Excel 數字精度時保留文字。"],
      ["一致性限制", "已核對頁面數量、重複識別碼與前後版本，但 API 不保證查詢期間的強一致性快照；資料變動時應重新查詢。"]];
    const numericSummary = summarize(records, summaryNames);
    const summary = { record_count: job.rows, numeric_fields: numericSummary, average_decimal_places: 6,
      note: "依本次完整篩選結果計算；空值不計入平均，平均四捨五入至最多六位小數。摘要是匯出當下的值，不隨之後修改 Excel 重算。" };
    const summaryRows: Cell[][] = [["項目", "內容"], ["完整記錄筆數", job.rows], ["統計範圍", "本次全部符合查詢條件的記錄"],
      ["計算方式", summary.note], [], ["欄位", "有值筆數", "未提供筆數", "合計", "平均"],
      ...numericSummary.map((s) => [s.field, s.count, s.missing, summaryCell(s.sum), summaryCell(s.average)] as Cell[])];
    const workbook = makeWorkbook([
      { name: "查詢結果", filter: true, rows: [columns.map((c) => redact(c.name, token)), ...records.map((r) => columns.map((c) => cellValue(r[c.name], c, token)))] },
      { name: "統計摘要", rows: summaryRows.map((r) => r.map((v) => typeof v === "string" ? redact(v, token) : v)) },
      { name: "來源與處理說明", rows: metadata.map((r) => r.map((v) => typeof v === "string" ? redact(v, token) : v)) },
    ]);
    this.#active(job);
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const dir = await lstat(this.#directory);
    if (!dir.isDirectory() || dir.isSymbolicLink()) invalid("匯出資料夾不是一般資料夾。");
    const name = `openfun-${spec.detail.slug.slice(0, 60)}-${job.id}.xlsx`;
    const path = join(this.#directory, name);
    const temporary = join(this.#directory, `.openfun-${job.id}.tmp`);
    let published = false;
    try {
      await writeFile(temporary, workbook, { flag: "wx", mode: 0o600 });
      this.#active(job);
      await link(temporary, path); // Atomic publication, EEXIST instead of overwriting a file.
      published = true;
      this.#active(job);
    } catch (err) {
      if (published) await unlink(path).catch(() => {});
      throw err;
    } finally { await unlink(temporary).catch(() => {}); }
    job.file = { path, uri: pathToFileURL(path).href, name, bytes: workbook.length, sha256: createHash("sha256").update(workbook).digest("hex") };
    job.summary = summary;
    job.state = "completed";
  }
}
