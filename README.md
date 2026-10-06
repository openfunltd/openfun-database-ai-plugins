# openfun-database-ai-plugins

讓 **Claude Desktop** 和 **Codex** 都能查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
裝好之後，直接在聊天中用中文問問題，例如：

> 幫我查「開放文化基金會」出現在哪些資料集？
> 臺北市資本額超過一億元的公司有幾家？列出前 10 家，附上資料來源。

AI 會自動搜尋資料集、閱讀欄位說明、查詢資料或做統計，並在回答中附上**資料集名稱、網址、授權與資料限制**。所有查詢功能都是**唯讀**，不會修改任何資料。

兩個平台的安裝方式不同：Claude Desktop 用滑鼠安裝即可；**Codex 安裝目前仍需要終端機和 Node.js 18 以上**，Token 則在 Codex 對話中貼上。

## 下載安裝檔（v0.1.1 測試版）

| 平台 | 下載 |
|---|---|
| Claude Desktop（必要） | [openfun-claude-extension.mcpb](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.1/openfun-claude-extension.mcpb) |
| Claude Desktop（可選聊天指引） | [openfun-chat-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.1/openfun-chat-plugin.zip) |
| Codex | [openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.1/openfun-codex-plugin.zip) |

完整發布頁：<https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.1>
請直接下載上面的打包檔，不要使用 GitHub 自動產生的「Source code (zip)」當作安裝包。

## 選擇你的平台

| | Claude Desktop | Codex |
|---|---|---|
| 安裝檔 | `openfun-claude-extension.mcpb`（必要）＋ `openfun-chat-plugin.zip`（可選指引） | `openfun-codex-plugin.zip`（本機 plugin） |
| 安裝方式 | 雙擊或在設定畫面安裝 | 終端機指令 |
| 需要 Node.js | 不需要 | 需要 18 以上 |
| Token 設定 | 擴充套件設定畫面的欄位 | 在 Codex 對話中貼上（建議短效 Token） |
| Token 存放 | 系統憑證儲存區（加密） | 本機 server 記憶體，重新啟動後需重貼；聊天紀錄仍留有 Token 值，不是系統加密憑證 |
| 完整說明 | [Claude Desktop 說明](docs/CLAUDE_DESKTOP.md) | [Codex plugin 說明](codex/README.md) |

兩個平台都要到 <https://data.openfun.tw/user> 登入，建立**一般 API Token**（不是 Frontend Token）。
安裝檔請從上方「[下載安裝檔](#下載安裝檔v011-測試版)」取得；開發者也可依下方「原始碼與打包」自行產生。

## Claude Desktop 安裝

適用 macOS 與 Windows，不需要終端機或 Node.js。

1. 雙擊 `openfun-claude-extension.mcpb`（或拖曳到 Claude Desktop 視窗，或從 **Settings > Extensions > Advanced settings > Install Extension…** 選擇）。
2. 按 **Install**，在「歐噴 API Token」欄位貼上 Token，儲存並確認已啟用。
3. （可選）到 **Customize > Plugins** 上傳 `openfun-chat-plugin.zip`，讓 Claude 更會附來源、說明限制。這份 ZIP 單獨安裝**不能查資料**。
4. 開新聊天，問：「請檢查歐噴資料庫的設定是否正常」。

逐步教學、聊天示範、故障排除與隱私說明：[docs/CLAUDE_DESKTOP.md](docs/CLAUDE_DESKTOP.md)。

## Codex 安裝

適用在你電腦上執行的 Codex（已用 Codex CLI 0.159.3 驗證），不能在 ChatGPT 網頁版使用。安裝目前仍需要**終端機**與 **Node.js 18 以上**（用 `node --version` 確認）。

1. 把 `openfun-codex-plugin.zip` 解壓到會長期保留的資料夾，例如 `~/openfun-codex-plugin`。
2. 在終端機執行（路徑換成你的資料夾）：
   ```bash
   codex plugin marketplace add ~/openfun-codex-plugin
   codex plugin add openfun-data@openfun
   ```
3. 重新啟動 Codex，問：「請檢查歐噴資料庫的設定是否正常」。
4. Codex 會請你到歐噴建立**短效 Token** 並貼到對話；驗證成功後就能查詢。

Token 只存在本機 server 記憶體，Codex 重新啟動後需要重貼。想存成本機設定檔（進階選用）、Windows、解除安裝與故障排除：[codex/README.md](codex/README.md)（ZIP 內也附同一份）。

## Token 注意事項

- Claude Desktop：只在擴充套件設定畫面輸入，由 Claude Desktop 存放在系統憑證儲存區（macOS 鑰匙圈、Windows 認證管理員）；不要貼到 Claude 聊天中。
- Codex：在對話中貼上，建議使用短效 Token。Token 會留在對話與工具呼叫紀錄中，不要分享該對話，用完請到歐噴撤銷。
  plugin 只把 Token 放在本機 server 記憶體（不寫檔），重新啟動後需重貼；請 Codex「清除歐噴 Token」只會清掉記憶體中的值，不會刪除聊天紀錄，也不會撤銷 Token。

## 開發狀態

- Claude Desktop：已可打包 MCPB 與選用的聊天指引 ZIP；macOS／Windows 上的安裝畫面尚未完成實機驗收。
- Codex：本機 plugin 已完成，安裝流程已用 Codex CLI 0.159.3 驗證；Token 改在對話中設定，安裝仍需終端機，桌面 app 的操作尚未驗證。
- 目前發布的是 [v0.1.1 測試版](https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.1)；沒有部署額外的連線服務。

## 三個打包檔的差異

| 檔案 | 給誰用 | 安裝位置 | 用途 |
|---|---|---|---|
| `openfun-claude-extension.mcpb` | Claude Desktop | Settings > Extensions | 真正的查詢功能，含 Token 設定欄位（必要） |
| `openfun-chat-plugin.zip` | Claude Desktop | Customize > Plugins | 只含聊天指引，不能單獨查資料（可選） |
| `openfun-codex-plugin.zip` | Codex | 終端機 `codex plugin marketplace add`／`codex plugin add` | 9 個唯讀查詢工具、對話 Token 設定工具與使用指引；需要 Node.js 18 以上 |

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
