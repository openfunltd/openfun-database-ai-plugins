/**
 * 不同宿主（Claude Desktop 擴充套件、Codex plugin）在「Token 怎麼設定」上不同：Claude Desktop 用擴充套件
 * 設定欄位；Codex 獨立本機 MCP 優先由使用者在畫面的環境變數設定，另有 openfun_set_token／openfun_clear_token
 * 讓選擇對話方式的使用者在對話中設定。
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

/** 使用者選擇在對話中設定 Token 時的固定提示（選用方式）。 */
export const CODEX_CHAT_TOKEN_PROMPT =
  "請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。";
const CODEX_MCP_TOKEN_HINT =
  "在 Codex「設定 → MCP 伺服器」編輯獨立本機歐噴伺服器（例如 openfun-local），" +
  "在「環境變數」新增金鑰 OPENFUN_API_TOKEN，值貼上 Token；「環境變數透傳」留空，儲存後重新啟動 Codex。";

function codexAssistantRule(): string {
  return (
    `預設請使用者本人${CODEX_MCP_TOKEN_HINT}` +
    "這個值會存入 Codex 本機設定，未加密，請勿分享含有 Token 的設定檔或截圖。" +
    "不要主動請使用者把 Token 貼到對話，目前已有可用的 Token 時也不要再索取。" +
    "不要讀取、顯示或搜尋 Token 設定檔或 MCP 環境變數的 Token 值；不要代為用 shell、curl、命令列參數、環境變數或寫檔處理或轉送 Token，也不要在回覆中重複 Token 的全部或任何一部分。" +
    `使用者明確選擇在對話中設定，或主動貼出還沒設定過的 Token 時，才用 openfun_set_token 設定（請求時說：「${CODEX_CHAT_TOKEN_PROMPT}」）；` +
    "這種 Token 只存在本程序記憶體，Codex 重新啟動後需要重貼。" +
    "曾被拒絕、已過期或已清除的 Token，不要從聊天紀錄自行再次套用（除非使用者明確要求重新使用）。"
  );
}

/** Codex：在 MCP 設定畫面輸入環境變數；選用的對話 Token 只存在程序記憶體。 */
export function codexHost(): HostProfile {
  const rule = codexAssistantRule();
  return {
    kind: "codex",
    setupHint:
      `請到 ${TOKEN_PAGE_URL} 建立一般 API Token，${CODEX_MCP_TOKEN_HINT}` +
      `也可選擇在對話中使用短效 Token。（給 AI 助理：${rule}）`,
    updateHint:
      `這個 Token 不能用了，請不要再套用同一個 Token。請到 ${TOKEN_PAGE_URL} 建立新的一般 API Token，` +
      `${CODEX_MCP_TOKEN_HINT}也可選擇在對話中使用新的短效 Token。（給 AI 助理：${rule}）`,
    emptyReason: "這次執行中還沒有設定 Token。",
    guideTokenNote: `這個 Codex plugin 的查詢工具都是唯讀。獨立本機 MCP 建議由使用者本人在設定畫面的 OPENFUN_API_TOKEN 環境變數輸入 Token。
Token 存在 Codex 本機設定，未加密；存一次即可，直到 Token 過期、撤銷或被移除才需要更新。
需要 Token 時（工具回報尚未設定或 Token 失效），請使用者到 ${TOKEN_PAGE_URL} 建立一般 API Token（不是 Frontend Token），
${CODEX_MCP_TOKEN_HINT}重新啟動後用 openfun_check_config 向歐噴確認是否有效。
${rule}
對話設定的 Token 在同一個 Codex 執行中的其他對話也可能共用。
openfun_clear_token 只清除本程序記憶體中的 Token，不會刪除環境變數或對話紀錄，也不會撤銷 Token；重新啟動 Codex 後可能再次載入環境變數。
要移除畫面設定，請使用者本人刪除 MCP 的 OPENFUN_API_TOKEN 項目，並重新啟動 Codex。
無法從 Token 判斷有效期限，不要宣稱已確認它是短效 Token。
不要使用 Device Authorization 流程。`,
    instructionsTokenNote: `需要 Token 時：${rule}無法從 Token 判斷有效期限。`,
  };
}
