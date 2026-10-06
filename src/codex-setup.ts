/**
 * Codex plugin 的 Token 設定程式（setup.mjs）。使用者本人在自己的終端機執行：
 *   node setup.mjs            設定或取代 Token（輸入不顯示）
 *   node setup.mjs --status   查看設定狀態（不顯示 Token）
 *   node setup.mjs --remove   移除 Token
 *
 * Token 只從互動式終端機讀取：不接受命令列參數、環境變數或管線輸入，避免留在 shell 歷史、
 * 程序列表或 AI 助理的對話紀錄中。本程式不連線到任何網路服務。
 */

import { CREDENTIALS_FILE_NAME, credentialsPath, readCredentials, removeCredentials, writeCredentials } from "./credentials.js";
import { TOKEN_PAGE_URL, checkToken } from "./config.js";

export interface SetupInput extends NodeJS.EventEmitter {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume(): unknown;
  pause(): unknown;
}

export interface SetupOutput {
  isTTY?: boolean;
  write(chunk: string): unknown;
}

export interface SetupIO {
  stdin: SetupInput;
  stdout: SetupOutput;
  stderr: SetupOutput;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
}

const MAX_INPUT = 1024;

const USAGE = `歐噴資料庫 Codex plugin：Token 設定程式

用法：
  node setup.mjs            設定或取代 Token（會提示貼上，輸入內容不會顯示）
  node setup.mjs --status   查看是否已設定（不顯示 Token）
  node setup.mjs --remove   移除已儲存的 Token
  node setup.mjs --help     顯示說明

Token 請到 ${TOKEN_PAGE_URL} 建立。本程式不接受從命令列或管線傳入 Token。
`;

class Aborted extends Error {}

/**
 * 以 raw mode 逐鍵讀取一行。echo=false 時完全不回顯（也不顯示 *）。
 * 支援 Enter 結束、Backspace、Ctrl-U 清除、Ctrl-C／Ctrl-D 取消，忽略方向鍵與 bracketed paste 標記。
 */
export function readKeys(stdin: SetupInput, stdout: SetupOutput, echo: boolean): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let value = "";
    let escape = false;
    const finish = (err: Error | null) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      stdout.write("\n");
      if (err) reject(err);
      else resolvePromise(value);
    };
    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const ch of text) {
        if (escape) {
          // CSI 序列（例如 \x1b[A、\x1b[200~）以字母或 ~ 結束
          if (/[A-Za-z~]/.test(ch)) escape = false;
          continue;
        }
        if (ch === "\x1b") {
          escape = true;
          continue;
        }
        if (ch === "\r" || ch === "\n") return finish(null);
        if (ch === "\x03" || (ch === "\x04" && value === "")) return finish(new Aborted());
        if (ch === "\x7f" || ch === "\b") {
          if (value.length > 0) {
            value = [...value].slice(0, -1).join("");
            if (echo) stdout.write("\b \b");
          }
          continue;
        }
        if (ch === "\x15") {
          if (echo) stdout.write("\b \b".repeat([...value].length));
          value = "";
          continue;
        }
        if (ch < " ") continue;
        if (value.length >= MAX_INPUT) continue;
        value += ch;
        if (echo) stdout.write(ch);
      }
    };
    stdin.setRawMode?.(true);
    stdin.on("data", onData);
    stdin.resume();
  });
}

function permissionNote(platform: NodeJS.Platform): string {
  return platform === "win32"
    ? "（Windows 不使用 POSIX 檔案權限；檔案沿用使用者設定目錄的存取權限，並非加密儲存）"
    : "（目錄權限 700、檔案權限 600，僅限目前使用者讀取；並非加密儲存）";
}

export async function runSetup(argv: string[], io: SetupIO): Promise<number> {
  const { stdin, stdout, stderr, env, platform } = io;
  const path = credentialsPath(env, platform);
  const flags = new Set(argv);
  const known = new Set(["--status", "--remove", "--help", "-h"]);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) {
    stderr.write("不支援的參數。為了安全，本程式不接受從命令列傳入 Token；請直接執行 node setup.mjs 再依提示貼上。\n\n");
    stderr.write(USAGE);
    return 2;
  }
  if (flags.has("--help") || flags.has("-h")) {
    stdout.write(USAGE);
    return 0;
  }

  if (flags.has("--status")) {
    const r = readCredentials(path, platform);
    stdout.write(`設定檔：${path}\n`);
    if (r.token) stdout.write("狀態：已設定 Token（不顯示內容）。\n");
    else if (r.problem) stdout.write(`狀態：設定檔無法使用：${r.problem}\n`);
    else stdout.write("狀態：尚未設定 Token。\n");
    if (typeof env.OPENFUN_API_TOKEN === "string" && env.OPENFUN_API_TOKEN.trim() !== "") {
      stdout.write("注意：目前的環境變數 OPENFUN_API_TOKEN 有值；若 MCP server 收到此變數會優先使用它。\n");
    }
    return 0;
  }

  if (flags.has("--remove")) {
    const removed = removeCredentials(path);
    stdout.write(removed ? `已移除 Token：${path}\n請重新啟動 Codex 讓變更生效。\n` : `沒有已儲存的 Token（${path}）。\n`);
    return 0;
  }

  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    stderr.write(
      "需要在互動式終端機中執行，才能在不顯示 Token 的情況下輸入。\n" +
        "請開啟終端機（macOS「終端機」、Windows「PowerShell」）直接執行 node setup.mjs；本程式不接受管線或重新導向輸入。\n",
    );
    return 1;
  }

  try {
    const existing = readCredentials(path, platform);
    if (existing.exists) {
      stdout.write(existing.token ? "已經設定過 Token。要取代嗎？(y/N) " : `現有設定檔無法使用（${existing.problem}）。要重新設定嗎？(y/N) `);
      const answer = (await readKeys(stdin, stdout, true)).trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        stdout.write("未變更。\n");
        return 0;
      }
    }
    stdout.write(`請貼上歐噴 API Token（到 ${TOKEN_PAGE_URL} 建立），貼上後按 Enter。輸入內容不會顯示：`);
    const raw = await readKeys(stdin, stdout, false);
    const checked = checkToken(raw);
    if (!checked.token) {
      stderr.write(`未儲存：${checked.problem ?? "沒有輸入 Token。"}\n`);
      return 1;
    }
    writeCredentials(path, checked.token, platform);
    stdout.write(
      `已儲存 Token 到 ${path}\n${permissionNote(platform)}\n` +
        "本程式只檢查 Token 格式、沒有連線驗證。請重新啟動 Codex 讓設定生效，再請 Codex「檢查歐噴資料庫設定」向歐噴確認 Token 是否有效。\n",
    );
    return 0;
  } catch (err) {
    if (err instanceof Aborted) {
      stderr.write("已取消，未變更。\n");
      return 130;
    }
    stderr.write(`設定失敗：${(err as Error).message}\n`);
    return 1;
  }
}

export { CREDENTIALS_FILE_NAME };
