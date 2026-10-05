import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveRuntime } from "./runtime.js";
import { createServer } from "./server.js";

// stdout 是 MCP 通道；所有診斷訊息只寫 stderr，且不含 Token。
async function main(): Promise<void> {
  let runtime;
  try {
    runtime = resolveRuntime(process.argv.slice(2), process.env, process.argv[1] ?? "");
  } catch (err) {
    process.stderr.write(`[openfun] 設定錯誤：${(err as Error).message}\n`);
    process.exit(1);
  }
  const { config, host, tokenSource } = runtime;
  const server = createServer(config, { host });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[openfun] 已啟動（服務：${config.baseUrl}${config.isDevOverride ? "，開發模式" : ""}；Token：${config.token ? "已設定" : config.tokenProblem ? "格式有誤" : "未設定"}${host.kind === "codex" ? `；宿主：Codex；來源：${tokenSource}` : ""}）\n`,
  );
  const shutdown = () => {
    server.close().finally(() => process.exit(0));
  };
  process.stdin.on("end", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[openfun] 啟動失敗：${(err as Error)?.name ?? "Error"}\n`);
  process.exit(1);
});
