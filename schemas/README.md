# 官方 MCPB manifest schema（vendored）

`mcpb-manifest-v0.3.schema.json` 原樣取自官方 MCPB 規格 repo，未修改：

- 來源：https://github.com/modelcontextprotocol/mcpb/blob/257af308122753c311825523d19e8c939aeaccc5/schemas/mcpb-manifest-v0.3.schema.json
- Commit：`257af308122753c311825523d19e8c939aeaccc5`（2025-10-30，該檔最後一次變更）
- SHA-256：`3a0ac9d845711a1b9b17dfa5a52f8b60628239d6a86a9db417206a9efc78592d`
- 取得時（2026-10-05）與 `main` 分支、以及 npm `@anthropic-ai/mcpb@2.1.2` 內附的 `dist/mcpb-manifest-v0.3.schema.json` 位元組完全相同。
- 授權：MIT，Copyright 2025 Anthropic, PBC.（見 `LICENSE.mcpb`）

`scripts/validate-manifest.mjs` 會在載入時比對 SHA-256，檔案被改動就拒絕驗證。
更新時請一併更新上方 commit、SHA-256 與腳本中的 `SCHEMA_SHA256`。
