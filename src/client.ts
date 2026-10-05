/**
 * 歐噴 REST API 客戶端。所有路徑都是固定樣板，slug 與 record id 經過驗證，
 * 工具無法指定任意 URL。Token 只放在 Authorization header，不跟隨 redirect。
 */

import { DEFAULT_TIMEOUT_MS, PRODUCTION_BASE_URL, checkToken } from "./config.js";
import { OpenFunError, notConfiguredError, sanitizeMessage } from "./errors.js";
import { CLAUDE_DESKTOP_HOST, type HostProfile } from "./host.js";
import { VERSION } from "./version.js";

export const USER_AGENT = `openfun-claude-extension/${VERSION}`;
export const SLUG_RE = /^[a-z0-9][a-z0-9._~-]*$/;
const MAX_SLUG_LENGTH = 200;
const MAX_RECORD_ID_LENGTH = 500;
export const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type AuthMode = "required" | "optional" | "none";

export interface ClientOptions {
  baseUrl?: string;
  token: string | null;
  tokenProblem?: string | null;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
  /** Token 設定提示的宿主；預設 Claude Desktop */
  host?: HostProfile;
}

export function assertSlug(slug: string): string {
  if (typeof slug !== "string" || slug.length === 0 || slug.length > MAX_SLUG_LENGTH || !SLUG_RE.test(slug)) {
    throw new OpenFunError(
      "validation",
      `資料集 slug 格式不正確：「${String(slug).slice(0, 80)}」。slug 只含小寫英數與 . _ ~ -，例如 tw.gov.fia.eip~ref~business-tax；請從 openfun_search 結果取得，不要自行猜測。`,
    );
  }
  return slug;
}

export function encodeRecordId(id: string): string {
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_RECORD_ID_LENGTH) {
    throw new OpenFunError("validation", "record_id 不可為空且長度需在 500 字以內");
  }
  if (id === "." || id === ".." || /[\/\\]/.test(id) || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new OpenFunError("validation", "record_id 不可包含 / \\ 或控制字元，也不可為 . 或 ..");
  }
  return encodeURIComponent(id);
}

export const paths = {
  llms: () => "/llms.txt",
  me: () => "/api/v1/me",
  search: () => "/api/v1/search",
  datasets: () => "/api/v1/datasets",
  dataset: (slug: string) => `/api/v1/datasets/${assertSlug(slug)}`,
  records: (slug: string) => `/api/v1/datasets/${assertSlug(slug)}/records`,
  record: (slug: string, id: string) => `/api/v1/datasets/${assertSlug(slug)}/records/${encodeRecordId(id)}`,
  agg: (slug: string) => `/api/v1/datasets/${assertSlug(slug)}/agg`,
  skill: (slug: string) => `/datasets/${assertSlug(slug)}/skill.md`,
};

export interface JsonResult<T = unknown> {
  status: number;
  data: T;
  url: string;
}

export interface TextResult {
  status: number;
  text: string;
  url: string;
}

export class OpenFunClient {
  readonly baseUrl: string;
  readonly hasToken: boolean;
  readonly #token: string | null;
  readonly #tokenProblem: string | null;
  readonly #timeoutMs: number;
  readonly #maxBytes: number;
  readonly #fetch: typeof fetch;
  readonly host: HostProfile;

  constructor(opts: ClientOptions) {
    this.baseUrl = new URL(opts.baseUrl ?? PRODUCTION_BASE_URL).origin;
    // 再檢查一次，確保任何進到 header 與遮蔽流程的 Token 都符合格式與最短長度
    const checked = opts.token === null ? { token: null, problem: null } : checkToken(opts.token);
    this.#token = checked.token;
    this.hasToken = checked.token !== null;
    this.#tokenProblem = opts.tokenProblem ?? checked.problem;
    this.#timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxBytes = opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.#fetch = opts.fetchImpl ?? globalThis.fetch;
    this.host = opts.host ?? CLAUDE_DESKTOP_HOST;
  }

  get tokenProblem(): string | null {
    return this.#tokenProblem;
  }

  /** 供輸出前遮蔽使用；不要把回傳值放進任何輸出。 */
  get secretForRedaction(): string | null {
    return this.#token;
  }

  /** 對外顯示用的網址（不含任何認證資訊） */
  publicUrl(path: string, query = ""): string {
    return this.#buildUrl(path, query).toString();
  }

  #buildUrl(path: string, query: string): URL {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("invalid internal path");
    const url = new URL(path + (query ? `?${query}` : ""), this.baseUrl);
    if (url.origin !== this.baseUrl || url.pathname !== new URL(path, this.baseUrl).pathname) {
      throw new OpenFunError("validation", "組出的網址不在允許範圍內");
    }
    return url;
  }

  async #request(path: string, query: string, auth: AuthMode, accept: string): Promise<{ res: Response; body: Uint8Array; url: URL }> {
    if (auth === "required" && !this.#token) throw notConfiguredError(this.#tokenProblem, this.host);
    const url = this.#buildUrl(path, query);
    const headers: Record<string, string> = { Accept: accept, "User-Agent": USER_AGENT };
    if (auth !== "none" && this.#token) headers.Authorization = `Bearer ${this.#token}`;

    const signal = AbortSignal.timeout(this.#timeoutMs);
    let res: Response;
    try {
      res = await this.#fetch(url, { method: "GET", headers, redirect: "manual", signal });
    } catch (err) {
      throw this.#transportError(err);
    }

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      let host = "未知";
      try {
        host = new URL(res.headers.get("location") ?? "", url).host || host;
      } catch {
        /* ignore */
      }
      throw new OpenFunError("redirect", `伺服器要求重新導向到 ${host}，為保護 Token 已停止，未跟隨。`, {
        status: res.status,
        hint: "可能是服務暫時調整網址；請稍後再試，若持續發生請回報給歐噴資料庫。",
      });
    }

    let body: Uint8Array;
    try {
      body = await this.#readLimited(res);
    } catch (err) {
      if (err instanceof OpenFunError) throw err;
      throw this.#transportError(err);
    }
    return { res, body, url };
  }

  #transportError(err: unknown): OpenFunError {
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return new OpenFunError("timeout", `連線歐噴資料庫超過 ${Math.round(this.#timeoutMs / 1000)} 秒沒有回應。`, {
        hint: "請稍後再試；若是大範圍查詢，請縮小條件或減少 per_page。",
      });
    }
    return new OpenFunError("network", "無法連線到歐噴資料庫（data.openfun.tw）。", {
      hint: "請確認電腦網路連線正常、沒有被防火牆或公司代理伺服器阻擋，稍後再試。",
    });
  }

  async #readLimited(res: Response): Promise<Uint8Array> {
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > this.#maxBytes) {
      await res.body?.cancel().catch(() => {});
      throw this.#tooLarge();
    }
    if (!res.body) return new Uint8Array(0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.#maxBytes) {
        await reader.cancel().catch(() => {});
        throw this.#tooLarge();
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }

  #tooLarge(): OpenFunError {
    return new OpenFunError("too_large", `回應超過 ${Math.round(this.#maxBytes / 1024 / 1024)} MB 上限，已停止讀取。`, {
      hint: "請縮小查詢條件或減少 per_page。",
    });
  }

  #parseJson(body: Uint8Array): unknown {
    const text = new TextDecoder("utf-8").decode(body);
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  #httpError(status: number, parsed: unknown, res: Response): OpenFunError {
    const token = this.#token;
    const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    const code = typeof obj?.error === "string" ? obj.error : null;
    const apiMessage = sanitizeMessage(obj?.message, token) ?? sanitizeMessage(code, token);
    const nonJson = obj === null;

    if (status === 401) {
      if (!this.#token) return notConfiguredError(this.#tokenProblem, this.host);
      const map: Record<string, ["token_expired" | "token_invalid" | "token_not_allowed", string]> = {
        TokenExpired: ["token_expired", "設定的歐噴 API Token 已過期。"],
        InvalidToken: ["token_invalid", "設定的歐噴 API Token 無效或已被撤銷。"],
        FrontendTokenNotAllowed: ["token_not_allowed", "設定的是 Frontend Token，不能用來查詢 API。"],
      };
      const [kind, msg] = (code && map[code]) || (["unauthorized", "歐噴資料庫拒絕了這個 Token。"] as const);
      return new OpenFunError(kind, msg, {
        status,
        apiMessage,
        hint: this.host.updateHint,
      });
    }
    if (status === 403) {
      return new OpenFunError("forbidden", "這個 Token 沒有存取此資料集的權限。", {
        status,
        apiMessage,
        hint: "此資料集可能是非公開資料，或 Token 只限定部分資料集／分類。請改用其他資料集，或到 https://data.openfun.tw/user 確認帳號權限。",
      });
    }
    if (status === 404) {
      return new OpenFunError("not_found", "找不到指定的資料集或資料。", {
        status,
        apiMessage,
        hint: "請用 openfun_search 重新確認 slug 或 ID，不要自行猜測。",
      });
    }
    if (status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const isQuota = code === "daily_quota_exceeded";
      return new OpenFunError(isQuota ? "quota_exceeded" : "rate_limited", isQuota ? "今日免費查詢額度已用完。" : "請求太頻繁，被暫時限制。", {
        status,
        apiMessage,
        details: retryAfter ? { retry_after: sanitizeMessage(retryAfter, token, 40) } : null,
        hint: isQuota
          ? "額度會在台灣時間午夜重置；可到 https://data.openfun.tw/user 查看方案。請不要立刻重試。"
          : "請稍等一段時間再試，避免連續快速呼叫。",
      });
    }
    if (status === 400 || status === 422) {
      const details: Record<string, unknown> = {};
      if (obj) {
        for (const [k, v] of Object.entries(obj)) {
          if (k === "error" || k === "message") continue;
          const s = JSON.stringify(v);
          if (s !== undefined && s.length <= 4000) details[k] = v;
        }
      }
      return new OpenFunError("bad_request", "歐噴 API 回報查詢參數有誤。", {
        status,
        apiMessage,
        details: Object.keys(details).length ? details : null,
        hint: "請用 openfun_get_dataset 確認欄位名稱、型別與可篩選欄位後再查。",
      });
    }
    if (status >= 500) {
      return new OpenFunError("server_error", nonJson ? "歐噴伺服器發生錯誤（回傳非 JSON 錯誤頁）。" : "歐噴伺服器發生錯誤。", {
        status,
        apiMessage: nonJson ? null : apiMessage,
        hint: "這是伺服器端問題，不代表查無資料。可稍後重試一次；仍失敗請告知使用者服務暫時無法使用。",
      });
    }
    return new OpenFunError("server_error", `歐噴 API 回傳非預期的狀態碼 ${status}。`, { status, apiMessage: nonJson ? null : apiMessage });
  }

  /**
   * HTTP 200 但內容是 {error: ...}：不可當成成功。已知錯誤碼依語意分類，其餘視為回應異常。
   */
  #errorIn200(obj: Record<string, unknown>, res: Response): OpenFunError {
    const code = typeof obj.error === "string" ? obj.error : null;
    const pseudoStatus: Record<string, number> = {
      Unauthorized: 401,
      TokenExpired: 401,
      InvalidToken: 401,
      FrontendTokenNotAllowed: 401,
      "Access denied": 403,
      "Dataset not found": 404,
      "Not Found": 404,
      daily_quota_exceeded: 429,
      TooManyRequests: 429,
    };
    if (code && pseudoStatus[code]) {
      const mapped = this.#httpError(pseudoStatus[code], obj, res);
      return new OpenFunError(mapped.kind, `${mapped.message}（伺服器以 HTTP 200 回傳錯誤內容）`, {
        status: 200,
        hint: mapped.hint,
        apiMessage: mapped.apiMessage,
        details: mapped.details,
      });
    }
    return new OpenFunError("invalid_response", "歐噴 API 以 HTTP 200 回傳了錯誤內容，結果不可當成成功或查無資料。", {
      status: 200,
      apiMessage: sanitizeMessage(obj.message, this.#token) ?? sanitizeMessage(code ?? JSON.stringify(obj.error), this.#token),
      hint: "可能是服務暫時異常；請稍後再試，仍失敗請告知使用者服務暫時無法使用。",
    });
  }

  async getJson<T = unknown>(path: string, opts: { query?: string; auth: AuthMode }): Promise<JsonResult<T>> {
    const { res, body, url } = await this.#request(path, opts.query ?? "", opts.auth, "application/json");
    const parsed = this.#parseJson(body);
    if (res.status >= 400) throw this.#httpError(res.status, parsed, res);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, "error")) {
      throw this.#errorIn200(parsed as Record<string, unknown>, res);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (parsed === undefined || (ct !== "" && !/json/i.test(ct))) {
      throw new OpenFunError("invalid_response", "歐噴 API 回應不是有效的 JSON。", {
        status: res.status,
        hint: "可能是服務維護中或被網路設備攔截；請稍後再試。",
      });
    }
    return { status: res.status, data: parsed as T, url: url.toString() };
  }

  async getText(path: string, opts: { auth: AuthMode }): Promise<TextResult> {
    const { res, body, url } = await this.#request(path, "", opts.auth, "text/markdown, text/plain");
    if (res.status >= 400) throw this.#httpError(res.status, this.#parseJson(body), res);
    const ct = res.headers.get("content-type") ?? "";
    if (/html/i.test(ct)) {
      throw new OpenFunError("invalid_response", "伺服器回傳了 HTML 網頁而不是文件內容。", {
        status: res.status,
        hint: "可能是服務維護中；請稍後再試。",
      });
    }
    return { status: res.status, text: new TextDecoder("utf-8").decode(body), url: url.toString() };
  }
}
