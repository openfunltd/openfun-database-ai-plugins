/**
 * Codex plugin 的 Token 設定檔（Claude Desktop MCPB 不使用）。
 *
 * 位置固定在使用者設定目錄，不放在 plugin 快取，因此更新或重裝 plugin 不會遺失，也不會被打包：
 * - Windows：%APPDATA%\openfun-data\credentials.json
 * - macOS／Linux：$HOME/.config/openfun-data/credentials.json
 *
 * 路徑只由 HOME（Windows 為 APPDATA）決定：Codex 啟動 stdio MCP server 時只傳遞少數環境變數
 * （POSIX 為 HOME、PATH、USER 等；Windows 含 APPDATA、USERPROFILE），不包含 XDG_CONFIG_HOME，
 * 所以刻意不用 XDG_CONFIG_HOME，確保設定程式與 MCP server 看到同一個檔案。
 *
 * POSIX 上目錄為 0700、檔案為 0600，且讀取時拒絕權限過寬、非本人擁有或符號連結的檔案。
 * Windows 不使用 POSIX 權限位元，檔案權限沿用使用者設定目錄的 ACL；這不是加密儲存。
 */

import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, chmodSync, unlinkSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { checkToken } from "./config.js";

export const CREDENTIALS_DIR_NAME = "openfun-data";
export const CREDENTIALS_FILE_NAME = "credentials.json";
const MAX_FILE_BYTES = 4096;

export function credentialsPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    const base = env.APPDATA || join(env.USERPROFILE || homedir(), "AppData", "Roaming");
    return join(base, CREDENTIALS_DIR_NAME, CREDENTIALS_FILE_NAME);
  }
  return join(env.HOME || homedir(), ".config", CREDENTIALS_DIR_NAME, CREDENTIALS_FILE_NAME);
}

const isPosix = (platform: NodeJS.Platform) => platform !== "win32";

export interface CredentialsReadResult {
  token: string | null;
  /** 檔案存在但不可用時的原因（不含 Token 內容） */
  problem: string | null;
  exists: boolean;
}

export function readCredentials(path: string, platform: NodeJS.Platform = process.platform): CredentialsReadResult {
  let st;
  try {
    st = lstatSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { token: null, problem: null, exists: false };
    return { token: null, problem: "無法讀取 Token 設定檔，請重新執行設定程式。", exists: true };
  }
  if (!st.isFile()) return { token: null, problem: "Token 設定檔不是一般檔案（可能是符號連結），已拒絕使用；請重新執行設定程式。", exists: true };
  if (isPosix(platform)) {
    if ((st.mode & 0o077) !== 0) {
      return { token: null, problem: "Token 設定檔權限過寬（其他使用者可讀），已拒絕使用；請重新執行設定程式修正。", exists: true };
    }
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) {
      return { token: null, problem: "Token 設定檔不屬於目前的使用者，已拒絕使用；請重新執行設定程式。", exists: true };
    }
  }
  if (st.size > MAX_FILE_BYTES) return { token: null, problem: "Token 設定檔格式異常，請重新執行設定程式。", exists: true };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { token: null, problem: "Token 設定檔格式異常，請重新執行設定程式。", exists: true };
  }
  const raw = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).api_token : undefined;
  if (typeof raw !== "string") return { token: null, problem: "Token 設定檔格式異常，請重新執行設定程式。", exists: true };
  const checked = checkToken(raw);
  if (!checked.token) return { token: null, problem: checked.problem ?? "Token 設定檔中沒有 Token，請重新執行設定程式。", exists: true };
  return { token: checked.token, problem: null, exists: true };
}

/** 以 0600 暫存檔寫入後原子替換。Token 先經過與 MCP server 相同的格式檢查。 */
export function writeCredentials(path: string, rawToken: string, platform: NodeJS.Platform = process.platform): void {
  const checked = checkToken(rawToken);
  if (!checked.token) throw new Error(checked.problem ?? "Token 是空的。");
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dst = lstatSync(dir);
  if (!dst.isDirectory()) throw new Error(`設定目錄不是一般目錄：${dir}`);
  if (isPosix(platform)) {
    if (typeof process.getuid === "function" && dst.uid !== process.getuid()) throw new Error(`設定目錄不屬於目前的使用者：${dir}`);
    chmodSync(dir, 0o700);
  }
  try {
    const existing = lstatSync(path);
    if (!existing.isFile()) throw new Error(`既有的設定檔不是一般檔案，請先手動移除：${path}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const tmp = join(dir, `.${CREDENTIALS_FILE_NAME}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const body = JSON.stringify({ version: 1, api_token: checked.token }) + "\n";
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    if (isPosix(platform)) chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/** 刪除設定檔；回傳是否原本存在。 */
export function removeCredentials(path: string): boolean {
  try {
    const st = lstatSync(path);
    if (st.isDirectory()) throw new Error(`設定檔路徑是目錄，未刪除：${path}`);
    unlinkSync(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
