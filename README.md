# 歐噴資料庫：Codex plugin

在 Codex 中用中文查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
內含 9 個唯讀查詢工具（搜尋資料集、讀取 schema 與使用指引、查詢記錄、分組統計）、2 個 Token 設定工具，以及教 Codex 正確使用的 skill。

**v0.1.0 測試版：**請依下方 GitHub 市集步驟安裝（[完整發布頁](https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0)）。

- 查詢工具都是唯讀，只會連到 `https://data.openfun.tw`。
- **桌面版可從畫面安裝**。Token 可直接在設定畫面輸入並保留；也提供對話短效 Token 方式。
- 連線程式在你的電腦上執行，只能在**本機** Codex 使用。它**不能**在 ChatGPT 網頁版使用，
  也不是公開 Plugins Directory 上架的 plugin。
- macOS 15.7.7、Codex 26.930.51102 已由使用者實測：完成本機連線設定後，Token 檢查及資料查詢成功。外掛附帶的連線仍有工具未送進對話的問題，根因尚未確認。Windows 尚未實機驗收。

## 需要

- Codex 桌面版（本機模式）；也支援 Codex CLI。
- Node.js 18 以上。沒有的話請先到 https://nodejs.org 安裝，安裝後重新啟動 Codex。
- 歐噴帳號：到 https://data.openfun.tw/user 登入，之後在這裡建立 Token（一般 API Token，不是 Frontend Token）。

## 桌面版安裝與連線設定

安裝外掛後，還需要完成連線設定，才能開始查詢。請依序完成以下步驟：

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
7. 開新對話，送出：「幫我查『開放文化基金會』出現在哪些資料集？」

Token 會存入 Codex 本機設定，未加密；請勿分享含有 Token 的設定檔或截圖。

儲存庫的 `main` 分支放的是共用原始碼；新增市集時，「Git 參照」請填入 `codex-marketplace`。

### 更新連線程式

供更新使用的程式封存檔：[openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-codex-plugin.zip)。

對本機 Codex 說：

> 請從 openfunltd/openfun-database-ai-plugins 的 GitHub v0.1.0 Release 下載最新 Codex ZIP，核對 SHA256SUMS，更新 openfun-local 的程式副本。保留 MCP 環境變數設定，不讀取或搬移任何憑證。

完成後開新對話查詢資料。這份連線程式副本需另外更新；Token 請在「外掛程式」→「MCP」標籤頁設定。

## 更新 Token

1. 到「外掛程式」→「MCP」標籤頁，編輯 `openfun-local`。
2. 在「環境變數」新增：

   | 欄位 | 填入 |
   |---|---|
   | 金鑰 | `OPENFUN_API_TOKEN` |
   | 值 | 你在歐噴建立的一般 API Token |

3. 「環境變數透傳」留空，按「儲存」。
4. 開新對話，送出：「幫我查『開放文化基金會』出現在哪些資料集？」

**不需要終端機，也不用把 Token 貼到聊天。** Token 會存入 Codex 本機設定，未加密，請勿分享含有 Token 的設定檔或截圖。
更新或移除時，回到同一個畫面修改／刪除 `OPENFUN_API_TOKEN` 項目並儲存。
不會讀取獨立的 `credentials.json` Token 檔；移除畫面設定後，不會從該檔案載入 Token。

若歐噴只出現在不可編輯的「來自外掛程式」區塊，先依上方第 4 步請 AI 設定連線，或選擇對話短效 Token。

## 選用：終端機安裝

從 GitHub 加入市集並安裝外掛，再依上方第 4～7 步完成連線與 Token 設定。

### Unix（macOS／Linux）

```bash
codex plugin marketplace add https://github.com/openfunltd/openfun-database-ai-plugins.git --ref codex-marketplace
codex plugin add openfun-data@openfun
```

### Windows（PowerShell）

```powershell
codex plugin marketplace add https://github.com/openfunltd/openfun-database-ai-plugins.git --ref codex-marketplace
codex plugin add openfun-data@openfun
```

## Token 存放與安全

MCP 畫面的 Token 存在 Codex 本機設定（通常是家目錄的 `.codex/config.toml`），**沒有加密**；不要分享含有 Token 的設定檔或截圖。
重新啟動時會讀取 MCP 的 `OPENFUN_API_TOKEN` 環境變數，不會讀取其他 Token 檔。
外掛附帶的 MCP 預設不會收到這個變數；持久設定請使用可編輯的獨立本機 MCP。
Token 的有效期限由你在歐噴建立時的設定決定。

## 選用：在對話中使用短效 Token

不想把 Token 存進本機設定時，可以在 Codex 對話中說「我要在對話中設定歐噴 Token」。Codex 會請你：
「請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。」
貼上後 Codex 會先向歐噴確認 Token 有效才使用。

- **Token 會留在對話與工具呼叫紀錄中**；建議設定較短的到期時間，不要分享這段對話，用完請到歐噴撤銷。
- 只存在本機 MCP server 的記憶體，不寫入檔案；**Codex 重新啟動後需要重新貼上**。同一個 Codex 執行中的其他對話也可能共用。
- 在對話中貼的 Token 會取代這次執行載入的 MCP 環境變數 Token，但只到 Codex 重新啟動為止。

## 兩種清除方式

- 在「外掛程式」→「MCP」標籤頁刪除 `OPENFUN_API_TOKEN` 項目並儲存：移除持久設定。
- 對 Codex 說「清除歐噴 Token」：只清掉這次執行中記憶體裡的 Token，**不會刪除環境變數或聊天紀錄，也不會撤銷 Token**；重新啟動 Codex 後若 MCP 環境變數還在，會再次載入。

要讓 Token 真正失效，請到 https://data.openfun.tw/user 撤銷。

## 解除安裝

桌面版可在「外掛程式」移除歐噴資料庫；MCP 畫面中的 Token 設定需另外移除，並到歐噴撤銷 Token。

完成上方連線設定後，解除安裝時也要到「外掛程式」→「MCP」標籤頁移除 `openfun-local`。
移除獨立 MCP 後可刪除副本資料夾；只移除外掛不會移除這個獨立 MCP。

CLI 使用者可執行：

```bash
codex plugin remove openfun-data@openfun
codex plugin marketplace remove openfun
codex mcp remove openfun-local
```

## 故障排除

| 狀況 | 處理 |
|---|---|
| Codex 說找不到歐噴資料庫的工具 | 請 Codex 檢查目前對話的實際工具目錄，包含 `functions.exec` 的工具或可用的工具搜尋；工具名稱可能加上 MCP 前綴。只有明確的 Node.js 啟動錯誤才需要排查 Node.js。 |
| 已安裝、有 MCP，但對話找不到工具 | 日誌 `ready` 不能證明對話拿得到工具。完成工具探索仍找不到時，請 AI 依外掛指引設定 `openfun-local` 連線；macOS 已實測成功，不用反覆重裝或先重設 Token。 |
| 回覆「未安裝」或 `public global listed plugin` | 這是公開外掛目錄的查詢結果，不能用來判定本機／Git 市集外掛。請 Codex 直接尋找本機歐噴 MCP 工具。 |
| 尚未設定 Token | 到「外掛程式」→「MCP」標籤頁，在 `openfun-local` 的環境變數填 `OPENFUN_API_TOKEN` 並儲存。也可選擇對話短效 Token。 |
| Token 無效、已過期或類型不適用 | 到 https://data.openfun.tw/user 建立新的一般 API Token，在「外掛程式」→「MCP」標籤頁更新後儲存；對話方式則重新設定短效 Token。 |
| 權限不足、額度用完、伺服器錯誤 | 這些不代表查無資料；照 Codex 回覆中的建議處理。 |

若 Codex 回覆找不到工具，可在同一個對話貼上：

> 請檢查目前對話的實際工具目錄。如果有 functions.exec 和 ALL_TOOLS，找出名稱包含 openfun_check_config 的條目，再用 tools[實際名稱]({}) 呼叫。若只有工具搜尋功能，就搜尋後呼叫。不要用 plugin_management 查公開外掛目錄。若仍沒有工具，請依歐噴外掛指引直接替我設定 openfun-local 連線，不要只回報工具不存在，也不要要求重裝或提供 Token。

若檢查後仍沒有工具，依上方第 4 步請 AI 設定連線，完成後開新對話驗證；不能只憑 `ready` 或設定檔就宣稱查詢已正常。

授權：MIT（見 `LICENSE`）；內嵌第三方套件授權見 `THIRD_PARTY_LICENSES.md`。

開發與封裝細節見 [DEVELOPMENT.md](../DEVELOPMENT.md)。
