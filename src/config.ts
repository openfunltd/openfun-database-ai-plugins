/**
 * 執行期設定。
 *
 * 一般使用者唯一需要設定的是 Token：Claude Desktop 依 manifest.json 的
 * user_config.api_token（sensitive: true，存於 OS 憑證儲存區）以環境變數
 * OPENFUN_API_TOKEN 注入。服務網址固定為正式站；只有開發測試可以用
 * OPENFUN_DEV_BASE_URL 指向本機 loopback 位址，避免 Token 被送到其他主機。
 */

export const PRODUCTION_BASE_URL = "https://data.openfun.tw";
export const TOKEN_PAGE_URL = "https://data.openfun.tw/user";

export const DEFAULT_TIMEOUT_MS = 20_000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 120_000;
const MAX_TOKEN_LENGTH = 512;
/**
 * 後端 ApiToken::createForUser() 產生的 Token 為 "ofk_" + bin2hex(random_bytes(32))，共 68 字元。
 * 為相容可能存在的舊格式只要求至少 20 字元；過短的值通常是貼錯，也會讓遮蔽誤傷一般文字。
 */
export const MIN_TOKEN_LENGTH = 20;

export interface RuntimeConfig {
  baseUrl: string;
  token: string | null;
  /** 設定了值但格式不正確時的原因（不含 Token 本身） */
  tokenProblem: string | null;
  timeoutMs: number;
  isDevOverride: boolean;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** 開發用 base URL 只接受 loopback，其他一律拒絕。 */
export function resolveBaseUrl(devOverride: string | undefined): { baseUrl: string; isDevOverride: boolean } {
  if (!devOverride) return { baseUrl: PRODUCTION_BASE_URL, isDevOverride: false };
  let url: URL;
  try {
    url = new URL(devOverride);
  } catch {
    throw new Error("OPENFUN_DEV_BASE_URL 不是有效的網址");
  }
  if (!["http:", "https:"].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("OPENFUN_DEV_BASE_URL 只允許本機 loopback 位址（127.0.0.1、localhost、[::1]）");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("OPENFUN_DEV_BASE_URL 只能包含 scheme、主機與連接埠");
  }
  return { baseUrl: url.origin, isDevOverride: true };
}

/**
 * 檢查 Token 能否安全放進 HTTP header。
 * 回傳 null 表示可用；否則回傳不含 Token 內容的原因說明。
 */
export function checkToken(raw: string | undefined): { token: string | null; problem: string | null } {
  if (raw === undefined) return { token: null, problem: null };
  const token = raw.trim();
  if (token === "") return { token: null, problem: null };
  // 宿主未替換變數時會留下字面 ${user_config.xxx}
  if (/^\$\{user_config\.[^}]*\}$/.test(token)) return { token: null, problem: null };
  if (token.length > MAX_TOKEN_LENGTH) {
    return { token: null, problem: "Token 長度異常，請確認只貼上 Token 本身。" };
  }
  if (/^bearer\s/i.test(token)) {
    return { token: null, problem: "Token 前面不需要加「Bearer」，請只貼上 Token 本身。" };
  }
  if (!/^[\x21-\x7e]+$/.test(token)) {
    return { token: null, problem: "Token 含有空白、換行或非英數符號，請重新複製貼上 Token。" };
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    return { token: null, problem: "Token 太短，可能只複製到一部分；請到帳號頁面重新複製完整的 Token。" };
  }
  return { token, problem: null };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const { baseUrl, isDevOverride } = resolveBaseUrl(env.OPENFUN_DEV_BASE_URL);
  const { token, problem } = checkToken(env.OPENFUN_API_TOKEN);
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (env.OPENFUN_DEV_TIMEOUT_MS) {
    const n = Number(env.OPENFUN_DEV_TIMEOUT_MS);
    if (Number.isFinite(n)) timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(n)));
  }
  return { baseUrl, token, tokenProblem: problem, timeoutMs, isDevOverride };
}
