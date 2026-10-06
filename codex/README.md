# 歐噴資料庫：Codex plugin

在 Codex 中用中文查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
內含 9 個唯讀查詢工具（搜尋資料集、讀取 schema 與使用指引、查詢記錄、分組統計）、2 個 Token 設定工具，以及教 Codex 正確使用的 skill。

**下載（v0.1.0 測試版）：**[openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-codex-plugin.zip)（完整發布頁：<https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0>）。
請直接下載這個 ZIP，不要使用 GitHub 自動產生的「Source code (zip)」。

- 查詢工具都是唯讀，只會連到 `https://data.openfun.tw`。
- **桌面版可從畫面安裝**。Token 可在對話中設定；想讓重新啟動後不用重貼，也可用終端機存到本機。
- 這是**本機** MCP server：只在你電腦上執行的 Codex 中運作。它**不能**在 ChatGPT 網頁版使用，
  也不是公開 Plugins Directory 上架的 plugin。
- 已驗證 Codex 0.159.3 的市集安裝後端、MCP 載入及工具呼叫；桌面版 ZIP 上傳畫面仍待實機驗收。

## 需要

- Codex 桌面版（本機模式）；也支援 Codex CLI。
- Node.js 18 以上。沒有的話請先到 https://nodejs.org 安裝，安裝後重新啟動 Codex。
- 歐噴帳號：到 https://data.openfun.tw/user 登入，之後在這裡建立 Token（一般 API Token，不是 Frontend Token）。

## 桌面版安裝

1. 下載上方的 `openfun-codex-plugin.zip`。
2. 在 Codex 的「外掛程式」頁面選擇「本機」，按「新增 → 新增外掛程式」。
3. 上傳這個 ZIP，按「新增外掛程式」，確認「歐噴資料庫」已啟用。
4. 開新對話，說：「請直接呼叫歐噴 MCP 的 openfun_check_config」。尚未設定 Token 時，應收到要求設定 Token 的回覆。
5. 要全程使用聊天，可說：「我要在對話中設定歐噴 Token」，再依提示貼上**短效 Token**。Token 會留在對話及工具呼叫紀錄中，請勿分享，用完可到歐噴撤銷。

### 從畫面新增本機市集

如果 ZIP 匯入後沒有載入 MCP，也可以使用本機市集安裝，不需要安裝指令：

1. 用系統的解壓縮功能，把 ZIP 解壓到會長期保留的 `openfun-codex-plugin` 資料夾；`setup.mjs` 應直接位於資料夾內。
2. 在「外掛程式」按「新增 → 新增外掛市集」。
3. 「來源」填入上述資料夾的完整路徑；「Git 參照」與「稀疏路徑」留空。
4. 新增市集後，安裝其中的「歐噴資料庫」，開新對話檢查設定。

目前儲存庫的 `main` 分支放的是原始碼，不要直接把 GitHub 儲存庫網址當作可安裝的市集來源。

## 選用：終端機安裝並儲存 Token

先到 https://data.openfun.tw/user 建立一般 API Token，並下載 `openfun-codex-plugin.zip`。
ZIP 要解壓到**會長期保留**的資料夾，解壓後 `setup.mjs` 應直接位於該資料夾內。下列指令的路徑都加了引號，資料夾名稱有空白或中文也能用；改用其他資料夾時，請替換第一行和第三行的路徑。

### Unix（macOS／Linux）

1. 把 ZIP 解壓到家目錄下的 `openfun-codex-plugin` 資料夾（例如 macOS 為 `/Users/你的帳號/openfun-codex-plugin`，Linux 為 `/home/你的帳號/openfun-codex-plugin`）。
2. 在終端機執行：
   ```bash
   codex plugin marketplace add "$HOME/openfun-codex-plugin"
   codex plugin add openfun-data@openfun
   node "$HOME/openfun-codex-plugin/setup.mjs"
   ```

### Windows（PowerShell）

1. 把 ZIP 解壓到家目錄下的 `openfun-codex-plugin` 資料夾（例如 `C:\Users\你的帳號\openfun-codex-plugin`）。
2. 在 PowerShell 執行：
   ```powershell
   codex plugin marketplace add "$HOME\openfun-codex-plugin"
   codex plugin add openfun-data@openfun
   node "$HOME\openfun-codex-plugin\setup.mjs"
   ```

### 輸入 Token 並確認

1. 第三行會請你貼上 Token 後按 Enter；畫面不會顯示輸入內容。它只檢查格式、不連網，Token 是否有效要在下一步確認。
2. 重新啟動 Codex，問：「請檢查歐噴資料庫的設定是否正常」。看到「Token 有效，已可查詢」就可以開始用。

Token 存一次即可，Codex 重新啟動時會自動讀取；直到 Token 過期、被撤銷或你移除設定檔才需要更新。

## 選用：畫面安裝後儲存 Token

想讓 Codex 重新啟動後不用重貼 Token，可另外解壓 ZIP，執行裡面的 `setup.mjs`。這一步只設定 Token，不需要重新安裝外掛。

### Unix（macOS／Linux）

把 ZIP 解壓到家目錄下的 `openfun-codex-plugin` 資料夾，執行：

```bash
node "$HOME/openfun-codex-plugin/setup.mjs"
```

### Windows（PowerShell）

把 ZIP 解壓到家目錄下的 `openfun-codex-plugin` 資料夾，執行：

```powershell
node "$HOME\openfun-codex-plugin\setup.mjs"
```

依提示輸入 Token，再重新啟動 Codex。輸入內容不會顯示，也不會進入聊天紀錄；本機設定檔未加密，以檔案權限保護。

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

使用畫面安裝，或不想把 Token 存在電腦上時，可以跳過 `setup.mjs`，在 Codex 對話中說「我要在對話中設定歐噴 Token」。Codex 會請你：
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

桌面版可在「外掛程式」移除歐噴資料庫；本機 Token 設定檔需另外刪除，並到歐噴撤銷 Token。CLI 使用者可執行：

```bash
codex plugin remove openfun-data@openfun
codex plugin marketplace remove openfun
node ~/openfun-codex-plugin/setup.mjs --remove
```

## 故障排除

| 狀況 | 處理 |
|---|---|
| Codex 說找不到歐噴資料庫的工具 | 確認已安裝 Node.js 18 以上，外掛已在「本機」啟用；重新啟動 Codex並開新對話。CLI 使用者可用 `codex plugin list` 查看。 |
| 上傳 ZIP 說缺少 manifest | 重新下載本頁的 ZIP；包內包含 `.claude-plugin/plugin.json` 封存檔相容入口，請勿使用 Source code ZIP。 |
| ZIP 匯入後沒有 MCP | 用上方「從畫面新增本機市集」安裝，這個方式直接載入包內的本機 MCP 設定。 |
| 已安裝、有 MCP，但對話找不到工具 | 在 `/mcp` 或「設定 → MCP servers」查看 `openfun-data` 的連線狀態、工具數量及錯誤。已連線時開新對話，說「請直接呼叫歐噴 MCP 的 openfun_check_config」。ChatGPT 外掛目錄的「未安裝」不代表本機外掛沒裝好；工具載入前不用重設 Token。 |
| 尚未設定 Token | 在終端機執行 `node ~/openfun-codex-plugin/setup.mjs` 後重新啟動 Codex（或選擇在對話中貼短效 Token）。 |
| Token 無效、已過期或類型不適用 | 到 https://data.openfun.tw/user 建立新的一般 API Token，重新執行 `setup.mjs` 更新後重新啟動 Codex。 |
| 設定檔權限過寬或不是一般檔案 | 重新執行 `setup.mjs`，它會以正確權限重寫。 |
| 權限不足、額度用完、伺服器錯誤 | 這些不代表查無資料；照 Codex 回覆中的建議處理。 |

授權：MIT（見 `LICENSE`）；內嵌第三方套件授權見 `THIRD_PARTY_LICENSES.md`。

封裝格式參考：[OpenAI 官方打包文件](https://developers.openai.com/plugins/build/plugins)與[封存檔規格](https://developers.openai.com/plugins/deploy/submission-errors)。本包的 `.claude-plugin/plugin.json` 是桌面版匯入相容入口，與 Claude 的選用聊天指引 ZIP 是不同安裝包。
