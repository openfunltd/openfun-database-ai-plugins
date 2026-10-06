# 歐噴資料庫：Codex plugin

在 Codex 中用中文查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
內含 9 個唯讀查詢工具（搜尋資料集、讀取 schema 與使用指引、查詢記錄、分組統計）、2 個 Token 設定工具，以及教 Codex 正確使用的 skill。

**下載（v0.1.1 測試版）：**[openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.1/openfun-codex-plugin.zip)（完整發布頁：<https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.1>）。
請直接下載這個 ZIP，不要使用 GitHub 自動產生的「Source code (zip)」。

- 查詢工具都是唯讀，只會連到 `https://data.openfun.tw`。
- **安裝仍需要終端機**；Token 則是在 Codex 對話中貼上，不必再用終端機設定。
- 這是**本機** MCP server：只在你電腦上執行的 Codex 中運作。它**不能**在 ChatGPT 網頁版使用，
  也不是公開 Plugins Directory 上架的 plugin。
- 安裝步驟已用 Codex CLI 0.159.3 驗證；桌面 app 的畫面操作尚未驗證。

## 需要

- Codex CLI（本包以 0.159.3 驗證）
- Node.js 18 以上。先在終端機執行 `node --version` 確認；沒有的話請先到 https://nodejs.org 安裝。
- 歐噴帳號：到 https://data.openfun.tw/user 登入，之後在這裡建立 Token（一般 API Token，不是 Frontend Token）。

## 安裝（在終端機執行）

1. 把 `openfun-codex-plugin.zip` 解壓到一個**會長期保留**的資料夾，例如 `~/openfun-codex-plugin`（名稱可以有空白或中文）。
2. 執行（路徑換成你的資料夾）：
   ```bash
   codex plugin marketplace add ~/openfun-codex-plugin
   codex plugin add openfun-data@openfun
   ```
3. 重新啟動 Codex。

## 從 v0.1.0 更新

Codex 執行的是安裝時複製的快取，只換資料夾內容不會生效，需要重新安裝 plugin：

1. 結束 Codex。
2. 把新的 `openfun-codex-plugin.zip` 解壓到**原本那個長期保留的資料夾**，覆蓋舊檔。
   這個資料夾已註冊為 marketplace 來源，不要換路徑（換路徑就得重新執行 `codex plugin marketplace add`）。
3. 在終端機執行：
   ```bash
   codex plugin remove openfun-data@openfun
   codex plugin add openfun-data@openfun
   ```
4. 重新啟動 Codex。

移除 plugin 不會刪除你用進階選項存的 Token 設定檔，更新時不需要處理它。

## 設定 Token（在 Codex 對話中）

1. 問 Codex：「請檢查歐噴資料庫的設定是否正常」。
2. Codex 會請你：「請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。」
3. 到 https://data.openfun.tw/user 建立 Token，建議設定較短的到期時間，然後貼到對話。
4. Codex 會先向歐噴確認 Token 有效才使用；看到「Token 已通過驗證並設定」就可以開始查詢。

## Token 注意事項

- **Token 會留在聊天紀錄中**（包含工具呼叫紀錄）。這不是系統鑰匙圈那類加密憑證；不要分享這段對話，用完請到歐噴撤銷。
- plugin 只把 Token 放在本機 MCP server 的**記憶體**裡，不會寫入檔案。**Codex 重新啟動後需要重新貼上**。
- 同一個 Codex 執行中的其他對話也可能共用這個 Token，不是只限這一段聊天。
- plugin 無法從 Token 看出到期時間；短效與否由你在歐噴建立 Token 時的設定決定。
- 要停止使用：對 Codex 說「清除歐噴 Token」。這只清掉本機記憶體中的 Token，**不會刪除聊天紀錄，也不會撤銷 Token**；要讓 Token 失效請到歐噴撤銷。

## 進階（選用）：存在本機設定檔

不想每次重新啟動都貼 Token 的人，可以自己在終端機執行設定程式，把 Token 存到本機設定檔（Codex 啟動時載入）：

```bash
node ~/openfun-codex-plugin/setup.mjs            # 設定或取代（輸入不顯示）
node ~/openfun-codex-plugin/setup.mjs --status   # 是否已設定（不顯示 Token）
node ~/openfun-codex-plugin/setup.mjs --remove   # 刪除設定檔
```

Windows（PowerShell）：`node "$HOME\openfun-codex-plugin\setup.mjs"`。變更後請重新啟動 Codex。

| 系統 | 位置 | 權限 |
|---|---|---|
| macOS／Linux | `~/.config/openfun-data/credentials.json` | 目錄 700、檔案 600，只有你自己能讀 |
| Windows | `%APPDATA%\openfun-data\credentials.json` | 沿用使用者設定目錄的存取權限 |

- 這是一般檔案，**沒有加密**。權限被改成其他人可讀（macOS／Linux）時，plugin 會拒絕使用。
- 在對話中貼的 Token 會優先於設定檔，但只到 Codex 重新啟動為止；「清除歐噴 Token」不會刪除設定檔，重新啟動後會再次載入。
- MCP server 收到 `OPENFUN_API_TOKEN` 環境變數時也會使用，但 Codex 預設不會把它傳給 plugin。

## 解除安裝

```bash
codex plugin remove openfun-data@openfun
codex plugin marketplace remove openfun
node ~/openfun-codex-plugin/setup.mjs --remove   # 只有用過進階設定檔才需要
```

## 故障排除

| 狀況 | 處理 |
|---|---|
| Codex 說找不到歐噴資料庫的工具 | 確認 `node --version` 為 18 以上；執行 `codex plugin list` 確認 `openfun-data@openfun` 已安裝且啟用；重新啟動 Codex。 |
| 尚未設定 Token | 照 Codex 的提示，把新建立的短效 Token 貼到對話。重新啟動 Codex 後需要重貼。 |
| Token 無效、已過期或類型不適用 | 到 https://data.openfun.tw/user 建立新的一般 API Token 再貼一次；原本的 Token 狀態不會因為失敗而改變。 |
| 設定檔權限過寬或不是一般檔案（進階） | 重新執行設定程式，它會以正確權限重寫。 |
| 權限不足、額度用完、伺服器錯誤 | 這些不代表查無資料；照 Codex 回覆中的建議處理。 |

授權：MIT（見 `LICENSE`）；內嵌第三方套件授權見 `THIRD_PARTY_LICENSES.md`。
