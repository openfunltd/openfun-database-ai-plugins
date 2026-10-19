# 歐噴資料庫聊天指引（openfun-data-chat）

`openfun-chat-plugin.zip` 是給 Claude 的**使用指引**：教它何時使用歐噴工具、先確認欄位再查詢、附上來源與說明限制，以及如何匯出 Excel。

**真正負責連線查詢的是 `openfun-claude-extension.mcpb`。只裝 MCPB 就能查資料，這份 ZIP 是可選的補充指引，不能單獨查資料，也沒有 Token 設定欄位。**

## 下載後怎麼用

1. 保留 `openfun-chat-plugin.zip`，**不要解壓縮**。
2. 在 Claude Desktop 左側開啟 **Customize（自訂）> Plugins（外掛程式）**，按 **Add（新增）> Upload plugin（上傳外掛程式）**，上傳這份 ZIP。
3. 確認「**歐噴資料庫聊天指引**」已啟用。
4. 開新聊天，直接提問；也可以在輸入框輸入 `/`，從清單選取歐噴的 `openfun-data` 指引，再輸入問題。

ZIP 請上傳到 Plugins，不要當作聊天附件，也不要裝到 Settings > Extensions。Plugins 需 Claude 付費方案；操作依 [Claude 官方說明](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)。

## 查詢功能與 Token 設定（必要）

1. 在 Claude Desktop 的 **Settings > Extensions** 安裝 `openfun-claude-extension.mcpb`。
2. 在該擴充套件的設定中貼上歐噴 API Token（到 https://data.openfun.tw/user 建立），儲存並啟用。
3. 確認聊天輸入框「+」> Connectors 中「歐噴資料庫」已啟用。

完成後開新聊天，問：「請檢查歐噴資料庫的設定是否正常」。

完整教學：[Claude Desktop 說明](https://github.com/openfunltd/openfun-database-ai-plugins/blob/main/docs/CLAUDE_DESKTOP.md)。

授權：MIT（見 LICENSE）。
