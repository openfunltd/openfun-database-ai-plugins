/**
 * 不同宿主（Claude Desktop 擴充套件、Codex plugin）在「Token 怎麼設定」上不同：Claude Desktop 用擴充套件
 * 設定欄位；Codex 另有 openfun_set_token／openfun_clear_token 讓使用者在對話中設定。
 * 查詢、驗證、遮蔽與錯誤語意完全相同。未指定時一律為 Claude Desktop（MCPB 的原行為）。
 */

import { TOKEN_PAGE_URL } from "./config.js";

export type HostKind = "claude-desktop" | "codex";

export interface HostProfile {
  kind: HostKind;
  /** Token 未設定時的建議 */
  setupHint: string;
  /** Token 失效或被拒時的建議 */
  updateHint: string;
  /** 未設定 Token 的預設原因 */
  emptyReason: string;
  /** EXTENSION_GUIDE 開頭的 Token 說明段落 */
  guideTokenNote: string;
  /** SERVER_INSTRUCTIONS 結尾的 Token 說明 */
  instructionsTokenNote: string;
}

export const CLAUDE_DESKTOP_HOST: HostProfile = {
  kind: "claude-desktop",
  setupHint:
    `請使用者到 ${TOKEN_PAGE_URL} 登入並建立 API Token，再到 Claude Desktop「設定 > 擴充功能（Extensions）」` +
    "找到「歐噴資料庫」，按「設定（Configure）」貼上 Token 後儲存，並重新開啟此擴充套件。",
  updateHint:
    "請到 https://data.openfun.tw/user 確認或重新建立一般 API Token，然後在 Claude Desktop「設定 > 擴充功能」更新本擴充套件的 Token。",
  emptyReason: "擴充套件設定中的「歐噴 API Token」是空的。",
  guideTokenNote: `這個擴充套件只提供唯讀查詢。Token 已由使用者在 Claude Desktop 的擴充套件設定中提供，
請不要在聊天中向使用者索取 Token，也不要要求使用者使用終端機、curl 或 Device Authorization 流程。`,
  instructionsTokenNote: "Token 已在擴充套件設定中，不要在聊天中索取。",
};

/** 請使用者提供 Token 時的固定提示（Codex 對話設定）。 */
export const CODEX_CHAT_TOKEN_PROMPT =
  "請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。";
const TOKEN_PAGE_NOTE = `建立與撤銷 Token：${TOKEN_PAGE_URL}（一般 API Token，不是 Frontend Token）。`;

const CODEX_ASSISTANT_RULE =
  "使用者剛貼出、還沒設定過的 Token，直接用 openfun_set_token 設定；目前已有可用的 Token 時不要再索取。" +
  "曾被拒絕、已過期或已清除的 Token，不要從聊天紀錄自行再次套用，請使用者提供新的短效 Token（除非使用者明確要求重新使用）。" +
  "不要用 shell、curl、命令列或寫檔處理 Token，也不要在回覆中重複 Token 的全部或任何一部分。";

/**
 * Codex plugin：Token 由使用者在對話中貼出，經 openfun_set_token 驗證後只存在本 MCP server 程序的記憶體。
 * 進階選用：使用者也可以自己在終端機執行 plugin 內的 setup.mjs 存到本機設定檔（啟動時載入）。
 */
export function codexHost(setupScriptPath: string): HostProfile {
  return {
    kind: "codex",
    setupHint: `${CODEX_CHAT_TOKEN_PROMPT}${TOKEN_PAGE_NOTE}（給 AI 助理：${CODEX_ASSISTANT_RULE}）`,
    updateHint: `這個 Token 不能用了，請不要再套用同一個 Token。${CODEX_CHAT_TOKEN_PROMPT}${TOKEN_PAGE_NOTE}（給 AI 助理：${CODEX_ASSISTANT_RULE}）`,
    emptyReason: "這次執行中還沒有設定 Token。",
    guideTokenNote: `這個 Codex plugin 的查詢工具都是唯讀。Token 由使用者在對話中提供：需要 Token 時（工具回報尚未設定或 Token 失效），
請告訴使用者：「${CODEX_CHAT_TOKEN_PROMPT}」${TOKEN_PAGE_NOTE}
${CODEX_ASSISTANT_RULE}
設定的 Token 只存在本機 MCP server 程序的記憶體，Codex 重新啟動後需要重新貼上；同一個 Codex 執行中的其他對話也可能共用它。
openfun_clear_token 只清除本程序記憶體中的 Token，不會刪除對話紀錄，也不會撤銷 Token。
無法從 Token 判斷有效期限，不要宣稱已確認它是短效 Token。
進階選用：使用者也可以自己在終端機執行 node "${setupScriptPath}" 把 Token 存到本機設定檔；AI 助理不要代為執行。
不要使用 curl 或 Device Authorization 流程。`,
    instructionsTokenNote:
      `需要 Token 時，請告訴使用者：「${CODEX_CHAT_TOKEN_PROMPT}」${CODEX_ASSISTANT_RULE}` +
      "Token 只存在本機 MCP server 記憶體，重新啟動後需重貼；無法從 Token 判斷有效期限。",
  };
}
