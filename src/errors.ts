import { CLAUDE_DESKTOP_HOST, type HostProfile } from "./host.js";

export type ErrorKind =
  | "not_configured"
  | "token_invalid"
  | "token_expired"
  | "token_not_allowed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "rate_limited"
  | "quota_exceeded"
  | "server_error"
  | "redirect"
  | "invalid_response"
  | "too_large"
  | "timeout"
  | "network"
  | "validation";

const KIND_LABEL: Record<ErrorKind, string> = {
  not_configured: "尚未設定 Token",
  token_invalid: "Token 無效或已撤銷",
  token_expired: "Token 已過期",
  token_not_allowed: "Token 類型不適用",
  unauthorized: "需要認證",
  forbidden: "權限不足",
  not_found: "找不到",
  bad_request: "查詢參數有誤",
  rate_limited: "請求過於頻繁",
  quota_exceeded: "今日查詢額度已用完",
  server_error: "歐噴伺服器錯誤",
  redirect: "伺服器回應重新導向（已拒絕跟隨）",
  invalid_response: "伺服器回應格式異常",
  too_large: "回應過大",
  timeout: "連線逾時",
  network: "網路連線失敗",
  validation: "參數驗證失敗",
};

export class OpenFunError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | null;
  /** 給模型與使用者看的建議 */
  readonly hint: string | null;
  /** API 回傳的錯誤訊息（已清理、遮蔽） */
  readonly apiMessage: string | null;
  readonly details: Record<string, unknown> | null;

  constructor(
    kind: ErrorKind,
    message: string,
    opts: { status?: number | null; hint?: string | null; apiMessage?: string | null; details?: Record<string, unknown> | null } = {},
  ) {
    super(message);
    this.name = "OpenFunError";
    this.kind = kind;
    this.status = opts.status ?? null;
    this.hint = opts.hint ?? null;
    this.apiMessage = opts.apiMessage ?? null;
    this.details = opts.details ?? null;
  }

  get label(): string {
    return KIND_LABEL[this.kind];
  }
}

const MAX_ERROR_DETAILS_CHARS = 4_000;
const MAX_ERROR_TEXT_CHARS = 12_000;

const TOKEN_LIKE = /\bofk_[A-Za-z0-9_\-]{4,}/g;
const BEARER_LIKE = /(Bearer\s+)[^\s"'<>]+/gi;

/** 要遮蔽的 Token：單一值，或 Token 取代期間同時涉及的多個值（例如新舊 Token）。 */
export type Secrets = string | null | undefined | ReadonlyArray<string | null | undefined>;

/** 從任何要輸出的文字中遮蔽 Token。 */
export function redact(text: string, token: Secrets): string {
  let out = text;
  // 任何非空 Token 都遮蔽；過短的 Token 已在 config.checkToken 階段被拒絕，不會走到這裡。
  // 長的先處理，避免較短的值先被替換後留下較長值的片段。
  const list = (Array.isArray(token) ? [...token] : [token]).filter((t): t is string => typeof t === "string" && t !== "");
  for (const t of list.sort((a, b) => b.length - a.length)) out = out.split(t).join("[已遮蔽]");
  out = out.replace(BEARER_LIKE, "$1[已遮蔽]");
  out = out.replace(TOKEN_LIKE, "[已遮蔽]");
  return out;
}

/** 清理 API 錯誤訊息：去 HTML、壓縮空白、限制長度。 */
export function sanitizeMessage(raw: unknown, token: Secrets, max = 300): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (s === "") return null;
  s = redact(s, token);
  if (s.length > max) s = s.slice(0, max) + "…";
  return s;
}

export function notConfiguredError(problem: string | null, host: HostProfile = CLAUDE_DESKTOP_HOST): OpenFunError {
  const reason = problem ?? host.emptyReason;
  return new OpenFunError("not_configured", `尚未設定可用的歐噴 API Token：${reason}`, { hint: host.setupHint });
}

/** 將錯誤轉成工具回應文字（不含 Token 與原始 HTML）。 */
export function formatError(err: unknown, token: Secrets): string {
  const e =
    err instanceof OpenFunError
      ? err
      : new OpenFunError("server_error", "擴充套件內部錯誤", { apiMessage: sanitizeMessage(String((err as Error)?.message ?? err), token) });
  const lines = [`錯誤：${e.label}`, e.message];
  if (e.status !== null) lines.push(`HTTP 狀態碼：${e.status}`);
  if (e.apiMessage) lines.push(`API 訊息：${e.apiMessage}`);
  if (e.details) {
    const d = JSON.stringify(e.details, null, 2);
    lines.push(d.length <= MAX_ERROR_DETAILS_CHARS ? `補充資訊：${d}` : `補充資訊：（內容過長，共 ${d.length} 字，已省略）`);
  }
  if (e.hint) lines.push(`建議：${e.hint}`);
  lines.push("（這是錯誤，不代表「查無資料」。請不要用猜測的內容補上結果。）");
  let text = redact(lines.join("\n"), token);
  // 錯誤訊息是純文字，超過上限時截斷並標示（不會切到 JSON，details 已在上面限制）
  if (text.length > MAX_ERROR_TEXT_CHARS) text = `${text.slice(0, MAX_ERROR_TEXT_CHARS)}\n…［錯誤訊息過長，已截斷］`;
  return text;
}
