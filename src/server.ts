import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenFunClient } from "./client.js";
import type { RuntimeConfig } from "./config.js";
import type { HostProfile } from "./host.js";
import { registerTools, serverInstructions } from "./tools.js";
import { VERSION } from "./version.js";

export const SERVER_NAME = "openfun-data";
export const SERVER_VERSION = VERSION;

export function createServer(config: RuntimeConfig, opts: { fetchImpl?: typeof fetch; host?: HostProfile } = {}): McpServer {
  const client = new OpenFunClient({
    baseUrl: config.baseUrl,
    token: config.token,
    tokenProblem: config.tokenProblem,
    timeoutMs: config.timeoutMs,
    fetchImpl: opts.fetchImpl,
    host: opts.host,
  });
  const server = new McpServer(
    { name: SERVER_NAME, title: "歐噴資料庫", version: SERVER_VERSION },
    { instructions: serverInstructions(client.host), capabilities: { tools: {} } },
  );
  registerTools(server, client);
  return server;
}
