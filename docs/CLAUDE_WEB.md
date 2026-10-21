# Claude 網頁版

不用下載或上傳檔案。外掛提供使用指引；連接器才負責實際查詢。

## 1. 從 GitHub 市集安裝指引

1. 開啟 **Customize（自訂）> Plugins（外掛程式）> Add（新增）> Add marketplace（新增市集）**。
2. 輸入 `https://github.com/openfunltd/openfun-database-ai-plugins.git`，按 **Sync（同步）**。
3. 在市集中找到「**歐噴資料庫聊天指引**」，安裝並啟用。可保留自動同步。

若看到找不到 `.claude-plugin/marketplace.json`，確認使用的是上面的儲存庫預設分支，重新同步；不要填 Codex 專用的 `codex-marketplace` 分支或 Release ZIP 網址。

## 2. 設定查詢連線（必要）

1. 到 **Customize > Connectors（連接器）> Add（新增）> Add custom connector（新增自訂連接器）**。
2. 名稱填「歐噴資料庫」，伺服器網址填 `https://data.openfun.tw/mcp`。
3. 若畫面提供驗證設定，選 **No sign-in（不登入）**，在 **Request headers（請求標頭）** 新增：

   | 欄位 | 填入 |
   |---|---|
   | Header name | `Authorization` |
   | Value | `Bearer ` 後面接你的歐噴 API Token，中間保留一個空格 |
   | Required | 啟用 |

   Token 到 <https://data.openfun.tw/user> 建立。這裡需要 `Bearer ` 前綴，與桌面擴充套件只貼 Token 的欄位不同。
4. 儲存連接器。開新聊天，在輸入框 **「+」> Connectors** 啟用「歐噴資料庫」，問：「**請檢查歐噴資料庫的設定是否正常**」。

**如果沒有 Request headers：** 官方目前只向部分組織開放此功能。現有歐噴遠端入口尚未提供 OAuth 登入，該畫面暫時無法安全設定查詢用 Token；只有搜尋與讀說明不代表已可查資料。不要把 Token 貼進聊天或加在網址裡。要讓這類帳號也能直接使用，仍需網站端加入 OAuth 登入。

Team／Enterprise 的自訂連接器通常需由組織管理員新增。以請求標頭設定的固定 Token 可能由組織成員共用，會共用該帳號的資料權限與額度；不想共用時需使用個別帳號的登入流程。

## 可以做到什麼

- 搜尋資料集、閱讀欄位與使用說明。
- 連線驗證成功後，依條件查詢記錄、排序與分頁，並附上來源。
- 遠端入口目前只有 `openfun_guide`、`openfun_search`、`openfun_skill`、`openfun_query`，沒有桌面版的分組統計與完整 Excel 批次匯出工具。不能把桌面版的 10,000 筆匯出能力當作網頁版已有的功能。

Token 存在 Claude 的連接器憑證設定，由 Anthropic 雲端傳送至歐噴網站；與桌面版存在本機系統憑證儲存區的方式不同。

目前已用 MCP 客戶端確認遠端入口能初始化並列出上述四個工具；尚未完成 Claude 網頁介面的安裝及帶 Token 查詢驗收。

官方依據：[市集安裝](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)、[自訂連接器與請求標頭](https://claude.com/docs/connectors/custom/add-unlisted)。
