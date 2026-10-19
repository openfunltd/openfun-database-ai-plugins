# 開發說明

## 架構選擇

官方 `mcp-server-dev` skill 建議：只呼叫雲端 API 的服務優先做 remote MCP server。
本專案仍選擇 **MCPB（本機 stdio 擴充套件）**，原因是交付需求：

- 對象是只用 Claude Desktop 一般 Chat 的非工程師，要「開一個安裝檔、貼 Token」就能用；
- 不修改歐噴後端，也不依賴現有 `/mcp`（`guide` 回 500、`search` 未轉送 Token、
  PHP `http_build_query` 把 `{"金額>=":100}` 編成 `金額>==100`、陣列變成 `a[0]=` 等問題）；
- Token 由 Claude Desktop 以 `sensitive: true` 存入 OS 憑證儲存區，不放在 URL。

之後若歐噴提供支援 OAuth 的 remote MCP，網頁版與手機版 Claude 也能使用，屆時可再評估。

## 交付物

| 產物 | 來源 | 指令 |
|---|---|---|
| `dist/openfun-claude-extension.mcpb` | `manifest.json`、`src/` | `npm run pack:mcpb` |
| `dist/openfun-chat-skill.zip` | 與 plugin 共用 `plugin/skills/openfun-data/SKILL.md`；單一 `openfun-data/` 根資料夾，只有 SKILL.md 與 LICENSE | `npm run pack:skill` |
| `dist/openfun-chat-plugin.zip` | `plugin/`（`.claude-plugin/plugin.json`、`skills/openfun-data/SKILL.md`、README、LICENSE） | `npm run pack:plugin` |
| `dist/openfun-codex-plugin.zip` | `codex/`（plugin.json、mcp.json、marketplace、skill、README）＋ 打包的 `server/index.mjs` | `npm run pack:codex` |

`npm run pack:claude` 產生 Claude 的 MCPB 與聊天指引，`npm run pack:codex` 產生 Codex plugin；`npm run pack` 四份都產生。companion plugin 只含 skill：官方說明 plugin 的本機 MCP server 只在 Cowork 與
Claude Code 執行、不在 chat，所以不在 plugin.json 宣告 `mcpServers`／`userConfig`，也不把 `.mcpb` 內嵌進 ZIP。
`scripts/pack-plugin.mjs` 用 fflate 只封裝 allowlist 檔案，ZIP 根目錄即 plugin 根目錄，時間戳固定可重現；
plugin.json 版本必須與 `package.json` 相同。`npm run validate:plugin` 執行 `claude plugin validate --strict plugin`
（需要 Claude Code CLI）。注意：目前 CLI（2.1.289）只驗證 plugin.json，不檢查 SKILL.md 內容，
skill frontmatter 由 `test/plugin.test.mjs` 檢查。

## 需求

- Node.js 18 以上（開發環境實測 v22.22.1、npm 10.9.4）
- Linux 只用來開發測試；Claude Desktop 支援 macOS、Windows
- Codex 測試需要 `codex` CLI（實測 0.159.3）；找不到時相關測試會標示 skip

## 指令

```bash
npm ci              # 依 package-lock.json 安裝
npm run build       # tsc 型別檢查與編譯到 build/lib，esbuild 打包到 build/bundle/server/index.mjs
npm run validate    # 以 vendored 官方 schema v0.3 驗證 manifest.json（離線）
npm run validate:codex  # 驗證 build/codex-plugin（vendored Agent Plugins schema + Codex 規則）
npm run pack        # 產生四份產物
npm test            # pack 四份產物後執行全部測試（含解壓 .mcpb 的 stdio 測試、plugin ZIP 檢查與 Codex 隔離安裝測試）
npm run test:unit   # 只跑單元與工具測試（需先 build）
npm run icon        # 重新產生 icon.png
```

## 目錄

```
manifest.json          MCPB manifest（v0.3，user_config 只有 api_token）
src/index.ts           stdio 進入點
src/server.ts          McpServer 與 instructions
src/tools.ts           9 個唯讀查詢、3 個 Excel 匯出工具；Codex 另註冊 2 個 Token 工具
src/export.ts          背景分頁匯出、完整性檢查與本機檔案交付
src/xlsx.ts            固定格式 OOXML 工作簿產生器
src/export-summary.ts  完整結果的十進位精確合計與六位小數平均
src/session.ts         執行中的 Token 狀態：每次工具呼叫取一份不可變快照（client＋schema 快取），對話 Token 的驗證、取代與清除
src/client.ts          REST 客戶端：固定路徑、Bearer header、不跟隨 redirect、逾時與大小上限、錯誤分類
src/query.ts           查詢字串序列化（對應後端 TinyDB::parseQueryString）
src/schema.ts          meta.schema 解析
src/config.ts          環境變數與開發覆寫
src/host.ts            宿主提示文字（預設 Claude Desktop；Codex 獨立 MCP 建議畫面環境變數，對話 Token 為選用）
src/runtime.ts         啟動參數（--host=codex）與 Token 來源解析
codex/                 Codex plugin 靜態檔案
scripts/validate-codex-plugin.mjs  Codex plugin 驗證
scripts/pack-codex.mjs Codex plugin 打包（allowlist）
scripts/build.mjs      esbuild 打包、收集第三方授權、建立 build/bundle
scripts/pack.mjs       驗證 build/bundle 的 manifest 與 entry_point，用 fflate 打包 .mcpb
scripts/validate-manifest.mjs  manifest 驗證（官方 JSON schema + icon / entry_point 檢查）
schemas/               vendored 官方 mcpb-manifest-v0.3.schema.json（固定 commit、SHA-256、MIT 授權）
schemas/agent-plugins/ vendored Agent Plugins 1.0.0 plugin／mcp schema（固定 commit、SHA-256、Apache-2.0）
test/                  node:test 測試與本機 mock API
```

## API 對應（依後端原始碼，非猜測）

| 工具 | REST | 認證 |
|---|---|---|
| openfun_guide | `GET /llms.txt` | 不送 |
| openfun_check_config | `GET /api/v1/me` | 必要 |
| openfun_search | `GET /api/v1/search?q=&per_dataset=&max_datasets=` | 有就送（可看到授權的非公開資料集） |
| openfun_list_datasets | `GET /api/v1/datasets?q=` 或 `?category=` | 必要 |
| openfun_get_dataset | `GET /api/v1/datasets/{slug}`，schema 在 `meta.schema`，引用文字在頂層 `citation`，來源在 `meta.sources` | 必要 |
| openfun_get_skill | `GET /datasets/{slug}/skill.md`（text/plain，非公開資料集需 Token） | 有就送 |
| openfun_query_records | `GET /api/v1/datasets/{slug}/records` | 必要 |
| openfun_get_record | `GET /api/v1/datasets/{slug}/records/{id}` | 必要 |
| openfun_aggregate | `GET /api/v1/datasets/{slug}/agg` | 必要 |

序列化規則：
- 精確比對 `欄位=值`，多值用重複 key；`q[欄位]=值`；範圍 `欄位%3E=值`（後端先 urldecode 整段再比對 `>= <= > <`）；
  排序 `sort=欄位>`（降冪）／`sort=欄位<`（升冪）。用 `encodeURIComponent`，不用 `URLSearchParams`（空白會變 `+`）。
- 後端 `q` 與範圍值以 `substr(…, 0, 200)` 位元組截斷，工具會在超過時直接報錯。
- `q` 與 `q[欄位]` 不能並用（後端會覆蓋）。
- `/records` 對未知欄位只回 warning，範圍條件的未知欄位則默默忽略；`/agg` 只接受頂層、非 text 欄位的精確篩選，
  不支援 `q` 與範圍。因此工具會先讀 `meta.schema` 在本機驗證，避免得到被忽略條件的錯誤結果。
- `/agg` 的 `group_by` 必填，`field` 選填；只提供 `field` 並不能取得全域數值統計。
  此契約由 `DatasetController.php` 產生的 API 文件與 TinyDB `DatasetsController::aggAction()` 確認，
  工具會在送出請求前拒絕缺少 `group_by` 的輸入。
- `fields` 參數後端目前不會轉送，所以工具在本機做欄位投影並明示。

## 回應大小與結構驗證

- `src/format.ts` 的 `ok()` 對每個成功回應的所有 text content 總長（遮蔽 Token 後，含 summary、來源、
  外部內容標記與排版後 JSON）強制 `MAX_TOOL_TEXT_CHARS = 60000` 上限；超過時丟 `too_large`，由工具外層回
  `isError: true` 與各工具專屬的縮小建議。不會把 JSON 截成半段。
- `openfun_query_records` 以 `fitItems()` 用實際輸出大小二分搜尋能完整放入的最多記錄數，其餘標為 omitted；
  放不下時會先試「超長文字欄位縮短並標示原長度」的版本。第一筆就放不下時回 `isError`，附 fields／per_page 建議與網頁來源。
- 其他工具（search、list、dataset、record、aggregate、skill、guide）過大時一律 `isError`；guide 的 llms.txt
  為純文字，依剩餘空間截斷並標示。
- `src/contracts.ts` 驗證各端點 HTTP 200 回應的結構（依 ApiController 的實際輸出）；HTTP 200 但含 `error`
  key 時，已知錯誤碼依語意分類（Token、權限、額度等），其他視為 `invalid_response`。
- Token 最短 20 字元（後端產生的格式為 `ofk_` + 64 hex，共 68 字元），過短視為設定錯誤；任何非空 Token 都會被遮蔽。

## 驗證與打包工具（不使用官方 mcpb CLI）

使用者安裝與執行都不需要任何 CLI；開發端原本只用 `mcpb validate`／`pack`／`info`／`unpack`，已改為：

| 用途 | 實作 | 依賴 |
|---|---|---|
| manifest 驗證 | `scripts/validate-manifest.mjs`：vendored 官方 JSON schema（draft-07，`additionalProperties: false`）以 Ajv strict 模式驗證，加上與官方 CLI 相同的 icon 檢查（相對路徑、不可 `${__dirname}`、存在、PNG），另要求 `manifest_version` 為 `0.3`、遠端 icon 視為錯誤，打包時檢查 `entry_point` 存在 | `ajv`、`ajv-formats`（devDependency；MCP SDK 本來就依賴同版本） |
| 打包 .mcpb | `scripts/pack.mjs`：與官方 CLI 相同用 fflate、level 9、保存 Unix 權限；檔案排序、時間戳固定 | `fflate` |
| 解壓測試 | `test/helpers/unzip.mjs`：拒絕不安全路徑並套用權限 | `fflate` |

移除 CLI 前曾用 15 組 manifest（1 組合法、14 組非法）比對 `mcpb validate` 與新驗證器，判定全部一致；
`test/manifest.test.mjs` 保留這些非法案例作為回歸測試。官方 CLI 內部是用 Zod schema 驗證，
其 JSON schema 由同一份 Zod 定義產生，因此官方之後若只改 Zod 而未更新 JSON schema，兩者可能出現差異。
更新 schema 的步驟見 `schemas/README.md`。

## 開發用環境變數（不在 manifest、一般使用者看不到）

| 變數 | 用途 |
|---|---|
| `OPENFUN_API_TOKEN` | Token（Claude Desktop 由 `${user_config.api_token}` 注入） |
| `OPENFUN_DEV_BASE_URL` | 指向本機 mock，只接受 `127.0.0.1`／`localhost`／`[::1]`，其他值會拒絕啟動 |
| `OPENFUN_DEV_TIMEOUT_MS` | 逾時毫秒數（50～120000，預設 20000） |

手動測試：

```bash
npm run build
OPENFUN_API_TOKEN=xxx npx @modelcontextprotocol/inspector node build/bundle/server/index.mjs
```

功能測試請用本機 mock（`test/helpers/mock-api.mjs`）與假 Token，不要對正式站做測試。

## Codex plugin

### 對話工具驗證

`test/codex-model-tools.test.mjs` 以實際 Codex app-server、隔離的家目錄與本機模擬模型，從打包 ZIP
啟動選取的外掛，送出對話並執行 `functions.exec`：確認 `ALL_TOOLS` 有 14 個歐噴工具，再實際呼叫
`openfun_check_config`。不使用真實模型、帳號或 Token。

測試也驗證兩種限制：`features.code_mode.excluded_tool_namespaces` 排除歐噴 namespace 時，
MCP 工具清單仍有 11 個，對話的 `ALL_TOOLS` 卻是 0；plugin 的 `enabled_tools = []` 則讓兩者都為 0。
因此 MCP 的 `ready` 日誌或獨立工具呼叫成功，不能取代出問題對話的工具清單驗證。
這些是可重現的設定案例，**尚未確認是 Mac 桌面版回報的原因**，也不能以 Linux 測試取代 Mac 實機驗收。
設定意義見 [OpenAI 官方設定參考](https://learn.chatgpt.com/docs/config-file/config-reference)。

目前使用者安裝流程將 `openfun-local` 列為必要的連線設定，測試也驗證此載入路徑：保留外掛，將其 `server/index.mjs` 與授權檔複製到獨立資料夾，
以 `[mcp_servers.openfun-local]` 啟動同一支程式（`--host=codex`），並只停用外掛附帶的 MCP。
實際對話仍能取得 14 個工具並呼叫設定檢查，不會同時暴露兩組歐噴工具。此路徑符合
[官方本機 MCP 設定方式](https://learn.chatgpt.com/docs/extend/mcp)，可用來區分外掛 MCP 與獨立 MCP 的載入差異；
使用者已於 2026-10-06 在 macOS 15.7.7（24G720）、Codex 26.930.51102 回報此本機連線方式成功：
`openfun-local` 可呼叫，`openfun_check_config` 回報 Token 有效，並完成「開放文化基金會」的搜尋與記錄查詢，
沒有重新設定 Token。此為該環境的使用者實測回報；外掛附帶 MCP 的載入根因、ZIP 上傳失敗及 Windows 實機驗收仍待確認。

### 格式與 Codex 的解析規則（依 Codex 0.159.3 原始碼與實測）

採官方建議的 portable 格式：根目錄 `plugin.json`（`$schema` 為 Agent Plugins 1.0.0，Codex 專屬介面設定放在
`extensions.com.openai.interface`）、根目錄 `mcp.json`、`skills/`。
打包時另由同一份設定產生 `.codex-plugin/plugin.json`、`.claude-plugin/plugin.json` 與 `.mcp.json` 相容入口；不另外維護重複設定。
Codex 0.159.3 的 executor capability discovery 只搜尋 `.codex-plugin/` 等入口，因此只有 portable 入口時
能找到技能，卻找不到 plugin 與 MCP 設定。相容入口的 args 使用 `./server/index.mjs`，cwd 使用 `.`，
由 Codex 解析成 plugin 根目錄；不使用 legacy loader 不展開的 placeholder。

Codex 解析 portable `mcp.json` stdio server 的方式（`codex-rs/codex-mcp/src/agent_plugin_config.rs`，tag `rust-v0.159.3`）：

- `type` 必填；欄位未知即拒絕。`command` 只接受裸指令名（以 PATH 尋找，例如 `node`）或 `./` 開頭的 plugin 內路徑。
- `args`、`env` 中的 `${PLUGIN_ROOT}`／`${PLUGIN_DATA}` 會展開為絕對路徑；`cwd` 預設 `${PLUGIN_ROOT}`，必須在 plugin 內。
- Codex 會在 env 加入 `PLUGIN_ROOT`、`PLUGIN_DATA`；其餘只傳白名單系統變數（`codex-rs/rmcp-client/src/utils.rs`：
  POSIX 為 HOME、LOGNAME、PATH、SHELL、USER、LANG、LC_ALL、TERM、TMPDIR、TZ 等；Windows 含 APPDATA、USERPROFILE 等），
  **不包含** `XDG_CONFIG_HOME` 與 `OPENFUN_API_TOKEN`。plugin 範圍的 MCP 設定也沒有放行環境變數的欄位。

實測（`test/codex.test.mjs`）：解壓到含中文與空白的路徑後執行 `codex plugin marketplace add <dir>`、
`codex plugin add openfun-data@openfun`，Codex 把 plugin 複製到 `CODEX_HOME/plugins/cache/openfun/openfun-data/<版本>/`；
app-server 啟動的程序為 `node <快取>/server/index.mjs --host=codex`，cwd 與 `PLUGIN_ROOT` 都是快取路徑，
env 只有 HOME、PATH、PLUGIN_ROOT、PLUGIN_DATA。marketplace 的 `source.path` 為 `./`（Codex 允許 marketplace 根目錄即 plugin）。

`test/codex-compat.test.mjs` 使用真正的 `codex exec-server` 驗證探索入口前後差異，並在隔離環境移除 portable 入口，
驗證相容入口能安裝、啟動 MCP、提供 14 個工具與呼叫 `openfun_check_config`。兩種入口同時存在時只啟動一個 server、
技能只載入一次。這些測試使用 Codex CLI 0.159.3，不代表舊版本或桌面 app 畫面已驗收。

### Token

獨立本機 MCP 由使用者本人在設定畫面的「環境變數」輸入 `OPENFUN_API_TOKEN`，不需要終端機或聊天 Token。
值存入 Codex 本機設定，未加密；程式啟動時只讀取此環境變數，AI 不讀取或轉寫這個值。
沒有環境變數時回報尚未設定，不讀取 `credentials.json`；安裝包不含舊 Token 設定程式。
`test/runtime.test.mjs` 及實際 Codex 對話測試驗證：即使保留合法舊 Token 檔也不載入，
MCP env Token 可以通過設定檢查且不回顯；全部使用隔離家目錄、本機模擬 API 與假 Token。

選用的對話設定（只有 `--host=codex` 時註冊，Claude Desktop 為 12 個工具並沿用 user_config）：

- `openfun_set_token`：使用者明確選擇對話方式或主動貼出 Token 時由 Codex 呼叫。先用 `checkToken` 檢查格式，再以候選 Token 呼叫固定的
  `GET /api/v1/me`（同一個 client：固定 base URL、不跟隨 redirect）；成功才取代，失敗保留原狀態（含 schema 快取）。
  輸出遮蔽新舊 Token；不寫檔、不寫 log。無法從 opaque Token 判斷期限，所以不宣稱「已驗證為短效」。
- `openfun_clear_token`：把本程序狀態設為 `cleared`；之後不改用環境變數；不刪除 Codex MCP 設定，重新啟動後可再次載入環境變數。
  持久設定由使用者本人在 MCP 畫面刪除 `OPENFUN_API_TOKEN`，並重新啟動。
- 兩者都不是 readOnly；查詢工具仍為 readOnly。設定與清除依呼叫順序序列化執行。
- `src/session.ts`：每次工具呼叫開始時取一份快照，header、schema 快取與輸出遮蔽都用同一個 Token；
  Token 取代時建立新快照（新的快取），進行中的舊呼叫仍以自己的舊 Token 遮蔽。
- 對話 Token 只在 MCP server 程序記憶體。宿主可能讓多個對話共用同一個 MCP server，所以文件不宣稱「只限這段聊天」。
  Token 會留在 Codex 的對話與工具呼叫紀錄中，這是選擇此方式時已告知使用者的風險。

### 測試方式與限制

- 所有 Codex CLI 都在子程序中以暫存 `CODEX_HOME`、`HOME` 執行，並檢查真實 `~/.codex/config.toml` 未變動。
  不送出對話 turn，不需要 API Key。
- 透過 Codex app-server 的 `mcpServerStatus/list`、`thread/start`、`mcpServer/tool/call` 讓 Codex 自己啟動並呼叫 server；
  確認列出 14 個工具，只呼叫不需要網路的情境（未設定、權限過寬、Token 不合法、格式錯誤的 `openfun_set_token`、`openfun_clear_token`）。
- 有合法格式 Token 時，不經 Codex 呼叫會連網的工具（避免打正式站），改從 `/proc` 讀取 Codex 實際啟動的
  argv／cwd／env，原樣重跑並只加上指向本機 mock 的 `OPENFUN_DEV_BASE_URL`。此部分只在 Linux 執行。
- `test/chat-token.test.mjs`：對話 Token 的設定／拒絕／清除／快取／並行遮蔽，以及打包後 server 的原始 stdout／stderr 與檔案系統檢查；
  只連本機 mock，使用假 Token。
- `test/codex-validate.test.mjs` 另以一個案例確認 Codex 本身也拒絕載入絕對路徑的 command，與本專案驗證器一致。

## 發版與打包注意事項

- 版本號需同步：`package.json`、`manifest.json`、`src/version.ts`、`plugin/.claude-plugin/plugin.json`、`codex/plugin.json`（測試會檢查）。
- `server/index.mjs` 內嵌所有執行期依賴（MCP SDK、zod、ajv 等），安裝包內沒有 `node_modules`；
  第三方授權由 build 自動收集到安裝包內的 `THIRD_PARTY_LICENSES.md`。
- 安裝包**未簽章**，本專案也**不提供簽章功能**（Claude Desktop 可安裝未簽章的 .mcpb）。
  官方 `@anthropic-ai/mcpb` CLI 的簽章依賴 node-forge，最新版 1.4.0 仍有未修補的 GHSA-86w9-cpqp-85rv，
  因此已移除該 CLI。日後若需要簽章，請在上游修補後再評估，並在獨立環境進行，不要放回本專案依賴。
- 授權暫定 MIT（`LICENSE`、`manifest.json`、`package.json`），對外發布前請確認。
- manifest 使用 v0.3（官方 `mcpb-manifest-latest.schema.json` 指向 v0.3；v0.4 主要新增 `uv` Python 類型）。

### 桌面版封存檔入口與驗證界線

ZIP 根目錄含 `.claude-plugin/plugin.json`，對應桌面版曾回報「archive must contain .claude-plugin/plugin.json or top-level SKILL.md」的匯入器格式。此檔案從同一份 portable manifest 產生，移除 Codex 專用 interface，仍宣告 `skills` 與 `.mcp.json`；不建立第二套 MCP。

`test/codex-compat.test.mjs` 另移除 portable／Codex manifest，實際透過 app-server 的 `marketplace/add`、`plugin/install` 安裝此入口，確認 14 個工具與 `openfun_check_config` 可呼叫。這驗證本機市集與 MCP 後端，不代表已操作桌面版 ZIP 上傳 UI。使用者文件只提供 GitHub 市集安裝步驟；ZIP 保留供打包、測試及更新連線程式使用。

### 發布 GitHub 市集

`npm run publish:codex-marketplace` 先由共用原始碼打包，再把 ZIP 的完整內容發布到 `codex-marketplace` 分支；`main` 保留原始碼，不把安裝包編譯產物混入。腳本要求原始碼已提交，驗證 plugin 後才推送，發布 commit 記錄來源 SHA。此指令供維護者使用，使用者只需在桌面版新增 GitHub 市集並指定此分支。

Codex ZIP entry 固定標記為 Unix 一般檔案 `0100644`，不只存權限位元。`test/codex.test.mjs` 使用 Python 標準 ZIP reader 獨立檢查檔案類型與完整性；尚不能據此判定已解決桌面版的一般上傳錯誤。


## 背景 Excel 匯出

`src/export.ts` 沿用 `TokenSession` 的快照與既有 GET client，提供 `openfun_export_excel`、`openfun_export_status`、`openfun_cancel_export`。開始與取消的 `readOnlyHint=false`，因為有本機檔案／工作狀態副作用；資料庫仍只使用 GET。Claude 現有 9 個查詢工具加 3 個匯出工具；Codex 另加 2 個 Token 工具，共 14 個。工作先回 ID，再由短輪詢取得進度，避免一次工具呼叫等待所有分頁。

資料使用唯一識別欄位排序、每頁 100 筆循序擷取；每次核對 total、page、per_page、應有頁面筆數與唯一 ID，結束時再核對第一筆、總數、schema 與 last_updated_at。要求的輸出排序在本機完成，避免分頁排序同值不穩定及 API 排序方向差異影響輸出。這些核對不是資料庫強一致性快照；同筆數且未更新 metadata 的併行變動仍無法完全排除，檔案有明確說明。

每次上限 10000 筆、200 欄、32 MiB 已選欄位 JSON；工作不會為繞過 API 上限而自動拆分條件。network／timeout／server_error 最多重試同頁 2 次；429／額度／權限／驗證錯誤不自動重試。失敗或取消不輸出部分 Excel。Token 改變或清除後不再取新頁，舊工作狀態與資源不可由新 Token 讀取；工作歷史只存在本程序記憶體，重啟需重做。最多一項進行中工作、保留 20 項記憶體歷史。

`src/xlsx.ts` 只產生OOXML 工作簿（查詢結果、統計摘要、來源與處理說明），使用既有 `fflate` 0.8.3（改列 production dependency 並內嵌授權），沒有新增通用試算表套件。`src/export-summary.ts` 以 BigInt 進行精確十進位加總，平均四捨五入至六位；支援最多 20 個單值數值欄位，數值精度超過 1000 位時報錯，不回傳被靜默取整的統計。完成狀態含三工作表、篩選／凍結及摘要數字，聊天不需讀取本機檔案即可回答。inlineStr 保留識別碼、日期與公式樣式文字，schema 數值欄保留數字；超出 Excel 精度時以文字保存。非法／過長儲存格會停止，不靜默截斷。數字在 JS 已不安全時拒絕匯出，不宣稱可還原 API 已失去的精度。

檔案由本機 server 寫到家目錄 Downloads/OpenFun，獨立隨機名稱、目錄 0700／檔案 0600，不接受任意輸出路徑；臨時檔以 exclusive 建立，完成後用 hard link 發布避免覆寫，並清理臨時檔。資源連結為 file URI；resources/read 只允許目前 Token、本程序完成的確切檔案，核對大小與 SHA-256、拒絕 symbolic link，不能讀任意路徑。此資源是本機檔案，不能假裝為雲端附件或公開下載網址。

`test/export.test.mjs` 使用 9224 筆／93 頁 mock 資料，獨立 Python ZIP/XML reader 核對完整順序、識別碼與三工作表，測試重試、缺頁、重複、總數漂移、超限、取消、Token 清除與公式樣式字串。`test/export-host.test.mjs` 實際啟動兩份打包程式，驗證本機交付與 resources/read；另以真實 Codex app-server 呼叫工具，確認完成路徑與 resource_link。全部使用隔離家目錄及假 Token。這不等於已操作 macOS／Windows GUI；點擊檔案連結的實機驗收仍待完成，本機下載資料夾為保底交付。

## Claude 技能上傳格式

`npm run pack:skill` 產生 `dist/openfun-chat-skill.zip`，直接重用 Claude plugin 的 SKILL.md，不另存一份指引。ZIP 只包含 `openfun-data/SKILL.md`、`openfun-data/LICENSE`；符合單一頂層資料夾、SKILL.md 位於該資料夾直下、不含 `.claude-plugin/plugin.json` 的 Skills 上傳格式。保留原 Plugin ZIP 供 Plugins 上傳，兩種格式不可混用。依據：[官方結構](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)、[上傳入口](https://support.claude.com/en/articles/12512180-use-skills-in-claude)。

`test/skill-package.test.mjs` 重現使用者回報的三項格式限制，以獨立 Python ZIP reader 檢查，另驗證與 plugin 共用原文、無憑證及打包可重現。這些是結構檢查，不宣稱已操作 Claude Desktop 的上傳畫面。

## 排序方向契約

2026-10-19 核對 `openfunltd/openfun-tinydb` 最新 `controllers/DatasetsController.php`（blob `a451bddec65a0b80d6f9e57eaae157c4b8ffb44d`）第 555–565 行：尾碼 `>` 對應 desc、`<` 對應 asc。當天公開 `/api-docs.md` 的方向說明相反，因此不能依該說明建立序列化預期。外掛對外參數仍為 `asc`（由小到大）、`desc`（由大到小），只在 HTTP 邊界轉成後端語法。範圍篩選的大小比較運算子不受影響。

`test/tools.test.mjs` 使用依此後端契約實作的模擬排序，先排序完整資料再分頁，核對升／降冪的第一頁與後續頁面。`test/export.test.mjs` 核對最終 Excel 的升／降冪，並使用識別碼順序與金額順序不同的多頁資料，確認匯出會在收齊後依使用者排序。這些測試未使用正式 Token，不等於已用正式資料重跑 9,224 筆查詢。
