# 歐噴資料庫：Codex plugin

在 Codex 中用中文查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
內含 9 個唯讀查詢工具（搜尋資料集、讀取 schema 與使用指引、查詢記錄、分組統計）、2 個 Token 設定工具，以及教 Codex 正確使用的 skill。

**下載（v0.1.0 測試版）：**[openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-codex-plugin.zip)（完整發布頁：<https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0>）。
請直接下載這個 ZIP，不要使用 GitHub 自動產生的「Source code (zip)」。

- 查詢工具都是唯讀，只會連到 `https://data.openfun.tw`。
- **桌面版可從畫面安裝**。獨立本機 MCP 可直接在設定畫面輸入 Token，重新啟動後不用重貼；也提供對話短效 Token 方式。
- 這是**本機** MCP server：只在你電腦上執行的 Codex 中運作。它**不能**在 ChatGPT 網頁版使用，
  也不是公開 Plugins Directory 上架的 plugin。
- macOS 15.7.7、Codex 26.930.51102 已由使用者實測：改用下方的獨立本機 MCP 後，Token 檢查及資料查詢成功。外掛附帶 MCP 仍有工具未送進對話的問題，根因尚未確認；ZIP 上傳也有失敗回報。Windows 尚未實機驗收。

## 需要

- Codex 桌面版（本機模式）；也支援 Codex CLI。
- Node.js 18 以上。沒有的話請先到 https://nodejs.org 安裝，安裝後重新啟動 Codex。
- 歐噴帳號：到 https://data.openfun.tw/user 登入，之後在這裡建立 Token（一般 API Token，不是 Frontend Token）。

## 桌面版安裝（建議：GitHub 市集）

1. 在「外掛程式」頁面選擇「本機」，按「新增 → 新增外掛市集」。
2. 填入下列內容，按「新增市集」：

   | 欄位 | 填入 |
   |---|---|
   | 來源 | `https://github.com/openfunltd/openfun-database-ai-plugins.git` |
   | Git 參照 | `codex-marketplace` |
   | 稀疏路徑 | 留空 |

3. 在 OpenFun 市集安裝「歐噴資料庫」，開本機對話並選取「歐噴資料庫」。
4. 要在 MCP 畫面設定 Token，或對話找不到工具時，**先把下方「替代載入方式」的整段話貼給 Codex，讓它直接替你設定 `openfun-local`**。
5. 完成後重新啟動 Codex，再到 MCP 畫面輸入 Token，開新對話檢查設定。

市集分支已包含完整的 MCP 程式，不需要自行編譯或輸入安裝指令。

### 替代載入方式：貼給 AI，讓它直接設定

在本機對話選取「歐噴資料庫」，貼上：

> 請幫我用替代載入方式設定歐噴資料庫：從已安裝的 openfun-data 外掛找到 server/index.mjs，將它與 LICENSE、THIRD_PARTY_LICENSES.md 複製到固定資料夾（macOS／Linux：家目錄的 .local/share/openfun-data/codex-mcp；Windows：本機應用程式資料目錄的 openfun-data/codex-mcp，保持 server/ 結構）。在 Codex 設定新增獨立本機 MCP「openfun-local」：啟動指令用已確認的 Node 絕對路徑，引數用副本的 server/index.mjs 絕對路徑和 --host=codex，工作目錄用副本根目錄。保留外掛，只將 [plugins."openfun-data@openfun".mcp_servers."openfun-data"].enabled 設為 false，其他設定及既有環境變數保持原樣。請直接處理，不要只回報找不到工具，也不要讀取或搬移任何憑證；完成後告訴我如何重啟，以及在 MCP 畫面設定 OPENFUN_API_TOKEN。

Codex 會把同一支歐噴程式複製到固定資料夾，新增本機 MCP，保留外掛的聊天指引並停用它附帶的 MCP。
**你不用自己輸入安裝指令。** Codex 設定完成後：

1. 重新啟動 Codex。
2. 到「設定 → MCP 伺服器」編輯 `openfun-local`，在「環境變數」填入 `OPENFUN_API_TOKEN` 和你的 Token，儲存後再重新啟動。
3. 開新對話說：「請用歐噴資料庫檢查設定，然後查『開放文化基金會』。」

這份獨立副本不會隨市集自動更新；日後更新外掛時，請 Codex 一併更新副本。此方式符合
[官方本機 MCP 設定方式](https://learn.chatgpt.com/docs/extend/mcp)，仍在你的電腦執行，不需要管理伺服器。

### 更新獨立本機 MCP

對本機 Codex 說：

> 請從 openfunltd/openfun-database-ai-plugins 的 GitHub v0.1.0 Release 下載最新 Codex ZIP，核對 SHA256SUMS，更新 openfun-local 的程式副本。保留 MCP 環境變數設定，不讀取或搬移任何憑證。

完成後重新啟動 Codex。只更新市集外掛不會更新獨立副本；新版不再讀取 `credentials.json`，Token 請在 MCP 畫面設定。

### 選用：上傳 ZIP

部分桌面版曾回報「無法新增外掛程式」，原因尚未確認；遇到這個訊息請先使用上方的 GitHub 市集。

1. 下載上方的 `openfun-codex-plugin.zip`。
2. 在 Codex 的「外掛程式」頁面選擇「本機」，按「新增 → 新增外掛程式」。
3. 上傳這個 ZIP，按「新增外掛程式」，確認「歐噴資料庫」已啟用。
4. 開本機對話並選取「歐噴資料庫」；要在畫面設定 Token，或對話找不到工具時，貼上上方「替代載入方式」整段話，讓 Codex 直接設定獨立本機 MCP。
5. 要全程使用聊天，可說：「我要在對話中設定歐噴 Token」，再依提示貼上**短效 Token**。Token 會留在對話及工具呼叫紀錄中，請勿分享，用完可到歐噴撤銷。

### 從畫面新增本機市集

如果 ZIP 匯入後沒有載入 MCP，也可以使用本機市集安裝，不需要安裝指令：

1. 用系統的解壓縮功能，把 ZIP 解壓到會長期保留的 `openfun-codex-plugin` 資料夾；`plugin.json` 應直接位於資料夾內。
2. 在「外掛程式」按「新增 → 新增外掛市集」。
3. 「來源」填入上述資料夾的完整路徑；「Git 參照」與「稀疏路徑」留空。
4. 新增市集後安裝「歐噴資料庫」，開本機對話並選取外掛；要在畫面設定 Token，或對話找不到工具時，貼上上方「替代載入方式」。

儲存庫的 `main` 分支放的是共用原始碼；從 GitHub 新增市集時，請在「Git 參照」填入 `codex-marketplace`。

## 在 MCP 設定畫面輸入 Token（獨立本機 MCP 建議）

1. 到「設定 → MCP 伺服器」，編輯 `openfun-local`（或你為獨立本機歐噴 MCP 設定的名稱）。
2. 在「環境變數」新增：

   | 欄位 | 填入 |
   |---|---|
   | 金鑰 | `OPENFUN_API_TOKEN` |
   | 值 | 你在歐噴建立的一般 API Token |

3. 「環境變數透傳」留空，按「儲存」，重新啟動 Codex。
4. 開新對話說：「請用歐噴資料庫檢查設定」。看到「Token 有效，已可查詢」即可使用。

**不需要終端機，也不用把 Token 貼到聊天。** Token 會存入 Codex 本機設定，未加密，請勿分享含有 Token 的設定檔或截圖。
更新或移除時，回到同一個畫面修改／刪除 `OPENFUN_API_TOKEN` 項目，並重新啟動 Codex。
不會讀取獨立的 `credentials.json` Token 檔；移除畫面設定後，不會從該檔案載入 Token。

若歐噴只出現在不可編輯的「來自外掛程式」區塊，先使用上方「替代載入方式」改成獨立本機 MCP，或選擇對話短效 Token。

## 選用：終端機安裝

先下載 ZIP，解壓到家目錄下會長期保留的 `openfun-codex-plugin` 資料夾。安裝後在 MCP 畫面設定 Token，或選擇對話方式。

### Unix（macOS／Linux）

```bash
codex plugin marketplace add "$HOME/openfun-codex-plugin"
codex plugin add openfun-data@openfun
```

### Windows（PowerShell）

```powershell
codex plugin marketplace add "$HOME\openfun-codex-plugin"
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

- 在 MCP 畫面刪除 `OPENFUN_API_TOKEN` 項目並重新啟動：移除持久設定。
- 對 Codex 說「清除歐噴 Token」：只清掉這次執行中記憶體裡的 Token，**不會刪除環境變數或聊天紀錄，也不會撤銷 Token**；重新啟動 Codex 後若 MCP 環境變數還在，會再次載入。

要讓 Token 真正失效，請到 https://data.openfun.tw/user 撤銷。

## 解除安裝

桌面版可在「外掛程式」移除歐噴資料庫；MCP 畫面中的 Token 設定需另外移除，並到歐噴撤銷 Token。

若採用上方的獨立本機 MCP，另在「設定 → MCP 伺服器」移除 `openfun-local`。
移除獨立 MCP 後可刪除副本資料夾；只移除外掛不會移除這個獨立 MCP。

CLI 使用者可執行：

```bash
codex plugin remove openfun-data@openfun
codex plugin marketplace remove openfun
codex mcp remove openfun-local  # 僅採用獨立本機 MCP 時需要
```

## 故障排除

| 狀況 | 處理 |
|---|---|
| Codex 說找不到歐噴資料庫的工具 | 請 Codex 檢查目前對話的實際工具目錄，包含 `functions.exec` 的工具或可用的工具搜尋；工具名稱可能加上 MCP 前綴。只有明確的 Node.js 啟動錯誤才需要排查 Node.js。 |
| 上傳 ZIP 說缺少 manifest | 重新下載本頁的 ZIP；包內包含 `.claude-plugin/plugin.json` 封存檔相容入口，請勿使用 Source code ZIP。 |
| 上傳 ZIP 顯示「無法新增外掛程式」 | 使用上方的 GitHub 市集安裝。此訊息沒有具體原因，請提供作業系統、桌面版版本與可取得的錯誤代碼以便追查。 |
| ZIP 匯入後沒有 MCP | 用上方「從畫面新增本機市集」安裝，這個方式直接載入包內的本機 MCP 設定。 |
| 已安裝、有 MCP，但對話找不到工具 | 日誌 `ready` 不能證明對話拿得到工具。完成工具探索仍找不到時，使用上方「替代載入方式」的獨立本機 MCP 方式；macOS 已實測成功，不用反覆重裝或先重設 Token。 |
| 回覆「未安裝」或 `public global listed plugin` | 這是公開外掛目錄的查詢結果，不能用來判定本機／Git 市集外掛。請 Codex 直接尋找本機歐噴 MCP 工具。 |
| 尚未設定 Token | 獨立本機 MCP：在 MCP 設定畫面的環境變數填 `OPENFUN_API_TOKEN`，儲存後重新啟動。也可選擇對話短效 Token。 |
| Token 無效、已過期或類型不適用 | 到 https://data.openfun.tw/user 建立新的一般 API Token，在 MCP 畫面更新後重新啟動；對話方式則重新設定短效 Token。 |
| 權限不足、額度用完、伺服器錯誤 | 這些不代表查無資料；照 Codex 回覆中的建議處理。 |

若 Codex 回覆找不到工具，可在同一個對話貼上：

> 請檢查目前對話的實際工具目錄。如果有 functions.exec 和 ALL_TOOLS，找出名稱包含 openfun_check_config 的條目，再用 tools[實際名稱]({}) 呼叫。若只有工具搜尋功能，就搜尋後呼叫。不要用 plugin_management 查公開外掛目錄。若仍沒有工具，請依上方替代載入指引直接替我設定 openfun-local，不要只回報工具不存在，也不要要求重裝或提供 Token。

若檢查後仍沒有工具，請使用上方「替代載入方式」方式。新增設定後需重新啟動並開新對話驗證；不能只憑 `ready` 或設定檔就宣稱查詢已正常。

授權：MIT（見 `LICENSE`）；內嵌第三方套件授權見 `THIRD_PARTY_LICENSES.md`。

封裝格式參考：[OpenAI 官方打包文件](https://developers.openai.com/plugins/build/plugins)與[封存檔規格](https://developers.openai.com/plugins/deploy/submission-errors)。本包的 `.claude-plugin/plugin.json` 是桌面版匯入相容入口，與 Claude 的選用聊天指引 ZIP 是不同安裝包。
