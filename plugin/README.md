# 歐噴資料庫聊天指引（openfun-data-chat）

`openfun-chat-plugin.zip` 是給 Claude 的**使用指引**：教它何時使用歐噴工具、先確認欄位再查詢、附上來源與說明限制，以及如何匯出 Excel。

**實際查詢需要另外設定連線：網頁版使用遠端連接器，桌面版可安裝 `openfun-claude-extension.mcpb`。這份外掛不能單獨查資料，也沒有 Token 設定欄位。**

## 從 GitHub 市集安裝（不用上傳檔案）

1. 在 Claude 開啟 **Customize > Plugins > Add > Add marketplace**。
2. 輸入 `https://github.com/openfunltd/openfun-database-ai-plugins.git`，按 **Sync**。
3. 安裝並啟用「**歐噴資料庫聊天指引**」。

網頁版接著依 [Claude 網頁版說明](https://github.com/openfunltd/openfun-database-ai-plugins/blob/main/docs/CLAUDE_WEB.md) 設定查詢連線。現有遠端入口需要在連接器的 Request headers 設定 Token；此欄位尚未對所有帳號開放。網頁遠端入口的工具較少，沒有桌面版的完整 Excel 批次匯出。桌面版依下方步驟設定。

## 如果你是在「技能（Skills）」上傳

請改下載 [openfun-chat-skill.zip](https://github.com/openfunltd/openfun-database-ai-plugins/releases/download/v0.1.0/openfun-chat-skill.zip)，在 **Customize > Skills >「+」> Create skill > Upload a skill** 上傳。不要解壓縮。Skill 與這份 Plugin 使用同一份指引，擇一即可。

若看到「A skill cannot contain a plugin manifest」或 `SKILL.md` 層級錯誤，表示把 Plugin 傳到了技能入口，請換成上面的 Skill ZIP。

## 在「外掛程式（Plugins）」上傳

1. 保留 `openfun-chat-plugin.zip`，**不要解壓縮**。
2. 在 Claude Desktop 左側開啟 **Customize（自訂）> Plugins（外掛程式）**，按 **Add（新增）> Upload plugin（上傳外掛程式）**，上傳這份 ZIP。
3. 確認「**歐噴資料庫聊天指引**」已啟用。
4. 開新聊天，直接提問；也可以在輸入框輸入 `/`，從清單選取歐噴的 `openfun-data` 指引，再輸入問題。

這份 Plugin ZIP 只能上傳到 Plugins，不能上傳到 Skills，不要當作聊天附件，也不要裝到 Settings > Extensions。Plugins 需 Claude 付費方案；操作依 [Claude 官方說明](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)。

## 查詢功能與 Token 設定（必要）

1. 在 Claude Desktop 的 **Settings > Extensions** 安裝 `openfun-claude-extension.mcpb`。
2. 在該擴充套件的設定中貼上歐噴 API Token（到 https://data.openfun.tw/user 建立），儲存並啟用。
3. 確認聊天輸入框「+」> Connectors 中「歐噴資料庫」已啟用。

完成後開新聊天，問：「請檢查歐噴資料庫的設定是否正常」。

完整教學：[Claude Desktop 說明](https://github.com/openfunltd/openfun-database-ai-plugins/blob/main/docs/CLAUDE_DESKTOP.md)。

授權：MIT（見 LICENSE）。
