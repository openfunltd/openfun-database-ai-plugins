# openfun-database-ai-plugins

歐噴資料庫的 Claude Desktop 與 Codex 外掛，共用同一份 MCP 查詢原始碼。

讓只用聊天型 AI 的人也能使用 [歐噴資料庫](https://data.openfun.tw)（台灣公共資料 API）。
安裝擴充套件、貼上 Token，就能在 Claude Desktop 的**一般聊天**中用中文問問題，例如：

> 幫我查「開放文化基金會」出現在哪些資料集？
> 臺北市資本額超過一億元的公司有幾家？列出前 10 家，附上資料來源。

Claude 會自動搜尋資料集、閱讀欄位說明、查詢資料或做統計，並在回答中附上**資料集名稱、網址、授權與資料限制**。

- 不需要終端機，不需要安裝 Node.js，也不用手動修改 JSON 設定檔
- 所有功能都是**唯讀**，不會修改任何資料
- 支援 **Claude Desktop for macOS 與 Windows**（Claude Desktop 沒有 Linux 版）

## 原始碼與打包

`src/` 是共用的 MCP 伺服器與 API 查詢程式；`manifest.json`、`plugin/` 放 Claude 的設定與聊天指引，`codex/` 放 Codex 的設定與聊天指引。兩個平台共用同一份 `server/index.mjs`，不各自複製查詢邏輯。

開發者先執行 `npm ci`，再選擇打包指令：

| 指令 | 輸出到 `dist/` |
|---|---|
| `npm run pack:claude` | `openfun-claude-extension.mcpb`、`openfun-chat-plugin.zip`（選用指引） |
| `npm run pack:codex` | `openfun-codex-plugin.zip` |
| `npm run pack` | 上述全部檔案 |

打包入口分別為 `scripts/pack.mjs`、`scripts/pack-plugin.mjs` 和 `scripts/pack-codex.mjs`。`npm test` 會重新打包並驗證產物；開發環境需求與測試限制見 [開發說明](DEVELOPMENT.md)。`dist/` 與 `build/` 是產生檔，不提交到 Git。

## 開發狀態

- Claude Desktop：已提供可安裝的 MCPB 與選用的聊天指引。
- Codex：目前完成本機 MCP plugin，安裝及 Token 設定仍需終端機。
- 待實作：Codex 在對話中接收短效 Token 的設定工具與提示；目前版本尚未支援。預定提示為「建議使用短效 Token。Token 會留在對話紀錄中，請勿分享此對話；用完可到歐噴撤銷」，不要求目前沒有的權限範圍設定。
- macOS／Windows 桌面實機驗收、免 CLI 安裝流程仍待完成。目前沒有部署額外的連線服務。

## 有三個檔案，用途不同

| 檔案 | 給誰用 | 安裝位置 | 用途 |
|---|---|---|---|
| `openfun-claude-extension.mcpb` | Claude Desktop | **Settings > Extensions** | **真正的查詢功能**；Token 只在這裡設定一次（**必要**） |
| `openfun-chat-plugin.zip` | Claude Desktop | **Customize > Plugins** 上傳 | 聊天指引：教 Claude 怎麼搭配上面的擴充套件查資料、附來源（可選） |
| `openfun-codex-plugin.zip` | Codex（OpenAI） | 終端機執行 `codex plugin marketplace add`／`codex plugin add` | 同樣 9 個唯讀查詢工具加上使用指引；需要 Node.js 18 以上。安裝步驟見 [Codex plugin 說明](codex/README.md) |

`.mcpb` 是公開的 MCP Bundle 規格（[官方說明](https://github.com/modelcontextprotocol/mcpb)）；本專案這份 `.mcpb` 供 Claude Desktop 安裝。`openfun-chat-plugin.zip` 是專為 Claude 準備的聊天指引。Codex 使用自己的 plugin 包裝，請選 `openfun-codex-plugin.zip`。
Codex 版是本機執行的 MCP server，只能在你電腦上的 Codex 使用，不能在 ChatGPT 網頁版使用，也沒有上架公開目錄。
以下第 1～8 節是 Claude Desktop 的步驟。

- 只裝 `openfun-chat-plugin.zip` **不能查資料**：plugin 裡的本機 MCP 工具只在 Cowork 與 Claude Code 執行，一般聊天不會啟動，所以這份 plugin 刻意只放指引，不含查詢程式，也沒有 Token 欄位。
- 把 `.mcpb` 上傳到 Customize > Plugins 會出現「The archive must contain a .claude-plugin/plugin.json manifest…」錯誤，因為 `.mcpb` 是擴充套件，不是 plugin。請改到 Settings > Extensions 安裝（見第 3 步）。
- 反過來，`openfun-chat-plugin.zip` 也不能裝在 Settings > Extensions。

---

## 1. 準備

1. 安裝並登入 [Claude Desktop](https://claude.ai/download)（macOS 或 Windows），建議更新到最新版。
2. 取得安裝檔 `openfun-claude-extension.mcpb`（必要）與 `openfun-chat-plugin.zip`（可選），由提供者發給你或從發布頁面下載。

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
| 權限不足 | 這個資料集不是公開資料，或你的 Token 只限定部分資料集。可請 Claude 改找其他資料集。 |
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

---

Codex 的安裝、Token 設定與故障排除請看 [codex/README.md](codex/README.md)（ZIP 內也附同一份 README）。
開發者請看 [DEVELOPMENT.md](DEVELOPMENT.md)。授權：MIT（見 [LICENSE](LICENSE)）。
