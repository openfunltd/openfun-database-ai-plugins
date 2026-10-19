# 歐噴資料庫：Claude Desktop 完整說明

這份文件是 Claude Desktop 的逐步安裝、使用、故障排除與隱私說明。Codex 請看 [Codex plugin 說明](../codex/README.md)；回到 [主說明](../README.md)。

安裝擴充套件、貼上 Token，就能在 Claude Desktop 的**一般聊天**中用中文查詢 [歐噴資料庫](https://data.openfun.tw)。

- 不需要終端機，不需要安裝 Node.js，也不用手動修改 JSON 設定檔
- 查詢不會修改歐噴資料；Excel 匯出會寫入本機下載資料夾
- 支援 **Claude Desktop for macOS 與 Windows**（Claude Desktop 沒有 Linux 版）

## 查詢程式與聊天指引，用途不同

| 檔案 | 安裝位置 | 用途 |
|---|---|---|
| `openfun-claude-extension.mcpb` | **Settings > Extensions** | **真正的查詢功能**；Token 只在這裡設定一次（**必要**） |
| `openfun-chat-skill.zip` | **Customize > Skills** 上傳 | 補充聊天指引（可選，與 Plugin 擇一） |
| `openfun-chat-plugin.zip` | **Customize > Plugins** 上傳 | 同一份指引的外掛格式；不能上傳到 Skills（可選） |

- 只裝 `openfun-chat-plugin.zip` **不能查資料**：plugin 裡的本機 MCP 工具只在 Cowork 與 Claude Code 執行，一般聊天不會啟動，所以這份 plugin 刻意只放指引，不含查詢程式，也沒有 Token 欄位。
- 把 `.mcpb` 上傳到 Customize > Plugins 會出現「The archive must contain a .claude-plugin/plugin.json manifest…」錯誤，因為 `.mcpb` 是擴充套件，不是 plugin。請改到 Settings > Extensions 安裝（見第 3 步）。
- 反過來，`openfun-chat-plugin.zip` 也不能裝在 Settings > Extensions。

`.mcpb` 是公開的 MCP Bundle 規格（[官方說明](https://github.com/modelcontextprotocol/mcpb)）。

---

## 1. 準備

1. 安裝並登入 [Claude Desktop](https://claude.ai/download)（macOS 或 Windows），建議更新到最新版。
2. 下載安裝檔 [openfun-claude-extension.mcpb](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-claude-extension.mcpb)（必要）。補充聊天指引可選 [openfun-chat-skill.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-chat-skill.zip)（Skills 格式）或 [openfun-chat-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-chat-plugin.zip)（Plugins 格式），擇一即可，完整發布頁見 [v0.1.0 測試版](https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0)。請下載上述安裝檔，不要使用 GitHub 自動產生的「Source code (zip)」。

## 2. 取得歐噴 API Token

1. 用瀏覽器打開 <https://data.openfun.tw/user>，註冊或登入。
2. 在帳號頁面建立一組**一般 API Token**（不是 Frontend Token）。
3. 複製 Token（通常是 `ofk_` 開頭的一串文字）。

> Token 就像密碼。只貼在 Claude Desktop 的擴充套件設定畫面，**不要貼在聊天訊息裡**，也不要傳給別人。

## 3. 安裝擴充套件

任選一種方式：

- **雙擊**安裝檔 `openfun-claude-extension.mcpb`；或
- 把安裝檔**拖曳**到 Claude Desktop 視窗；或
- 在 Claude Desktop 打開 **Settings（設定）> Extensions（擴充功能）> Advanced settings（進階設定）**，
  在 **Extension Developer** 區塊按 **Install Extension…（安裝擴充功能）**，選擇安裝檔。

接著會出現安裝畫面：

1. 確認名稱是「歐噴資料庫」，按 **Install（安裝）**。
2. 在「歐噴 API Token」欄位貼上剛剛複製的 Token，儲存。
3. 確認擴充套件是**啟用（Enabled）**狀態。

> 選單名稱依官方說明（[Claude 說明中心](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)、[MCPB 開發文件](https://claude.com/docs/connectors/building/mcpb)）以英文標示；若你的介面是中文，名稱可能略有不同。
> 如果是公司／組織帳號，管理員可能關閉了擴充功能，請洽管理員。

Token 會由 Claude Desktop 加密存放在系統的憑證儲存區（macOS「鑰匙圈」、Windows「認證管理員」）。

## 3b.（可選）在「技能」安裝聊天指引

1. 下載 `openfun-chat-skill.zip`，**保留 ZIP，不要解壓縮**。
2. 開啟 **Customize（自訂）> Skills（技能）>「+」> Create skill（建立技能）> Upload a skill（上傳技能）**，選取這份 ZIP。
3. 啟用 `openfun-data`，開新聊天，問：「請檢查歐噴資料庫的設定是否正常」。

這份 Skill 與下面的 Plugin 使用同一份指引，擇一安裝即可。若看不到 Skills，依 [官方說明](https://support.claude.com/en/articles/12512180-use-skills-in-claude) 啟用 Code execution and file creation（程式碼執行與檔案建立）；公司帳號依管理員設定。

若上傳時看到「A skill cannot contain a plugin manifest」或 `SKILL.md` 層級錯誤，請確認選的是 **`openfun-chat-skill.zip`**。Skill ZIP 只有 `openfun-data` 一個頂層資料夾，直接包含 `SKILL.md`，不含 Plugin manifest；結構依 [Claude 官方技能規範](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)。

## 3c.（可選，與 Skill 擇一）在「外掛程式」安裝指引

這份 ZIP 教 Claude 何時使用歐噴工具、先確認欄位再查詢、附上來源與說明限制，以及如何使用 Excel 匯出。**第 3 步的 `.mcpb` 已包含查詢工具與使用說明，只安裝它就能查資料；ZIP 是補充指引，不能單獨查詢，也不需要填 Token。**

1. 下載 `openfun-chat-plugin.zip`，**保留 ZIP，不要解壓縮**。
2. 在 Claude Desktop 左側開啟 **Customize（自訂）> Plugins（外掛程式）**，按 **Add（新增）> Upload plugin（上傳外掛程式）**，上傳這份 ZIP。
3. 確認「**歐噴資料庫聊天指引**」已啟用。
4. 開新聊天，直接提問；也可以在輸入框輸入 `/`，從清單選取歐噴的 `openfun-data` 指引，再輸入問題。

這份 **Plugin ZIP 只能上傳到 Plugins，不能上傳到 Skills**，也不要當作聊天附件或裝到 Settings > Extensions。Plugins 需 Claude 付費方案；操作依 [Claude 官方說明](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)。

如果 Claude 說找不到歐噴資料庫的工具，請檢查第 3 步的擴充套件是否啟用，以及聊天的「+」> Connectors 中是否開啟「歐噴資料庫」。只有 Token 驗證成功，才算確認能查資料。

## 4. 確認設定成功

開一個新的聊天，輸入：

> 請檢查歐噴資料庫的設定是否正常

Claude 第一次使用工具時可能會詢問是否允許，請選擇允許。看到「Token 有效，已可查詢」就完成了。

在聊天輸入框左下角的 **「+」> Connectors** 可以看到「歐噴資料庫」與它的工具，也可以在這裡暫時關閉。

## 5. 聊天示範

| 你可以這樣問 | Claude 會做的事 |
|---|---|
| 歐噴資料庫有哪些和選舉有關的資料？ | 搜尋資料集，列出名稱與用途 |
| 「台積電」的稅籍登記資料是什麼？ | 搜尋 → 讀欄位說明 → 查詢記錄 |
| 各縣市登記的餐飲業各有幾家？ | 讀欄位說明 → 分組統計 |
| 2024 年以後設立、資本額 1000 萬以上的公司，給我前 20 筆 | 範圍篩選 + 排序 + 分頁 |
| 這份資料多久更新一次？資料來源是哪個機關？ | 讀資料集資訊與使用指引 |

小技巧：

- 想要完整清單時，可以說「先告訴我總共有幾筆」；Claude 會說明總筆數，以及目前只看了第幾頁。
- 問統計問題（幾家、加總、平均）時，Claude 會優先用統計功能，不必一頁一頁翻。
- 回答中的數字與事實都應該來自查詢結果；如果 Claude 說「查無資料」或「查詢失敗」，兩者意思不同（見下方故障排除）。

## 完整匯出 Excel

在對話中說：

> 請把剛才符合條件的全部資料匯出成 Excel，附上來源與查詢條件。

外掛會自行分頁取完資料、核對筆數，再存到執行外掛那台電腦之家目錄 **Downloads/OpenFun（下載／OpenFun）**。AI 會查詢進度，完成後告訴你檔案位置；不必讓資料逐筆經聊天轉寫。若聊天中的檔案連結無法點開，直接從本機「下載／OpenFun」開啟。這不是雲端對話附件，也不要求另外設定 Token。

Excel 包含「查詢結果」「統計摘要」「來源與處理說明」三個工作表。查詢結果已開啟篩選、凍結標題列，並保留統編前導零；摘要列出完整筆數、數值欄位的合計與平均，AI 也能直接回報這些數字。最多統計 20 個數值欄位，空值不計入平均，平均四捨五入至最多六位小數。摘要是匯出當下的計算值，不隨之後修改 Excel 重算。

第一版每次最多 **10,000 筆、200 欄、32 MiB 資料**，仍受 API 權限、額度與取數上限限制。超限、缺頁、重複或查詢期間資料變動會停止，**不把部分資料當成完整檔案**。暫時性連線／伺服器錯誤會自動重試；其他失敗可在處理原因後重新匯出。可請 AI 取消進行中的匯出；重啟程式或更換 Token 後，未完成工作需重做。已完成檔案會留在本機，移除外掛不會刪除。

目前已驗證打包程式、MCP 檔案資源與 Codex app-server 的交付；macOS／Windows 圖形介面的點擊與下載仍待實機驗收。本機資料夾是檔案交付的保底方式。

## 6. 故障排除

| 看到的訊息 | 原因與處理 |
|---|---|
| 尚未設定可用的歐噴 API Token | 打開 Settings > Extensions，找到「歐噴資料庫」，進入設定（Configure）貼上 Token 並儲存；必要時先停用再啟用。 |
| Token 前面不需要加「Bearer」／Token 含有空白或換行／Token 太短 | 重新複製完整的 Token（通常是 `ofk_` 開頭、共 68 個字元），只貼 Token 本身。 |
| Token 無效或已撤銷／Token 已過期 | 到 <https://data.openfun.tw/user> 建立新的一般 API Token，回擴充套件設定更新。 |
| Token 類型不適用 | 你貼的是 Frontend Token，請改建立一般 API Token。 |
| 權限不足 | 你沒有這個資料集的存取權限。可請 Claude 改找其他資料集。 |
| 今日查詢額度已用完 | 免費額度在台灣時間午夜重置；可到 <https://data.openfun.tw/user> 查看方案。 |
| 請求太頻繁 | 稍等一下再問。 |
| 回應過大 | 結果超過單次回應上限。可以請 Claude「只看某幾個欄位」「每次少看幾筆」或縮小查詢條件；單筆資料太大時請到回覆中提供的資料集網頁查看。 |
| 歐噴伺服器錯誤／回應格式異常／連線逾時 | 服務端暫時問題，不代表查無資料。稍後再試。 |
| 無法連線到歐噴資料庫 | 確認網路正常；公司網路可能需要開放 `data.openfun.tw`。 |
| Claude 沒有使用歐噴資料庫 | 確認擴充套件已啟用、「+」> Connectors 中沒有被關閉；也可以直接說「請用歐噴資料庫查詢……」。 |
| 擴充套件顯示錯誤或無法啟動 | 更新 Claude Desktop 到最新版，移除後重新安裝。要回報問題時，可在 Claude Desktop 的開發者設定（Developer settings）查看連線狀態與記錄檔；記錄檔不會包含 Token。 |

更新 Token：Settings > Extensions >「歐噴資料庫」> 設定（Configure），貼上新 Token 後儲存。
移除：同一頁面選擇移除（Uninstall）。

## 7. 隱私與安全

- Token 只存放在你電腦的系統憑證儲存區，執行時透過環境變數交給擴充套件。
- Token 只透過加密連線送到 `https://data.openfun.tw`，不會放進網址、不會寫入檔案或記錄檔，也不會出現在 Claude 看得到的查詢結果中。
- 擴充套件不會跟隨伺服器的重新導向，避免 Token 被送到其他網站。
- 服務網址固定為 `https://data.openfun.tw`，Claude 無法讓它連到其他網址。
- 你的問題內容（搜尋關鍵字、查詢條件）會送到歐噴資料庫以取得結果，請參考 [歐噴資料庫服務條款](https://data.openfun.tw/terms)。
- 歐噴回傳的文件與資料被標示為「外部內容」，Claude 會被告知不要把其中的文字當成指令。

## 8. 已知限制

- 部分資料集只提供說明文件，不能查詢記錄。
- 統計功能（分組計數、加總）不支援全文搜尋或日期／數字範圍條件；需要這類條件時，Claude 會改用記錄查詢的總筆數。
- 數值統計需指定分組欄位；目前 API 不提供只指定數值欄位的全域統計。
- 每次查詢最多 100 筆；每次回應最多約 6 萬字。整頁放不下時只顯示能完整放入的記錄，並標示哪幾筆沒顯示、如何取得。
  單筆記錄或其他結果太大時會直接回報「回應過大」，不會給出被切掉一半的資料。
- 統計分組數量以 API 回傳為準；組別沒有全部列出時會提醒。
- macOS／Windows 上的實際安裝畫面尚未完成實機驗收，選單名稱以官方文件為準。

---

開發者請看 [DEVELOPMENT.md](../DEVELOPMENT.md)。授權：MIT（見 [LICENSE](../LICENSE)）。
