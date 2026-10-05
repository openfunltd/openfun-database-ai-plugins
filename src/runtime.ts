/**
 * 啟動參數解析。Claude Desktop MCPB 不帶參數（原行為：Token 只來自 OPENFUN_API_TOKEN）。
 * Codex plugin 的 mcp.json 帶 `--host=codex`：OPENFUN_API_TOKEN 有值時優先使用，
 * 否則讀取使用者設定檔（見 credentials.ts）。
 */

import { dirname, isAbsolute, join, resolve } from "node:path";
import { type RuntimeConfig, loadConfig } from "./config.js";
import { credentialsPath, readCredentials } from "./credentials.js";
import { CLAUDE_DESKTOP_HOST, type HostProfile, codexHost } from "./host.js";

export type TokenSource = "env" | "credentials-file" | "none";

export interface ResolvedRuntime {
  config: RuntimeConfig;
  host: HostProfile;
  tokenSource: TokenSource;
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
