/**
 * 查詢字串序列化，對應後端 TinyDB::parseQueryString() 的語法：
 *
 * - 一般欄位精確篩選：欄位=值；多值用重複 key（欄位=甲&欄位=乙）
 * - 欄位全文搜尋：q[欄位]=值（不可與整體 q 同時使用，後端會覆蓋）
 * - 範圍：欄位>=值、欄位<=值、欄位>值、欄位<值
 *   後端先 urldecode 整段再比對運算子，所以運算子以 %3E/%3C 編碼也能正確解析，
 *   且不會被 fetch 的 URL 解析器再改寫。
 * - 排序：sort=欄位>（升冪）或 sort=欄位<（降冪）
 *
 * 不使用 URLSearchParams（會把空白編成 +）或 PHP http_build_query 風格的 a[0]=。
 */

import { OpenFunError } from "./errors.js";

export type FilterValue = string | string[];
export type RangeOp = "gte" | "lte" | "gt" | "lt";
export type RangeSpec = Partial<Record<RangeOp, string>>;

const RANGE_OP_ENCODED: Record<RangeOp, string> = {
  gte: "%3E=",
  lte: "%3C=",
  gt: "%3E",
  lt: "%3C",
};

/** 後端保留的 query key，不能當成欄位篩選 */
export const RESERVED_KEYS = new Set([
  "q",
  "_id",
  "_ids",
  "page",
  "per_page",
  "limit",
  "offset",
  "sort",
  "_as_of",
  "__range__",
  "fields",
  "facets",
  "schema",
  "field",
  "metrics",
  "group_by",
]);

export const MAX_FIELD_NAME_LENGTH = 100;
/** 後端以 substr(…, 0, 200) 截斷 q 與範圍值（以位元組計） */
export const MAX_BACKEND_BYTES = 200;

const enc = (s: string): string => encodeURIComponent(s);
const byteLength = (s: string): number => Buffer.byteLength(s, "utf8");

export function validateFieldName(name: string, where: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new OpenFunError("validation", `${where}：欄位名稱不可為空`);
  }
  if (name.length > MAX_FIELD_NAME_LENGTH) {
    throw new OpenFunError("validation", `${where}：欄位名稱過長（${name.slice(0, 20)}…）`);
  }
  if (name.trim() !== name) {
    throw new OpenFunError("validation", `${where}：欄位名稱「${name}」前後不可有空白`);
  }
  if (/[\u0000-\u001f\u007f<>=&#\[\]]/.test(name)) {
    throw new OpenFunError("validation", `${where}：欄位名稱「${name}」含有不允許的字元（< > = & # [ ] 或控制字元）`);
  }
  if (RESERVED_KEYS.has(name) || name.startsWith("__")) {
    throw new OpenFunError("validation", `${where}：「${name}」是保留參數名稱，不能當作欄位篩選`);
  }
}

function validateValue(value: string, where: string, maxBytes: number | null): void {
  if (typeof value !== "string") throw new OpenFunError("validation", `${where}：值必須是文字`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new OpenFunError("validation", `${where}：值含有控制字元`);
  }
  if (maxBytes !== null && byteLength(value) > maxBytes) {
    throw new OpenFunError(
      "validation",
      `${where}：值超過 ${maxBytes} 位元組（約 ${Math.floor(maxBytes / 3)} 個中文字），後端會截斷，請縮短關鍵字`,
    );
  }
}

export interface RecordsQuery {
  q?: string;
  qFields?: Record<string, string>;
  filters?: Record<string, FilterValue>;
  ranges?: Record<string, RangeSpec>;
  sort?: { field: string; direction: "asc" | "desc" };
  page?: number;
  perPage?: number;
  asOf?: string;
  ids?: string[];
}

export interface AggQuery {
  groupBy?: string;
  field?: string;
  metrics?: string[];
  filters?: Record<string, FilterValue>;
  asOf?: string;
}

function pushFilters(parts: string[], filters: Record<string, FilterValue> | undefined): void {
  if (!filters) return;
  for (const [field, raw] of Object.entries(filters)) {
    validateFieldName(field, "filters");
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length === 0) throw new OpenFunError("validation", `filters：欄位「${field}」至少需要一個值`);
    for (const v of values) {
      validateValue(v, `filters.${field}`, null);
      parts.push(`${enc(field)}=${enc(v)}`);
    }
  }
}

export function buildRecordsQuery(query: RecordsQuery): string {
  const parts: string[] = [];
  const hasQFields = query.qFields && Object.keys(query.qFields).length > 0;
  if (query.q !== undefined && query.q !== "" && hasQFields) {
    throw new OpenFunError("validation", "q（全部欄位搜尋）與 q_fields（指定欄位搜尋）不能同時使用；後端只會採用其中一種");
  }
  if (query.q !== undefined && query.q !== "") {
    validateValue(query.q, "q", MAX_BACKEND_BYTES);
    parts.push(`q=${enc(query.q)}`);
  }
  if (hasQFields) {
    for (const [field, v] of Object.entries(query.qFields!)) {
      validateFieldName(field, "q_fields");
      if (v === "") throw new OpenFunError("validation", `q_fields.${field}：搜尋文字不可為空`);
      validateValue(v, `q_fields.${field}`, MAX_BACKEND_BYTES);
      parts.push(`q%5B${enc(field)}%5D=${enc(v)}`);
    }
  }
  pushFilters(parts, query.filters);
  if (query.ranges) {
    for (const [field, spec] of Object.entries(query.ranges)) {
      validateFieldName(field, "ranges");
      const ops = Object.entries(spec).filter(([, v]) => v !== undefined) as Array<[RangeOp, string]>;
      if (ops.length === 0) throw new OpenFunError("validation", `ranges.${field}：至少需要 gte/lte/gt/lt 其中一個`);
      if (query.filters && field in query.filters) {
        throw new OpenFunError("validation", `欄位「${field}」不能同時有精確篩選與範圍篩選`);
      }
      for (const [op, v] of ops) {
        if (!(op in RANGE_OP_ENCODED)) throw new OpenFunError("validation", `ranges.${field}：不支援的運算 ${op}`);
        validateValue(v, `ranges.${field}.${op}`, MAX_BACKEND_BYTES);
        if (v === "") throw new OpenFunError("validation", `ranges.${field}.${op}：值不可為空`);
        if (/^[=<>]/.test(v)) {
          throw new OpenFunError("validation", `ranges.${field}.${op}：值不可用 = < > 開頭（會被誤判為其他運算子）`);
        }
        parts.push(`${enc(field)}${RANGE_OP_ENCODED[op]}${enc(v)}`);
      }
    }
  }
  if (query.sort) {
    validateFieldName(query.sort.field, "sort");
    parts.push(`sort=${enc(query.sort.field + (query.sort.direction === "asc" ? ">" : "<"))}`);
  }
  if (query.page !== undefined) parts.push(`page=${query.page}`);
  if (query.perPage !== undefined) parts.push(`per_page=${query.perPage}`);
  if (query.asOf !== undefined) parts.push(`_as_of=${enc(query.asOf)}`);
  if (query.ids && query.ids.length > 0) {
    for (const id of query.ids) {
      validateValue(id, "ids", null);
      if (id === "" || id.includes(",")) throw new OpenFunError("validation", "ids：每個 ID 不可為空，也不可包含逗號");
    }
    parts.push(`_ids=${enc(query.ids.join(","))}`);
  }
  return parts.join("&");
}

export function buildAggQuery(query: AggQuery): string {
  const parts: string[] = [];
  if (!query.groupBy) {
    throw new OpenFunError("validation", "統計 API 必須提供 group_by 分組欄位；field 是選填的數值欄位");
  }
  if (query.groupBy) {
    validateValue(query.groupBy, "group_by", null);
    parts.push(`group_by=${enc(query.groupBy)}`);
  }
  if (query.field) {
    validateValue(query.field, "field", null);
    parts.push(`field=${enc(query.field)}`);
  }
  if (query.metrics && query.metrics.length > 0) parts.push(`metrics=${enc(query.metrics.join(","))}`);
  pushFilters(parts, query.filters);
  if (query.asOf !== undefined) parts.push(`_as_of=${enc(query.asOf)}`);
  return parts.join("&");
}
