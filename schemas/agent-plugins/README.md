# Agent Plugins 1.0.0 schema（vendored）

`plugin.schema.json`、`mcp.schema.json` 原樣取自 Agent Plugins 規格 repo，未修改：

- 來源：https://github.com/agentplugins/agent-plugins-spec/tree/ff8ab5e392cc87bd88d87c060815a87490e51003/schemas/1.0.0
- Commit：`ff8ab5e392cc87bd88d87c060815a87490e51003`（取得日 2026-10-05）
- 與 `https://agent-plugins.org/schemas/1.0.0/{plugin,mcp}.schema.json` 線上版本位元組相同
- SHA-256：
  - `plugin.schema.json`：`0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883`
  - `mcp.schema.json`：`6539175bfcdf43085855183e86da40ea94b166547a72b47ae9a0a390516d3acb`
- 授權：schema 屬 software material，採 Apache License 2.0（見 `LICENSE.md`、`Apache-2.0.txt`）

`scripts/validate-codex-plugin.mjs` 載入時比對 SHA-256，檔案被改動就拒絕驗證。
JSON schema 只涵蓋結構；Codex 對 stdio `command`／`cwd` 的額外規則（裸指令名或 `./` 開頭、cwd 需在 plugin 內）
依 Codex 0.159.3 原始碼 `codex-rs/codex-mcp/src/agent_plugin_config.rs` 另外檢查。
