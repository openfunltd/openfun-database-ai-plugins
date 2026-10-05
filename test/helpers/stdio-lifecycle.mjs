import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { COMPANY_SLUG, GOOD_TOKEN } from "./mock-api.mjs";

/**
 * 以 stdio 啟動伺服器（模擬 Claude Desktop 依 manifest 的 mcp_config 啟動），
 * 走完 initialize → tools/list → tools/call → close。
 */
export async function runStdioLifecycle({ command = process.execPath, args, cwd, apiUrl, token = GOOD_TOKEN }) {
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    // StdioClientTransport 只繼承最小環境變數（PATH、HOME 等），不含 NODE_PATH
    env: { OPENFUN_API_TOKEN: token ?? "", OPENFUN_DEV_BASE_URL: apiUrl, OPENFUN_DEV_TIMEOUT_MS: "3000" },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (d) => (stderr += d.toString()));
  const client = new Client({ name: "stdio-test", version: "1.0.0" });
  await client.connect(transport);
  try {
    const info = client.getServerVersion();
    assert.equal(info.name, "openfun-data");
    assert.match(info.version, /^\d+\.\d+\.\d+/);
    assert.match(client.getInstructions() ?? "", /openfun_guide/);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 9);

    const search = await client.callTool({ name: "openfun_search", arguments: { query: "公司" } });
    assert.equal(search.isError, undefined);
    const rec = await client.callTool({
      name: "openfun_query_records",
      arguments: { slug: COMPANY_SLUG, ranges: { 資本額: { gte: 100 } }, filters: { 縣市: ["臺北市", "新北市"] } },
    });
    assert.equal(rec.isError, undefined, rec.content?.[0]?.text);
    assert.match(rec.content[0].text, /符合條件共 45 筆/);
    const bad = await client.callTool({ name: "openfun_get_dataset", arguments: { slug: "tw.test~ref~private" } });
    assert.equal(bad.isError, true);

    const all = JSON.stringify([search, rec, bad]);
    if (token) assert.ok(!all.includes(token), "工具輸出不可含 Token");
    return { stderr, client };
  } finally {
    await client.close();
    if (token) assert.ok(!stderr.includes(token), "stderr 不可含 Token");
  }
}
