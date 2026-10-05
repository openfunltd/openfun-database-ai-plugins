/**
 * 資料集 schema 解析。GET /api/v1/datasets/{slug} 回傳的 schema 位於
 * `meta.schema`（陣列，每欄含 name/type/description/alias/filter/multi/reference/children），
 * 授權引用文字在頂層 `citation`（後端從 meta.license 搬出），來源在 `meta.sources`。
 */

export interface SchemaColumn {
  name: string;
  type?: string;
  description?: string;
  alias?: string;
  filter?: boolean;
  multi?: boolean;
  reference?: string;
  children?: SchemaColumn[];
  [k: string]: unknown;
}

export interface DatasetDetail {
  slug: string;
  title?: string;
  description?: string;
  type?: string;
  access_level?: string;
  dataset_role?: unknown;
  tags?: unknown;
  warnings?: unknown;
  topic_slugs?: unknown;
  meta?: Record<string, unknown> & { schema?: unknown; sources?: unknown; update_frequency?: unknown };
  last_updated_at?: string;
  citation?: string;
  skill_md_url?: string;
}

export function getSchema(detail: DatasetDetail | null | undefined): SchemaColumn[] {
  const raw = detail?.meta?.schema;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is SchemaColumn => !!c && typeof c === "object" && typeof (c as SchemaColumn).name === "string");
}

export interface SchemaIndex {
  columns: SchemaColumn[];
  names: Set<string>;
  /** object 欄位中 filter:true 的子欄位，例如「董監事.姓名」 */
  subFilterKeys: Set<string>;
  typeOf: Map<string, string>;
}

export function indexSchema(columns: SchemaColumn[]): SchemaIndex {
  const names = new Set<string>();
  const subFilterKeys = new Set<string>();
  const typeOf = new Map<string, string>();
  for (const c of columns) {
    names.add(c.name);
    typeOf.set(c.name, c.type ?? "keyword");
    if (c.type === "object" && Array.isArray(c.children)) {
      for (const ch of c.children) {
        if (ch && typeof ch.name === "string" && ch.filter) {
          subFilterKeys.add(`${c.name}.${ch.name}`);
          typeOf.set(`${c.name}.${ch.name}`, ch.type ?? "keyword");
        }
      }
    }
  }
  return { columns, names, subFilterKeys, typeOf };
}

/** 給模型看的精簡 schema（保留所有欄位，不刪欄位） */
export function describeSchema(columns: SchemaColumn[]): unknown[] {
  return columns.map((c) => {
    const out: Record<string, unknown> = { name: c.name, type: c.type ?? "keyword" };
    if (c.description) out.description = c.description;
    if (c.filter) out.filter = true;
    if (c.multi) out.multi = true;
    if (c.alias) out.alias = c.alias;
    if (c.reference) out.reference = c.reference;
    if (Array.isArray(c.children) && c.children.length) out.children = describeSchema(c.children);
    return out;
  });
}

export function queryHints(idx: SchemaIndex): Record<string, string[]> {
  const exact: string[] = [];
  const numberOrDate: string[] = [];
  const text: string[] = [];
  const groupable: string[] = [];
  for (const c of idx.columns) {
    const t = c.type ?? "keyword";
    if (t === "text") text.push(c.name);
    else if (t !== "object") exact.push(c.name);
    if (["number", "integer", "long", "float", "double", "date", "datetime"].includes(t)) numberOrDate.push(c.name);
    if (c.filter && t !== "text") groupable.push(c.name);
  }
  return {
    exact_filter_fields: exact,
    object_sub_filter_fields: [...idx.subFilterKeys],
    range_candidate_fields: numberOrDate,
    text_search_fields: text,
    group_by_candidates: [...groupable, ...idx.subFilterKeys],
  };
}

export function listForMessage(items: Iterable<string>, max = 60): string {
  const arr = [...items];
  const shown = arr.slice(0, max).join("、");
  return arr.length > max ? `${shown}…（共 ${arr.length} 個）` : shown;
}
