# 歐噴資料庫：Codex 桌面版

在本機聊天中搜尋、查詢台灣公共資料，並完整匯出 Excel。[v0.1.0 測試版](https://github.com/openfunltd/openfun-database-ai-plugins/releases/tag/v0.1.0)。

## 準備

需要 Node.js 18 以上（[下載](https://nodejs.org)）。到 [歐噴帳號頁](https://data.openfun.tw/user) 建立一般 API Token。

## 安裝與連線設定

1. 點左側「外掛程式」→「新增」→「新增市集」。
2. 填入以下內容，按「新增市集」：

   | 欄位 | 填入 |
   |---|---|
   | 來源 | `https://github.com/openfunltd/openfun-database-ai-plugins.git` |
   | Git 參照 | `codex-marketplace` |
   | 稀疏路徑 | 留空 |

3. 搜尋「歐噴資料庫」，點進去，按「安裝外掛程式」。
4. 開啟本機新對話，送出：

   > 請依歐噴外掛的指引，幫我完成連線設定，建立 openfun-local，保留其他設定。Token 由我自己在畫面輸入。

   如果出現「在工作中繼續」，點擊後等待設定完成。
5. 點左下角個人頭像 →「設定」→「外掛程式」→「MCP」標籤頁，點 `openfun-local` 旁的齒輪。
6. 在「環境變數」新增金鑰 `OPENFUN_API_TOKEN`，值貼上 Token；「環境變數透傳」留空，按「儲存」。
7. 開新對話，送出：「請檢查歐噴資料庫的設定是否正常」。

Token 存在本機設定，沒有加密；不要分享含 Token 的設定檔或截圖。

## 更新或移除 Token

回到「設定」→「外掛程式」→「MCP」→ `openfun-local`，修改環境變數的值，或刪除 `OPENFUN_API_TOKEN` 項目並儲存。更新後開新對話，問：「請檢查歐噴資料庫的設定是否正常」。

## 完整匯出 Excel

> 請把符合條件的全部資料匯出成 Excel，附上來源與查詢條件。

檔案存到執行外掛電腦之家目錄 **Downloads/OpenFun（下載／OpenFun）**，包含「查詢結果」「統計摘要」「來源與處理說明」三個工作表，已設篩選與凍結標題列。每次最多 10,000 筆；超限或核對不一致會停止。聊天連結無法點開時，直接從下載資料夾開啟。

## 選用：在對話中使用短效 Token

也可以對 Codex 說「我要在對話中設定歐噴 Token」。它會提示：

> 請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。

Token 只保留在執行中程式的記憶體，重新啟動後需要重新貼上；其他對話可能共用。對 Codex 說「清除歐噴 Token」只清除記憶體，不會刪除環境變數或聊天紀錄，也不會撤銷 Token。要讓 Token 失效，請到歐噴撤銷。

## 找不到工具時

在本機對話送出：

> 請檢查目前對話的實際工具目錄，尋找並呼叫 openfun_check_config。不要用 plugin_management 查公開外掛目錄。若沒有工具，請依歐噴外掛的指引幫我完成 openfun-local 連線設定，保留其他設定；Token 由我自己在畫面輸入。

完成後開新對話，送出：「請檢查歐噴資料庫的設定是否正常」。

## 選用：終端機安裝

安裝後依上方第 4～7 步完成連線與 Token 設定。

### Unix（macOS／Linux）

```bash
codex plugin marketplace add https://github.com/openfunltd/openfun-database-ai-plugins.git --ref codex-marketplace
codex plugin add openfun-data@openfun
```

### Windows（PowerShell）

```powershell
codex plugin marketplace add https://github.com/openfunltd/openfun-database-ai-plugins.git --ref codex-marketplace
codex plugin add openfun-data@openfun
```

## 解除安裝

在「外掛程式」移除歐噴資料庫，並到「MCP」標籤頁移除 `openfun-local`；Token 到歐噴帳號頁撤銷。
