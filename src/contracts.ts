/**
 * API 回應結構驗證。HTTP 200 但結構不符（例如 {}、缺少陣列、元素型別錯誤）時一律視為
 * invalid_response，避免把異常回應誤當成「Token 有效」「查無資料」或統計結果。
 * 欄位依據 data.openfun.tw 的 controllers/ApiController.php 實際輸出。
 */

import { OpenFunError } from "./errors.js";
import type { DatasetDetail } from "./schema.js";

type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

function bad(what: string, detail: string): OpenFunError {
  return new OpenFunError("invalid_response", `歐噴 API 的${what}回應格式不符預期（${detail}），結果不可當成成功或查無資料。`, {
    hint: "可能是服務暫時異常或 API 已變更；請稍後再試，仍失敗請告知使用者目前無法取得這項資料。",
  });
}

function everyObj(arr: unknown[], what: string, label: string, check?: (o: Obj) => boolean): void {
  arr.forEach((x, i) => {
    if (!isObj(x) || (check && !check(x))) throw bad(what, `${label}[${i}] 格式錯誤`);
  });
}

/** GET /api/v1/me：一定回傳 email 與 display_name 兩個 key（依 Token scope 可能為 null） */
export function expectMe(d: unknown): { email: string | null; display_name: string | null } {
  if (!isObj(d)) throw bad("帳號資訊", "不是物件");
  for (const k of ["email", "display_name"] as const) {
    if (!(k in d)) throw bad("帳號資訊", `缺少 ${k}`);
    if (d[k] !== null && typeof d[k] !== "string") throw bad("帳號資訊", `${k} 型別錯誤`);
  }
  return { email: d.email as string | null, display_name: d.display_name as string | null };
}

export interface SearchResponse {
  datasets: { results: Obj[] };
  entities: { total: number; groups: Obj[] };
}

/** GET /api/v1/search：{q, datasets:{total, results[]}, entities:{total, groups[]}} */
export function expectSearch(d: unknown): SearchResponse {
  const what = "搜尋";
  if (!isObj(d)) throw bad(what, "不是物件");
  if (!isObj(d.datasets) || !Array.isArray(d.datasets.results)) throw bad(what, "缺少 datasets.results 陣列");
  if (!isObj(d.entities) || !Array.isArray(d.entities.groups)) throw bad(what, "缺少 entities.groups 陣列");
  if (!isCount(d.entities.total)) throw bad(what, "entities.total 不是數字");
  everyObj(d.datasets.results, what, "datasets.results", (o) => typeof o.slug === "string");
  everyObj(d.entities.groups, what, "entities.groups", (o) => typeof o.dataset_slug === "string" && Array.isArray(o.entities));
  return d as unknown as SearchResponse;
}

/** GET /api/v1/datasets：{datasets[], total}，total = datasets 數量 */
export function expectDatasetList(d: unknown): { datasets: Obj[]; warning?: unknown } {
  const what = "資料集清單";
  if (!isObj(d)) throw bad(what, "不是物件");
  if (!Array.isArray(d.datasets)) throw bad(what, "缺少 datasets 陣列");
  if (!isCount(d.total)) throw bad(what, "total 不是數字");
  if (d.total !== d.datasets.length) throw bad(what, `total（${d.total}）與實際筆數（${d.datasets.length}）不一致`);
  everyObj(d.datasets, what, "datasets", (o) => typeof o.slug === "string");
  return d as { datasets: Obj[]; warning?: unknown };
}

/** GET /api/v1/datasets/{slug}：slug 需與要求相同，meta 為物件，schema/sources 若存在需為陣列 */
export function expectDatasetDetail(d: unknown, slug: string): DatasetDetail {
  const what = "資料集資訊";
  if (!isObj(d)) throw bad(what, "不是物件");
  if (d.slug !== slug) throw bad(what, "slug 與查詢的資料集不符");
  if (typeof d.type !== "string") throw bad(what, "缺少 type");
  if (d.title !== undefined && d.title !== null && typeof d.title !== "string") throw bad(what, "title 型別錯誤");
  if (!isObj(d.meta)) throw bad(what, "缺少 meta 物件");
  if (d.meta.schema !== undefined && !Array.isArray(d.meta.schema)) throw bad(what, "meta.schema 不是陣列");
  if (d.meta.sources !== undefined && !Array.isArray(d.meta.sources)) throw bad(what, "meta.sources 不是陣列");
  return d as unknown as DatasetDetail;
}

/** GET /api/v1/datasets/{slug}/records：{total, page, per_page, records[], schema[], …} */
export function expectRecords(d: unknown): { total: number; page?: number; per_page?: number; records: Obj[]; warnings?: unknown } {
  const what = "記錄查詢";
  if (!isObj(d)) throw bad(what, "不是物件");
  if (!Array.isArray(d.records)) throw bad(what, "缺少 records 陣列");
  if (!isCount(d.total)) throw bad(what, "total 不是數字");
  for (const k of ["page", "per_page"]) if (d[k] !== undefined && !isCount(d[k])) throw bad(what, `${k} 不是數字`);
  everyObj(d.records, what, "records");
  if (d.records.length > d.total) throw bad(what, "records 筆數大於 total");
  return d as { total: number; page?: number; per_page?: number; records: Obj[]; warnings?: unknown };
}

/** GET /api/v1/datasets/{slug}/records/{id}：{record:{…}} */
export function expectRecord(d: unknown): Obj {
  if (!isObj(d) || !isObj(d.record)) throw bad("單筆記錄", "缺少 record 物件");
  return d.record;
}

/** GET /api/v1/datasets/{slug}/agg：group_by 必填，回傳 {total_records, total_groups, groups[]} */
export function expectAgg(d: unknown): Obj & { total_records: number } {
  const what = "統計";
  if (!isObj(d)) throw bad(what, "不是物件");
  if (!isCount(d.total_records)) throw bad(what, "total_records 不是數字");
  if (!Array.isArray(d.groups)) throw bad(what, "缺少 groups 陣列");
  if (!isCount(d.total_groups)) throw bad(what, "total_groups 不是數字");
  everyObj(d.groups, what, "groups", (g) => "key" in g && isObj(g.stats));
  return d as Obj & { total_records: number };
}
