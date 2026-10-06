# 歐噴資料庫：Claude Desktop 完整說明

這份文件是 Claude Desktop 的逐步安裝、使用、故障排除與隱私說明。Codex 請看 [Codex plugin 說明](../codex/README.md)；回到 [主說明](../README.md)。

安裝擴充套件、貼上 Token，就能在 Claude Desktop 的**一般聊天**中用中文查詢 [歐噴資料庫](https://data.openfun.tw)。

- 不需要終端機，不需要安裝 Node.js，也不用手動修改 JSON 設定檔
- 所有功能都是**唯讀**，不會修改任何資料
- 支援 **Claude Desktop for macOS 與 Windows**（Claude Desktop 沒有 Linux 版）

## 兩個檔案，用途不同

| 檔案 | 安裝位置 | 用途 |
|---|---|---|
| `openfun-claude-extension.mcpb` | **Settings > Extensions** | **真正的查詢功能**；Token 只在這裡設定一次（**必要**） |
| `openfun-chat-plugin.zip` | **Customize > Plugins** 上傳 | 聊天指引：教 Claude 怎麼搭配上面的擴充套件查資料、附來源（可選） |

- 只裝 `openfun-chat-plugin.zip` **不能查資料**：plugin 裡的本機 MCP 工具只在 Cowork 與 Claude Code 執行，一般聊天不會啟動，所以這份 plugin 刻意只放指引，不含查詢程式，也沒有 Token 欄位。
- 把 `.mcpb` 上傳到 Customize > Plugins 會出現「The archive must contain a .claude-plugin/plugin.json manifest…」錯誤，因為 `.mcpb` 是擴充套件，不是 plugin。請改到 Settings > Extensions 安裝（見第 3 步）。
- 反過來，`openfun-chat-plugin.zip` 也不能裝在 Settings > Extensions。

`.mcpb` 是公開的 MCP Bundle 規格（[官方說明](https://github.com/modelcontextprotocol/mcpb)）。

---

## 1. 準備

1. 安裝並登入 [Claude Desktop](https://claude.ai/download)（macOS 或 Windows），建議更新到最新版。
2. 下載安裝檔 [openfun-claude-extension.mcpb](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-claude-extension.mcpb)（必要）與 [openfun-chat-plugin.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-chat-plugin.zip)（可選），完整發布頁見 [v0.1.0 測試版](https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0)。請直接下載這兩個檔案，不要使用 GitHub 自動產生的「Source code (zip)」。

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

## 3b.（可選）上傳聊天指引 plugin

1. 在 Claude 打開 **Customize > Plugins**，選擇上傳 plugin，選 `openfun-chat-plugin.zip`。
2. 這份 plugin 不會要求 Token，也不會單獨提供查詢功能；它讓 Claude 在你問台灣公共資料時，記得使用第 3 步安裝的擴充套件、附上來源並說明限制。
3. 如果 Claude 說找不到歐噴資料庫的工具，代表第 3 步的擴充套件還沒安裝、沒填 Token，或在聊天的「+」> Connectors 中被關閉。

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
