/**
 * 啟動參數解析。Claude Desktop MCPB 不帶參數（原行為：Token 只來自 OPENFUN_API_TOKEN）。
 * Codex plugin 的 mcp.json 帶 `--host=codex`：啟動時 OPENFUN_API_TOKEN 有值時優先使用，
 * 獨立 MCP 可在設定畫面提供該環境變數；否則讀取使用者以 setup.mjs 儲存的本機設定檔（見 credentials.ts）；也可選擇在對話中設定（見 session.ts）。
 */

import { dirname, isAbsolute, join, resolve } from "node:path";
import { type RuntimeConfig, loadConfig } from "./config.js";
import { credentialsPath, readCredentials } from "./credentials.js";
import { CLAUDE_DESKTOP_HOST, type HostProfile, codexHost } from "./host.js";
import type { TokenSource } from "./session.js";

export interface ResolvedRuntime {
  config: RuntimeConfig;
  host: HostProfile;
  tokenSource: Extract<TokenSource, "env" | "credentials-file" | "none">;
}

export function resolveRuntime(argv: string[], env: NodeJS.ProcessEnv, scriptPath: string): ResolvedRuntime {
  let hostKind = "claude-desktop";
  // 只解析 --host=；其他參數與原本 Claude Desktop 版相同，直接忽略
  for (const arg of argv) {
    const m = arg.match(/^--host=(.*)$/);
    if (m) hostKind = m[1];
  }
  if (hostKind !== "claude-desktop" && hostKind !== "codex") throw new Error(`不支援的 --host：${hostKind.slice(0, 40)}`);

  const config = loadConfig(env);
  const hasEnvToken = typeof env.OPENFUN_API_TOKEN === "string" && env.OPENFUN_API_TOKEN.trim() !== "";
  if (hostKind === "claude-desktop") {
    return { config, host: CLAUDE_DESKTOP_HOST, tokenSource: config.token ? "env" : "none" };
  }

  // Codex 會在環境變數中提供 PLUGIN_ROOT（安裝後的快取路徑）；否則依 server/index.mjs 位置推算
  const root = env.PLUGIN_ROOT && isAbsolute(env.PLUGIN_ROOT) ? env.PLUGIN_ROOT : resolve(dirname(scriptPath), "..");
  const host = codexHost(join(root, "setup.mjs"));
  if (hasEnvToken) return { config, host, tokenSource: config.token ? "env" : "none" };
  const file = readCredentials(credentialsPath(env));
  return {
    config: { ...config, token: file.token, tokenProblem: file.problem },
    host,
    tokenSource: file.token ? "credentials-file" : "none",
  };
}
