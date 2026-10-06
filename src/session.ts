/**
 * 執行中的 Token 狀態。
 *
 * 每次工具呼叫開始時取得一份不可變的快照（OpenFunClient＋schema 快取），整個呼叫都用同一份快照
 * 送出 Authorization header 與遮蔽輸出。Token 被取代或清除時建立新的快照：舊快照的 schema 快取
 * 隨之丟棄，進行中的舊呼叫仍用自己的舊 Token 遮蔽，不會因為換了 Token 而漏遮。
 *
 * Codex 的對話 Token 只存在這個 MCP server 程序的記憶體：不寫檔、不寫 log，程序結束即消失。
 * 設定與清除依呼叫順序逐一執行，避免兩次設定的驗證結果交錯覆蓋。
 */

import { OpenFunClient, paths } from "./client.js";
import { checkToken } from "./config.js";
import { expectMe } from "./contracts.js";
import { OpenFunError } from "./errors.js";
import type { HostProfile } from "./host.js";
import type { DatasetDetail } from "./schema.js";

/** env／credentials-file 為啟動時載入；chat 為對話中設定；cleared 為本程序已清除（不再改用其他來源） */
export type TokenSource = "env" | "credentials-file" | "chat" | "cleared" | "none";

export interface TokenSnapshot {
  readonly client: OpenFunClient;
  readonly source: TokenSource;
  readonly detailCache: Map<string, { at: number; detail: DatasetDetail }>;
}

export interface SessionOptions {
  baseUrl: string;
  host: HostProfile;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
}

export interface SetTokenResult {
  displayName: string | null;
  email: string | null;
  /** 被取代的快照（呼叫端用來遮蔽舊 Token） */
  previous: TokenSnapshot;
}

export const CLEARED_REASON = "已清除這次執行中的 Token。";

export class TokenSession {
  readonly host: HostProfile;
  readonly #opts: SessionOptions;
  #current: TokenSnapshot;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(opts: SessionOptions, initial: { token: string | null; tokenProblem?: string | null; source: TokenSource }) {
    this.#opts = opts;
    this.host = opts.host;
    this.#current = this.#snapshot(initial.token, initial.tokenProblem ?? null, initial.token ? initial.source : initial.source === "cleared" ? "cleared" : "none");
  }

  #snapshot(token: string | null, tokenProblem: string | null, source: TokenSource): TokenSnapshot {
    const client = new OpenFunClient({
      baseUrl: this.#opts.baseUrl,
      token,
      tokenProblem,
      timeoutMs: this.#opts.timeoutMs,
      maxResponseBytes: this.#opts.maxResponseBytes,
      fetchImpl: this.#opts.fetchImpl,
      host: this.#opts.host,
    });
    return Object.freeze({ client, source, detailCache: new Map() });
  }

  /** 目前有效的快照；一次工具呼叫只取一次 */
  snapshot(): TokenSnapshot {
    return this.#current;
  }

  #serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(fn, fn);
    this.#queue = run.catch(() => {});
    return run;
  }

  /**
   * 先做格式檢查，再以新 Token 呼叫固定的 GET /api/v1/me；成功才取代目前的 Token。
   * 任何失敗都保留原狀態並丟出不含 Token 的 OpenFunError。
   */
  setToken(raw: string): Promise<SetTokenResult> {
    return this.#serialize(async () => {
      const checked = checkToken(raw);
      if (!checked.token) {
        throw new OpenFunError("validation", checked.problem ?? "沒有收到 Token。", {
          hint: "請只貼上歐噴 API Token 本身。目前的 Token 狀態沒有改變。",
        });
      }
      const candidate = this.#snapshot(checked.token, null, "chat");
      const { data } = await candidate.client.getJson(paths.me(), { auth: "required" });
      const me = expectMe(data);
      const previous = this.#current;
      this.#current = candidate;
      return { displayName: me.display_name, email: me.email, previous };
    });
  }

  /** 清除本程序的有效 Token；之後不改用設定檔或環境變數，直到再次設定或重新啟動。 */
  clearToken(): Promise<{ previous: TokenSnapshot }> {
    return this.#serialize(async () => {
      const previous = this.#current;
      this.#current = this.#snapshot(null, CLEARED_REASON, "cleared");
      return { previous };
    });
  }
}
