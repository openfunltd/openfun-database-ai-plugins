import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RuntimeConfig } from "./config.js";
import { CLAUDE_DESKTOP_HOST, type HostProfile } from "./host.js";
import { TokenSession, type TokenSource } from "./session.js";
import { registerTools, serverInstructions } from "./tools.js";
import { VERSION } from "./version.js";

export const SERVER_NAME = "openfun-data";
export const SERVER_VERSION = VERSION;

export function createServer(
  config: RuntimeConfig,
  opts: { fetchImpl?: typeof fetch; host?: HostProfile; tokenSource?: TokenSource } = {},
): McpServer {
  const host = opts.host ?? CLAUDE_DESKTOP_HOST;
  const session = new TokenSession(
    { baseUrl: config.baseUrl, host, timeoutMs: config.timeoutMs, fetchImpl: opts.fetchImpl },
    { token: config.token, tokenProblem: config.tokenProblem, source: opts.tokenSource ?? (config.token ? "env" : "none") },
  );
  const server = new McpServer(
    { name: SERVER_NAME, title: "歐噴資料庫", version: SERVER_VERSION },
    { instructions: serverInstructions(host), capabilities: { tools: {} } },
  );
  registerTools(server, session);
  return server;
}
