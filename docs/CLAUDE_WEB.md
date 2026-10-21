# Claude 網頁版

透過遠端連接器讀取歐噴的使用指引與資料。需要組織允許新增連接器，並提供 Request headers 欄位以設定 Token；網站目前未提供 OAuth 登入。

## 設定查詢連線

1. 到 **Customize > Connectors（連接器）> Add（新增）> Add custom connector（新增自訂連接器）**。
2. 名稱填「歐噴資料庫」，伺服器網址填 `https://data.openfun.tw/mcp`。
3. 若畫面提供驗證設定，選 **No sign-in（不登入）**，在 **Request headers（請求標頭）** 新增：

   | 欄位 | 填入 |
   |---|---|
   | Header name | `Authorization` |
   | Value | `Bearer ` 後面接你的歐噴 API Token，中間保留一個空格 |
   | Required | 啟用 |

   Token 到 <https://data.openfun.tw/user> 建立。這裡需要 `Bearer ` 前綴，與桌面擴充套件只貼 Token 的欄位不同。
4. 儲存連接器。開新聊天，問：「**請檢查歐噴資料庫的設定是否正常**」。若 Claude 沒有使用歐噴工具，到輸入框 **「+」> Connectors** 確認「歐噴資料庫」已啟用。

**如果沒有 Request headers：** 官方目前只向部分組織開放此功能。現有歐噴遠端入口尚未提供 OAuth 登入，該畫面暫時無法安全設定查詢用 Token；只有搜尋與讀說明不代表已可查資料。不要把 Token 貼進聊天或加在網址裡。要讓這類帳號也能直接使用，仍需網站端加入 OAuth 登入。

Team／Enterprise 的自訂連接器通常需由組織管理員新增。以請求標頭設定的固定 Token 可能由組織成員共用，會共用該帳號的資料權限與額度；不想共用時需使用個別帳號的登入流程。

## 可以做到什麼

- 搜尋資料集、閱讀欄位與使用說明。
- 連線驗證成功後，依條件查詢記錄、排序與分頁，並附上來源。
- 遠端入口目前只有 `openfun_guide`、`openfun_search`、`openfun_skill`、`openfun_query`，沒有桌面版的分組統計與完整 Excel 批次匯出工具。不能把桌面版的 10,000 筆匯出能力當作網頁版已有的功能。

Token 存在 Claude 的連接器憑證設定，由 Anthropic 雲端傳送至歐噴網站；與桌面版存在本機系統憑證儲存區的方式不同。

遠端連接器會提供使用說明，Claude 可透過 `openfun_guide` 讀取最新的首頁指引。是否自動載入由 Claude 的工具存取設定決定。

目前已用 MCP 客戶端確認遠端入口能初始化並列出上述四個工具；尚未完成 Claude 網頁介面的設定及帶 Token 查詢驗收。

官方依據：[自訂連接器與請求標頭](https://claude.com/docs/connectors/custom/add-unlisted)、[工具載入方式](https://support.claude.com/en/articles/13730515-manage-claude-s-tool-access)。
