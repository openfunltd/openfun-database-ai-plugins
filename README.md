# openfun-database-ai-plugins

讓 **Claude Desktop** 和 **Codex** 都能查詢 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
裝好之後，直接在聊天中用中文問問題，例如：

> 幫我查「開放文化基金會」出現在哪些資料集？
> 臺北市資本額超過一億元的公司有幾家？列出前 10 家，附上資料來源。

AI 會自動搜尋資料集、閱讀欄位說明、查詢資料或做統計，並在回答中附上**資料集名稱、網址、授權與資料限制**。所有查詢功能都是**唯讀**，不會修改歐噴資料；要求 Excel 匯出時會寫入本機下載資料夾。

兩個平台都能從桌面版畫面安裝。Codex 需要 Node.js 18 以上；Token 可直接在連線設定畫面輸入，也提供對話短效 Token 方式。

## 下載檔案（v0.1.0 測試版）

| 平台 | 下載 | 下載後怎麼用 |
|---|---|---|
| Claude Desktop（必要） | [openfun-claude-extension.mcpb](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-claude-extension.mcpb) | 雙擊安裝，在擴充套件設定填入 Token |
| Claude Desktop（可選技能指引） | [openfun-chat-skill.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-chat-skill.zip) | 保留 ZIP，在 Customize > Skills 上傳 |
| Claude Desktop（外掛格式的同一份指引） | [openfun-chat-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-chat-plugin.zip) | 只給 Customize > Plugins 上傳，不能上傳到 Skills |
| Codex（供更新連線程式使用） | [openfun-codex-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-codex-plugin.zip) | 交給 Codex 更新本機連線程式；首次安裝依下方市集步驟操作 |

完整發布頁：<https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0>
Claude 請下載上面的安裝檔，不要使用 GitHub 自動產生的「Source code (zip)」。Codex 請依下方市集步驟安裝。

## 選擇你的平台

| | Claude Desktop | Codex |
|---|---|---|
| 安裝來源 | `openfun-claude-extension.mcpb`（必要）；聊天指引可選 Skill 或 Plugin，擇一即可 | GitHub 市集的 `codex-marketplace` 分支 |
| 安裝方式 | 雙擊或在設定畫面安裝 | 新增 GitHub 市集 |
| 需要 Node.js | 不需要 | 需要 18 以上 |
| Token 設定 | 擴充套件設定畫面的欄位 | 「外掛程式」→「MCP」標籤頁的環境變數欄位；也可用對話 |
| Token 存放 | 系統憑證儲存區（加密） | 畫面設定存在本機設定檔（未加密）；對話 Token 只存在記憶體 |
| 完整說明 | [Claude Desktop 說明](docs/CLAUDE_DESKTOP.md) | [Codex plugin 說明](codex/README.md) |

兩個平台都要到 <https://data.openfun.tw/user> 登入，建立**一般 API Token**（不是 Frontend Token）。
Claude 安裝檔請從上方「[下載檔案](#下載檔案v010-測試版)」取得；Codex 請依下方市集步驟安裝。開發者也可依下方「原始碼與打包」自行產生。

## Claude Desktop 安裝

適用 macOS 與 Windows，不需要終端機或 Node.js。

1. 雙擊 `openfun-claude-extension.mcpb`（或拖曳到 Claude Desktop 視窗，或從 **Settings > Extensions > Advanced settings > Install Extension…** 選擇）。
2. 按 **Install**，在「歐噴 API Token」欄位貼上 Token，儲存並確認已啟用。
3. （可選）下載 `openfun-chat-skill.zip`，到 **Customize > Skills** 上傳聊天指引，操作見下方小節。**完成前兩步就能查資料**。
4. 開新聊天，問：「請檢查歐噴資料庫的設定是否正常」。

逐步教學、聊天示範、故障排除與隱私說明：[docs/CLAUDE_DESKTOP.md](docs/CLAUDE_DESKTOP.md)。

### 上傳到「技能」：請用 openfun-chat-skill.zip

1. 下載上方的 `openfun-chat-skill.zip`，**保留 ZIP，不要解壓縮**。
2. 開啟 **Customize（自訂）> Skills（技能）>「+」> Create skill（建立技能）> Upload a skill（上傳技能）**，選取這份 ZIP。
3. 啟用 `openfun-data`，開新聊天，問：「請檢查歐噴資料庫的設定是否正常」。

這份指引與下面的 Plugin 內容相同，**擇一安裝即可**。若出現「A skill cannot contain a plugin manifest」或 `SKILL.md` 層級錯誤，表示傳入了 Plugin ZIP，請改用 **`openfun-chat-skill.zip`**。格式與操作依 [Claude 官方技能文件](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)、[上傳技能教學](https://support.claude.com/en/articles/12512180-use-skills-in-claude)。

### openfun-chat-plugin.zip 下載後怎麼用？

這份 ZIP 是給 Claude 閱讀的**使用指引**：教它何時使用歐噴工具、先確認欄位再查詢，以及如何附上來源、說明限制與匯出 Excel。真正負責連線查詢的是上面的 `.mcpb`；ZIP 不含查詢程式，也沒有 Token 設定欄位。**只裝 `.mcpb` 就能查資料，ZIP 是可選的補充指引。**

1. 下載 `openfun-chat-plugin.zip`，**保留 ZIP，不要解壓縮**。
2. 在 Claude Desktop 左側開啟 **Customize（自訂）> Plugins（外掛程式）**，按 **Add（新增）> Upload plugin（上傳外掛程式）**，上傳這份 ZIP。
3. 安裝後確認「**歐噴資料庫聊天指引**」已啟用。
4. 開新聊天，直接提問；若要手動選用指引，在輸入框輸入 `/`，從清單選取歐噴的 `openfun-data` 指引。確認連線可問：「請檢查歐噴資料庫的設定是否正常」。

這份 **Plugin ZIP 只能上傳到 Plugins，不能上傳到 Skills**，也不要當作聊天附件或裝到 Settings > Extensions。Plugins 需 Claude 付費方案；安裝及選用指引的操作可參考 [Claude 官方說明](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)。

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

## 完整匯出 Excel

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

## 開發狀態

- Claude Desktop：已可打包 MCPB 與選用的聊天指引 ZIP；macOS／Windows 上的安裝畫面尚未完成實機驗收。
- Codex：macOS 15.7.7、Codex 26.930.51102 已由使用者實測，以獨立本機 MCP 完成 Token 檢查與資料查詢。請依 [Codex 說明](codex/README.md) 完成必要的連線設定。外掛附帶 MCP 的工具載入問題仍待確認；Windows 尚未實機驗收。
- 目前發布的是 [v0.1.0 測試版](https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0)；沒有部署額外的連線服務。

## 打包檔的差異

| 檔案 | 給誰用 | 使用位置 | 用途 |
|---|---|---|---|
| `openfun-claude-extension.mcpb` | Claude Desktop | Settings > Extensions | 真正的查詢功能，含 Token 設定欄位（必要） |
| `openfun-chat-skill.zip` | Claude Desktop | Customize > Skills | 聊天指引，不能單獨查資料（可選，與 Plugin 擇一） |
| `openfun-chat-plugin.zip` | Claude Desktop | Customize > Plugins | 同一份指引的 Plugin 格式，不能上傳到 Skills（可選） |
| `openfun-codex-plugin.zip` | Codex | 更新本機連線程式用；安裝請新增 GitHub 市集 | 9 個唯讀查詢工具、3 個 Excel 匯出工具、對話 Token 工具與使用指引；需要 Node.js 18 以上 |

檔案不能互換：MCPB 裝到 Extensions、Skill ZIP 上傳到 Skills、Plugin ZIP 上傳到 Plugins；Claude 的 ZIP 也不能給 Codex 使用。

## 原始碼與打包

`src/` 是共用的 MCP 伺服器與 API 查詢程式；`manifest.json`、`plugin/` 放 Claude 的設定與聊天指引，`codex/` 放 Codex 的設定與聊天指引。兩個平台共用同一份 `server/index.mjs`，不各自複製查詢邏輯。

開發者先執行 `npm ci`，再選擇打包指令：

| 指令 | 輸出到 `dist/` |
|---|---|
| `npm run pack:claude` | `openfun-claude-extension.mcpb`、`openfun-chat-skill.zip`、`openfun-chat-plugin.zip`（後兩者為同一指引的不同格式，擇一） |
| `npm run pack:codex` | `openfun-codex-plugin.zip` |
| `npm run pack` | 上述全部檔案 |

打包入口分別為 `scripts/pack.mjs`、`scripts/pack-skill.mjs`、`scripts/pack-plugin.mjs` 和 `scripts/pack-codex.mjs`。`npm test` 會重新打包並驗證產物；開發環境需求與測試限制見 [開發說明](DEVELOPMENT.md)。`dist/` 與 `build/` 是產生檔，不提交到 Git。

---

授權：MIT（見 [LICENSE](LICENSE)）。開發者請看 [DEVELOPMENT.md](DEVELOPMENT.md)。
