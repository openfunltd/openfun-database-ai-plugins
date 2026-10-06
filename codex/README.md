# 歐噴資料庫：Codex plugin

在 Codex 中用中文查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
內含 9 個唯讀查詢工具（搜尋資料集、讀取 schema 與使用指引、查詢記錄、分組統計）、2 個 Token 設定工具，以及教 Codex 正確使用的 skill。

**下載（v0.1.0 測試版）：**[openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-codex-plugin.zip)（完整發布頁：<https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0>）。
請直接下載這個 ZIP，不要使用 GitHub 自動產生的「Source code (zip)」。

- 查詢工具都是唯讀，只會連到 `https://data.openfun.tw`。
- **安裝需要終端機**；Token 也在同一次安裝時用終端機設定一次，存在本機，之後重新啟動 Codex 不用重貼。
- 這是**本機** MCP server：只在你電腦上執行的 Codex 中運作。它**不能**在 ChatGPT 網頁版使用，
  也不是公開 Plugins Directory 上架的 plugin。
- 安裝步驟已用 Codex CLI 0.159.3 驗證；桌面 app 的畫面操作尚未驗證。

## 需要

- Codex CLI（本包以 0.159.3 驗證）
- Node.js 18 以上。先在終端機執行 `node --version` 確認；沒有的話請先到 https://nodejs.org 安裝。
- 歐噴帳號：到 https://data.openfun.tw/user 登入，之後在這裡建立 Token（一般 API Token，不是 Frontend Token）。

## 安裝（在終端機執行）

1. 到 https://data.openfun.tw/user 建立一般 API Token。
2. 把 `openfun-codex-plugin.zip` 解壓到一個**會長期保留**的資料夾，例如 `~/openfun-codex-plugin`（名稱可以有空白或中文）。
3. 執行（路徑換成你的資料夾）：
   ```bash
   codex plugin marketplace add ~/openfun-codex-plugin
   codex plugin add openfun-data@openfun
   node ~/openfun-codex-plugin/setup.mjs
   ```
   最後一行會請你貼上 Token 後按 Enter；畫面不會顯示輸入內容。它只檢查格式、不連網，Token 是否有效要在下一步確認。
4. 重新啟動 Codex，問：「請檢查歐噴資料庫的設定是否正常」。看到「Token 有效，已可查詢」就可以開始用。

Windows（PowerShell）的第三行改為 `node "$HOME\openfun-codex-plugin\setup.mjs"`。

Token 存一次即可，Codex 重新啟動時會自動讀取；直到 Token 過期、被撤銷或你移除設定檔才需要更新。

## 更新、查看或移除 Token

```bash
node ~/openfun-codex-plugin/setup.mjs            # 更新（會先問是否取代）
node ~/openfun-codex-plugin/setup.mjs --status   # 是否已設定（不顯示 Token）
node ~/openfun-codex-plugin/setup.mjs --remove   # 刪除本機設定檔
```

變更後請重新啟動 Codex。設定程式不接受從命令列參數或管線傳入 Token，請直接執行後依提示貼上。

## Token 存放與安全

| 系統 | 位置 | 權限 |
|---|---|---|
| macOS／Linux | `~/.config/openfun-data/credentials.json` | 目錄 700、檔案 600，只有你自己能讀 |
| Windows | `%APPDATA%\openfun-data\credentials.json` | 沿用使用者設定目錄的存取權限 |

- 這是一般檔案，**沒有加密**，只靠檔案權限保護，留在你自己的使用者設定目錄。權限被改成其他人可讀（macOS／Linux）時，plugin 會拒絕使用。
- 檔案不在 plugin 資料夾內，所以重裝 plugin 不會遺失；不再使用時請執行 `setup.mjs --remove`，並到歐噴撤銷 Token。
- plugin 無法從 Token 看出到期時間；到期與否由你在歐噴建立 Token 時的設定決定。
- MCP server 收到 `OPENFUN_API_TOKEN` 環境變數時會優先使用，但 Codex 預設不會把它傳給 plugin。

## 選用：在對話中使用短效 Token

不想把 Token 存在電腦上時，可以跳過 `setup.mjs`，在 Codex 對話中說「我要在對話中設定歐噴 Token」。Codex 會請你：
「請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。」
貼上後 Codex 會先向歐噴確認 Token 有效才使用。

- **Token 會留在對話與工具呼叫紀錄中**；建議設定較短的到期時間，不要分享這段對話，用完請到歐噴撤銷。
- 只存在本機 MCP server 的記憶體，不寫入檔案；**Codex 重新啟動後需要重新貼上**。同一個 Codex 執行中的其他對話也可能共用。
- 在對話中貼的 Token 會優先於本機設定檔，但只到 Codex 重新啟動為止。

## 兩種清除方式

- `node ~/openfun-codex-plugin/setup.mjs --remove`：刪除本機設定檔。
- 對 Codex 說「清除歐噴 Token」：只清掉這次執行中記憶體裡的 Token，**不會刪除設定檔或聊天紀錄，也不會撤銷 Token**；重新啟動 Codex 後若設定檔還在，會再次讀取。

要讓 Token 真正失效，請到 https://data.openfun.tw/user 撤銷。

## 解除安裝

```bash
codex plugin remove openfun-data@openfun
codex plugin marketplace remove openfun
node ~/openfun-codex-plugin/setup.mjs --remove
```

## 故障排除

| 狀況 | 處理 |
|---|---|
| Codex 說找不到歐噴資料庫的工具 | 確認 `node --version` 為 18 以上；執行 `codex plugin list` 確認 `openfun-data@openfun` 已安裝且啟用；重新啟動 Codex。 |
| 尚未設定 Token | 在終端機執行 `node ~/openfun-codex-plugin/setup.mjs` 後重新啟動 Codex（或選擇在對話中貼短效 Token）。 |
| Token 無效、已過期或類型不適用 | 到 https://data.openfun.tw/user 建立新的一般 API Token，重新執行 `setup.mjs` 更新後重新啟動 Codex。 |
| 設定檔權限過寬或不是一般檔案 | 重新執行 `setup.mjs`，它會以正確權限重寫。 |
| 權限不足、額度用完、伺服器錯誤 | 這些不代表查無資料；照 Codex 回覆中的建議處理。 |

授權：MIT（見 `LICENSE`）；內嵌第三方套件授權見 `THIRD_PARTY_LICENSES.md`。
