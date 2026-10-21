# openfun-database-ai-plugins

讓 **Claude Desktop** 和 **Codex** 查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
裝好之後，直接在聊天中用中文問問題，例如：

> 幫我查「開放文化基金會」出現在哪些資料集？
> 臺北市資本額超過一億元的公司有幾家？列出前 10 家，附上資料來源。

AI 會搜尋資料集、閱讀欄位說明、查詢資料，並在回答中附上**資料集名稱、網址、授權與資料限制**。所有查詢功能都是**唯讀**，不會修改歐噴資料。桌面連線程式另有分組統計與完整 Excel 匯出，匯出檔案會寫入本機下載資料夾。

兩個平台都能從桌面版畫面安裝。Codex 需要 Node.js 18 以上；Token 可直接在連線設定畫面輸入，也提供對話短效 Token 方式。

## 下載檔案（v0.1.0 測試版）

| 平台 | 下載 | 下載後怎麼用 |
|---|---|---|
| Claude Desktop（必要） | [openfun-claude-extension.mcpb](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-claude-extension.mcpb) | 雙擊安裝，在擴充套件設定填入 Token |
| Codex（供更新連線程式使用） | [openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-codex-plugin.zip) | 交給 Codex 更新本機連線程式；首次安裝依下方市集步驟操作 |

完整發布頁：<https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0>
Claude 請下載上面的安裝檔，不要使用 GitHub 自動產生的「Source code (zip)」。Codex 請依下方市集步驟安裝。

## 選擇你的平台

| | Claude Desktop | Codex |
|---|---|---|
| 安裝來源 | `openfun-claude-extension.mcpb` | GitHub 市集的 `codex-marketplace` 分支 |
| 安裝方式 | 雙擊或在設定畫面安裝 | 新增 GitHub 市集 |
| 需要 Node.js | 不需要 | 需要 18 以上 |
| Token 設定 | 擴充套件設定畫面的欄位 | 「外掛程式」→「MCP」標籤頁的環境變數欄位；也可用對話 |
| Token 存放 | 系統憑證儲存區（加密） | 畫面設定存在本機設定檔（未加密）；對話 Token 只存在記憶體 |
| 完整說明 | [Claude Desktop 說明](docs/CLAUDE_DESKTOP.md) | [Codex plugin 說明](codex/README.md) |

兩個平台都要到 <https://data.openfun.tw/user> 登入，建立**一般 API Token**（不是 Frontend Token）。
Claude 安裝檔請從上方「[下載檔案](#下載檔案v010-測試版)」取得；Codex 請依下方市集步驟安裝。開發者也可依下方「原始碼與打包」自行產生。

## Claude Desktop 安裝

適用 macOS 與 Windows。套件內含查詢工具與使用指引，Claude Desktop 會提供執行環境。

1. 雙擊 `openfun-claude-extension.mcpb`，或從 **Settings > Extensions > Advanced settings > Install Extension…** 選擇安裝檔。
2. 按 **Install**，在「歐噴 API Token」欄位貼上 Token，儲存並確認已啟用。
3. 開新聊天，問：「請檢查歐噴資料庫的設定是否正常」。

逐步教學、聊天示範、故障排除與隱私說明：[Claude Desktop 說明](docs/CLAUDE_DESKTOP.md)。

## Codex 安裝

適用本機 Codex 桌面版，需要 **Node.js 18 以上**。安裝外掛後，還需要完成連線設定，才能開始查詢。

1. 開啟「外掛程式」→「新增」→「新增市集」。
2. 填入以下內容，按「新增市集」：

   | 欄位 | 填入 |
   |---|---|
   | 來源 | `https://github.com/openfunltd/openfun-database-ai-plugins.git` |
   | Git 參照 | `codex-marketplace` |
   | 稀疏路徑 | 留空 |

3. 在外掛搜尋框搜尋「歐噴資料庫」，找到後點進去，按「安裝外掛程式」。
4. **設定連線（必要）**：開啟本機對話，在訊息輸入框輸入 `@`，接著輸入「歐噴資料庫」，從跳出的清單點選它。確認出現外掛標籤後，送出：

   > 請依歐噴外掛的指引，幫我完成連線設定，建立 openfun-local，保留其他設定。Token 由我自己在畫面輸入。

5. AI 設定完成後，進入「外掛程式」→「MCP」標籤頁，編輯 `openfun-local`。
6. 在「環境變數」填入金鑰 `OPENFUN_API_TOKEN`，值貼上你的 Token。「環境變數透傳」留空，按「儲存」。
7. 開新對話，送出：「請檢查歐噴資料庫的設定是否正常」。

Token 會存入 Codex 本機設定，未加密；請勿分享含有 Token 的設定檔或截圖。

若選擇在對話中設定 Token，請使用短效 Token；Token 會留在對話與工具呼叫紀錄中，重新啟動後需重貼。

詳細步驟、Unix／Windows 指令及故障排除：[Codex plugin 說明](codex/README.md)。

## 桌面版完整匯出 Excel

在對話中說：

> 請把剛才符合條件的全部資料匯出成 Excel，附上來源與查詢條件。

外掛會自行分頁取完資料、核對筆數，再存到執行外掛那台電腦之家目錄 **Downloads/OpenFun（下載／OpenFun）**。AI 會查詢進度，完成後告訴你檔案位置；不必讓資料逐筆經聊天轉寫。若聊天中的檔案連結無法點開，直接從本機「下載／OpenFun」開啟。這不是雲端對話附件，也不要求另外設定 Token。

Excel 包含「查詢結果」「統計摘要」「來源與處理說明」三個工作表。查詢結果已開啟篩選、凍結標題列，並保留統編前導零；摘要列出完整筆數、數值欄位的合計與平均，AI 也能直接回報這些數字。最多統計 20 個數值欄位，空值不計入平均，平均四捨五入至最多六位小數。摘要是匯出當下的計算值，不隨之後修改 Excel 重算。

第一版每次最多 **10,000 筆、200 欄、32 MiB 資料**，仍受 API 權限、額度與取數上限限制。超限、缺頁、重複或查詢期間資料變動會停止，**不把部分資料當成完整檔案**。暫時性連線／伺服器錯誤會自動重試；其他失敗可在處理原因後重新匯出。可請 AI 取消進行中的匯出；重啟程式或更換 Token 後，未完成工作需重做。已完成檔案會留在本機，移除外掛不會刪除。

目前已驗證打包程式、MCP 檔案資源與 Codex app-server 的交付；macOS／Windows 圖形介面的點擊與下載仍待實機驗收。本機資料夾是檔案交付的保底方式。

## Token 注意事項

- Claude Desktop：只在擴充套件設定畫面輸入，由 Claude Desktop 存放在系統憑證儲存區（macOS 鑰匙圈、Windows 認證管理員）；不要貼到 Claude 聊天中。
- Codex：MCP 畫面的環境變數存在 Codex 本機設定，未加密，請勿分享含 Token 的設定檔或截圖。要移除請在「外掛程式」→「MCP」標籤頁刪除 `OPENFUN_API_TOKEN` 並儲存。
  若選擇在對話中貼 Token，Token 會留在對話紀錄中，建議使用短效 Token，Codex 重新啟動後需重貼。

## Claude 網頁版

網頁版使用遠端連接器，網址為 `https://data.openfun.tw/mcp`。目前需帳號能設定 **Request headers** 才能填入查詢用 Token，組織帳號還需管理員允許新增連接器。網站目前未提供 OAuth 登入。

遠端入口支援搜尋、讀取指引與查詢記錄，沒有桌面版的分組統計與完整 Excel 批次匯出。設定方式見 [Claude 網頁版說明](docs/CLAUDE_WEB.md)。

## 原始碼與打包

`src/` 是共用的 MCP 伺服器與 API 查詢程式，並內建 Claude 的使用指引；`manifest.json` 放 Claude 的擴充套件設定，`codex/` 放 Codex 的設定與使用指引。兩個平台共用同一份 `server/index.mjs`。

開發者先執行 `npm ci`，再選擇打包指令：

| 指令 | 輸出到 `dist/` |
|---|---|
| `npm run pack:claude` | `openfun-claude-extension.mcpb` |
| `npm run pack:codex` | `openfun-codex-plugin.zip` |
| `npm run pack` | 上述兩份安裝包 |

打包入口為 `scripts/pack.mjs` 與 `scripts/pack-codex.mjs`。`npm test` 會重新打包並驗證產物；開發環境需求與測試限制見 [開發說明](DEVELOPMENT.md)。`dist/` 與 `build/` 是產生檔，不提交到 Git。

授權：MIT（見 [LICENSE](LICENSE)）。
