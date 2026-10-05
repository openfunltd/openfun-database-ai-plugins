# 歐噴資料庫聊天指引（openfun-data-chat）

這是給 Claude 的**聊天指引 plugin**，告訴 Claude 怎麼用歐噴資料庫的工具查台灣公共資料、怎麼附來源與說明限制。

**這個 plugin 本身不能查資料，也不需要、不接受 Token。** 要真的查詢，必須另外：

1. 在 Claude Desktop 的 **Settings > Extensions** 安裝 `openfun-claude-extension.mcpb`；
2. 在該擴充套件的設定中貼上歐噴 API Token（到 https://data.openfun.tw/user 建立）；
3. 確認聊天輸入框「+」> Connectors 中「歐噴資料庫」已啟用。

安裝本 plugin：在 Claude 的 Customize > Plugins 上傳 `openfun-chat-plugin.zip`。

授權：MIT（見 LICENSE）。
