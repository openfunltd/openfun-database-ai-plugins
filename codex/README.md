# 歐噴資料庫：Codex plugin

在 Codex 中用中文查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
內含 9 個唯讀 MCP 工具（搜尋資料集、讀取 schema 與使用指引、查詢記錄、分組統計），以及教 Codex 正確使用的 skill。

- 所有工具都是唯讀，只會連到 `https://data.openfun.tw`。
- 這是**本機** MCP server：只在你電腦上執行的 Codex 中運作。它**不能**在 ChatGPT 網頁版使用，
  也不是公開 Plugins Directory 上架的 plugin。
- 下面的安裝步驟已用 Codex CLI 0.159.3 驗證。官方文件說明 ChatGPT 桌面 app 的 Codex 也會讀取本機 marketplace，
  但桌面 app 的畫面操作尚未驗證，因此這裡不列出 app 的操作步驟。

## 需要

- Codex CLI（本包以 0.159.3 驗證）
- Node.js 18 以上。先在終端機執行 `node --version` 確認；沒有的話請先到 https://nodejs.org 安裝。
- 歐噴 API Token：到 https://data.openfun.tw/user 登入後建立一般 API Token（不是 Frontend Token）。

## 安裝（在終端機執行）

1. 把 `openfun-codex-plugin.zip` 解壓到一個**會長期保留**的資料夾，例如 `~/openfun-codex-plugin`。
   資料夾名稱可以有空白或中文。Codex 之後會從這裡讀取 plugin 目錄。
2. 加入 marketplace（路徑換成你的資料夾）：
   ```bash
   codex plugin marketplace add ~/openfun-codex-plugin
   ```
3. 安裝 plugin：
   ```bash
   codex plugin add openfun-data@openfun
   ```
   Codex 會把 plugin 複製到自己的快取（`~/.codex/plugins/cache/openfun/openfun-data/<版本>/`），執行時用的是快取內的檔案。
4. 設定 Token（只需一次）：
   ```bash
   node ~/openfun-codex-plugin/setup.mjs
   ```
   依提示貼上 Token 後按 Enter，**輸入內容不會顯示在畫面上**。請自己在終端機操作，不要把 Token 貼到 Codex 對話中。
5. 重新啟動 Codex，然後問：「請檢查歐噴資料庫的設定是否正常」。

Windows（PowerShell）時，第 4 步為 `node "$HOME\openfun-codex-plugin\setup.mjs"`。

## Token 存在哪裡

| 系統 | 位置 | 權限 |
|---|---|---|
| macOS／Linux | `~/.config/openfun-data/credentials.json` | 目錄 700、檔案 600，只有你自己能讀 |
| Windows | `%APPDATA%\openfun-data\credentials.json` | 沿用使用者設定目錄的存取權限（Windows 不使用 600 這類權限位元） |

- Token 存在你的使用者設定目錄，不在 plugin 資料夾或 Codex 快取裡，所以更新或重裝 plugin 不會遺失，也不會被打包。
- 這是一般檔案，**不是**系統鑰匙圈或加密儲存。Codex 沒有像 Claude Desktop 那樣的擴充套件設定畫面，所以改用這個本機檔案。
- 如果設定檔權限被改成其他人可讀（macOS／Linux），plugin 會拒絕使用並請你重新執行設定程式。

## 更新、移除、查看狀態

```bash
node ~/openfun-codex-plugin/setup.mjs            # 取代 Token（會先詢問是否取代）
node ~/openfun-codex-plugin/setup.mjs --status   # 是否已設定（不顯示 Token）
node ~/openfun-codex-plugin/setup.mjs --remove   # 移除 Token
```

變更後請重新啟動 Codex。設定程式只接受在終端機中互動輸入，不接受命令列參數或管線傳入的 Token，也不會連網。

解除安裝：

```bash
codex plugin remove openfun-data@openfun
codex plugin marketplace remove openfun
node ~/openfun-codex-plugin/setup.mjs --remove   # 若也要刪除 Token
```

## 進階：環境變數

MCP server 收到非空的 `OPENFUN_API_TOKEN` 時會優先使用它，而不讀設定檔。
但 Codex 啟動本機 MCP server 時只傳遞少數系統環境變數（例如 HOME、PATH），預設**不會**傳遞
`OPENFUN_API_TOKEN`，所以在 Codex 中請使用上面的設定程式。

## 故障排除

| 狀況 | 處理 |
|---|---|
| Codex 說找不到歐噴資料庫的工具 | 確認 `node --version` 為 18 以上；執行 `codex plugin list` 確認 `openfun-data@openfun` 已安裝且啟用；重新啟動 Codex。 |
| 尚未設定 Token | 執行第 4 步的設定程式，然後重新啟動 Codex。 |
| Token 無效、已過期或類型不適用 | 到 https://data.openfun.tw/user 建立新的一般 API Token，重新執行設定程式取代。 |
| 設定檔權限過寬或不是一般檔案 | 重新執行設定程式，它會以正確權限重寫。 |
| 權限不足、額度用完、伺服器錯誤 | 這些不代表查無資料；照 Codex 回覆中的建議處理。 |

授權：MIT（見 `LICENSE`）；內嵌第三方套件授權見 `THIRD_PARTY_LICENSES.md`。
