# openfun-database-ai-plugins

讓 **Claude Desktop** 和 **Codex** 都能查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
裝好之後，直接在聊天中用中文問問題，例如：

> 幫我查「開放文化基金會」出現在哪些資料集？
> 臺北市資本額超過一億元的公司有幾家？列出前 10 家，附上資料來源。

AI 會自動搜尋資料集、閱讀欄位說明、查詢資料或做統計，並在回答中附上**資料集名稱、網址、授權與資料限制**。所有查詢功能都是**唯讀**，不會修改任何資料。

兩個平台都能從桌面版畫面安裝。Codex 需要 Node.js 18 以上；獨立本機 MCP 的 Token 可直接在設定畫面輸入，也提供對話短效 Token 方式。

## 下載安裝檔（v0.1.0 測試版）

| 平台 | 下載 |
|---|---|
| Claude Desktop（必要） | [openfun-claude-extension.mcpb](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-claude-extension.mcpb) |
| Claude Desktop（可選聊天指引） | [openfun-chat-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-chat-plugin.zip) |
| Codex | [openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-codex-plugin.zip) |

完整發布頁：<https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0>
請直接下載上面的打包檔，不要使用 GitHub 自動產生的「Source code (zip)」當作安裝包。

## 選擇你的平台

| | Claude Desktop | Codex |
|---|---|---|
| 安裝檔 | `openfun-claude-extension.mcpb`（必要）＋ `openfun-chat-plugin.zip`（可選指引） | `openfun-codex-plugin.zip`（本機 plugin） |
| 安裝方式 | 雙擊或在設定畫面安裝 | 新增 GitHub 市集（也提供 ZIP） |
| 需要 Node.js | 不需要 | 需要 18 以上 |
| Token 設定 | 擴充套件設定畫面的欄位 | 獨立本機 MCP 的環境變數欄位；也可用對話 |
| Token 存放 | 系統憑證儲存區（加密） | 畫面設定存在本機設定檔（未加密）；對話 Token 只存在記憶體 |
| 完整說明 | [Claude Desktop 說明](docs/CLAUDE_DESKTOP.md) | [Codex plugin 說明](codex/README.md) |

兩個平台都要到 <https://data.openfun.tw/user> 登入，建立**一般 API Token**（不是 Frontend Token）。
安裝檔請從上方「[下載安裝檔](#下載安裝檔v010-測試版)」取得；開發者也可依下方「原始碼與打包」自行產生。

## Claude Desktop 安裝

適用 macOS 與 Windows，不需要終端機或 Node.js。

1. 雙擊 `openfun-claude-extension.mcpb`（或拖曳到 Claude Desktop 視窗，或從 **Settings > Extensions > Advanced settings > Install Extension…** 選擇）。
2. 按 **Install**，在「歐噴 API Token」欄位貼上 Token，儲存並確認已啟用。
3. （可選）到 **Customize > Plugins** 上傳 `openfun-chat-plugin.zip`，讓 Claude 更會附來源、說明限制。這份 ZIP 單獨安裝**不能查資料**。
4. 開新聊天，問：「請檢查歐噴資料庫的設定是否正常」。

逐步教學、聊天示範、故障排除與隱私說明：[docs/CLAUDE_DESKTOP.md](docs/CLAUDE_DESKTOP.md)。

## Codex 安裝

適用本機 Codex 桌面版，需要 **Node.js 18 以上**。不用管理伺服器。

1. 到「外掛程式」，選擇「本機」，按「新增 → 新增外掛市集」。
2. 「來源」填入 `https://github.com/openfunltd/openfun-database-ai-plugins.git`，「Git 參照」填入 `codex-marketplace`，「稀疏路徑」留空。
3. 在 OpenFun 市集安裝「歐噴資料庫」，開新對話說：「請直接呼叫歐噴 MCP 的 openfun_check_config」。
4. 使用獨立本機 MCP 時，在「設定 → MCP 伺服器」編輯歐噴伺服器，於「環境變數」填入 `OPENFUN_API_TOKEN` 和你的 Token，儲存後重新啟動。對話找不到工具時，依 [Codex 說明](codex/README.md) 請它代為修復。

MCP 畫面方式不用終端機或在聊天中貼 Token；本機設定未加密，請勿分享。若選擇在對話中設定，請使用短效 Token；Token 會留在對話與工具呼叫紀錄中，重新啟動後需重貼。

也提供 ZIP，可從「新增外掛程式」上傳，或解壓後新增本機市集。部分桌面版有 ZIP 上傳失敗回報，建議優先使用 GitHub 市集。詳細步驟、Unix／Windows 指令及故障排除：[Codex plugin 說明](codex/README.md)。

## Token 注意事項

- Claude Desktop：只在擴充套件設定畫面輸入，由 Claude Desktop 存放在系統憑證儲存區（macOS 鑰匙圈、Windows 認證管理員）；不要貼到 Claude 聊天中。
- Codex：MCP 畫面的環境變數存在 Codex 本機設定，未加密，請勿分享含 Token 的設定檔或截圖。要移除請在 MCP 畫面刪除 `OPENFUN_API_TOKEN` 並重新啟動。
  若選擇在對話中貼 Token，Token 會留在對話紀錄中，建議使用短效 Token，Codex 重新啟動後需重貼。

## 開發狀態

- Claude Desktop：已可打包 MCPB 與選用的聊天指引 ZIP；macOS／Windows 上的安裝畫面尚未完成實機驗收。
- Codex：macOS 15.7.7、Codex 26.930.51102 已由使用者實測，以獨立本機 MCP 完成 Token 檢查與資料查詢。安裝後找不到工具時，可依 [Codex 說明](codex/README.md) 請它代為修復，不用自己輸入指令。外掛附帶 MCP 的工具載入問題及 ZIP 上傳失敗仍待確認；Windows 尚未實機驗收。
- 目前發布的是 [v0.1.0 測試版](https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0)；沒有部署額外的連線服務。

## 三個打包檔的差異

| 檔案 | 給誰用 | 安裝位置 | 用途 |
|---|---|---|---|
| `openfun-claude-extension.mcpb` | Claude Desktop | Settings > Extensions | 真正的查詢功能，含 Token 設定欄位（必要） |
| `openfun-chat-plugin.zip` | Claude Desktop | Customize > Plugins | 只含聊天指引，不能單獨查資料（可選） |
| `openfun-codex-plugin.zip` | Codex | 外掛程式 → 新增外掛程式／新增外掛市集 | 9 個唯讀查詢工具、對話 Token 工具與使用指引；需要 Node.js 18 以上 |

三個檔案不能互換：`.mcpb` 不能上傳到 Customize > Plugins，Claude 的 ZIP 也不能給 Codex 使用。

## 原始碼與打包

`src/` 是共用的 MCP 伺服器與 API 查詢程式；`manifest.json`、`plugin/` 放 Claude 的設定與聊天指引，`codex/` 放 Codex 的設定與聊天指引。兩個平台共用同一份 `server/index.mjs`，不各自複製查詢邏輯。

開發者先執行 `npm ci`，再選擇打包指令：

| 指令 | 輸出到 `dist/` |
|---|---|
| `npm run pack:claude` | `openfun-claude-extension.mcpb`、`openfun-chat-plugin.zip`（選用指引） |
| `npm run pack:codex` | `openfun-codex-plugin.zip` |
| `npm run pack` | 上述全部檔案 |

打包入口分別為 `scripts/pack.mjs`、`scripts/pack-plugin.mjs` 和 `scripts/pack-codex.mjs`。`npm test` 會重新打包並驗證產物；開發環境需求與測試限制見 [開發說明](DEVELOPMENT.md)。`dist/` 與 `build/` 是產生檔，不提交到 Git。

---

授權：MIT（見 [LICENSE](LICENSE)）。開發者請看 [DEVELOPMENT.md](DEVELOPMENT.md)。
