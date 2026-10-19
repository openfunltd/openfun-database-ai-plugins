# 歐噴資料庫 Claude Desktop 擴充套件

這個 .mcpb 套件讓 Claude Desktop 的一般聊天可以唯讀查詢歐噴資料庫（https://data.openfun.tw）。

- 安裝：Claude Desktop「設定 > 擴充功能（Extensions）> 進階設定（Advanced settings）> 安裝擴充功能（Install Extension…）」選擇此檔案，或直接雙擊／拖曳 .mcpb 到 Claude Desktop 視窗。
- 設定：貼上在 https://data.openfun.tw/user 建立的 API Token。
- 內容：server/index.mjs（已內嵌所有依賴，由 Claude Desktop 內建 Node.js 執行）、manifest.json、icon.png。
- 第三方授權：THIRD_PARTY_LICENSES.md；本套件授權：LICENSE。

- Excel 匯出：可說「把符合條件的全部資料匯出成 Excel，附上來源與查詢條件」。包含查詢結果、統計摘要、來源與處理說明，已設篩選及凍結標題列；統計數字會直接回傳聊天。檔案存入本機家目錄 Downloads/OpenFun（下載／OpenFun）；連結無法點開時，可直接從該資料夾開啟。每次最多 10,000 筆，核對失敗不產生完整檔；圖形介面仍待實機驗收。
