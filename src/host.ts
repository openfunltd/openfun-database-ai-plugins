/**
 * 不同宿主（Claude Desktop 擴充套件、Codex plugin）只在「Token 怎麼設定」的提示文字上不同；
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

/** Codex plugin：Token 由使用者本人執行 plugin 內的 setup.mjs 存到使用者設定檔。 */
export function codexHost(setupScriptPath: string): HostProfile {
  const cmd = `node "${setupScriptPath}"`;
  return {
    kind: "codex",
    setupHint:
      `請使用者到 ${TOKEN_PAGE_URL} 登入並建立 API Token，然後由使用者本人在自己的終端機執行 ${cmd}，` +
      "依提示貼上 Token（輸入時不會顯示），完成後重新啟動 Codex。這個步驟必須由使用者自己操作：" +
      "AI 助理不要代為執行，也不要在對話中索取或轉述 Token。",
    updateHint:
      `請到 ${TOKEN_PAGE_URL} 確認或重新建立一般 API Token，然後由使用者本人在自己的終端機執行 ${cmd} 取代舊 Token，` +
      "再重新啟動 Codex。AI 助理不要代為執行，也不要在對話中索取 Token。",
    emptyReason: "尚未在本機設定檔中設定 Token。",
    guideTokenNote: `這個 Codex plugin 只提供唯讀查詢。Token 由使用者本人用 plugin 內的設定程式存放在本機使用者設定檔，
請不要在對話中向使用者索取 Token，也不要代為執行 Token 設定程式或使用 curl、Device Authorization 流程。`,
    instructionsTokenNote: "Token 由使用者在本機設定，不要在對話中索取，也不要代為執行設定程式。",
  };
}
