/**
 * 啟動參數解析。Claude Desktop MCPB 不帶參數（原行為：Token 只來自 OPENFUN_API_TOKEN）。
 * Codex plugin 的 mcp.json 帶 `--host=codex`：啟動時只使用 OPENFUN_API_TOKEN，
 * 獨立 MCP 可在設定畫面提供該環境變數；也可選擇在對話中設定（見 session.ts）。
 */

import { type RuntimeConfig, loadConfig } from "./config.js";
import { CLAUDE_DESKTOP_HOST, type HostProfile, codexHost } from "./host.js";
import type { TokenSource } from "./session.js";

export interface ResolvedRuntime {
  config: RuntimeConfig;
  host: HostProfile;
  tokenSource: Extract<TokenSource, "env" | "none">;
}

export function resolveRuntime(argv: string[], env: NodeJS.ProcessEnv): ResolvedRuntime {
  let hostKind = "claude-desktop";
  // 只解析 --host=；其他參數與原本 Claude Desktop 版相同，直接忽略
  for (const arg of argv) {
    const m = arg.match(/^--host=(.*)$/);
    if (m) hostKind = m[1];
  }
  if (hostKind !== "claude-desktop" && hostKind !== "codex") throw new Error(`不支援的 --host：${hostKind.slice(0, 40)}`);

  const config = loadConfig(env);
  return {
    config,
    host: hostKind === "codex" ? codexHost() : CLAUDE_DESKTOP_HOST,
    tokenSource: config.token ? "env" : "none",
  };
}
