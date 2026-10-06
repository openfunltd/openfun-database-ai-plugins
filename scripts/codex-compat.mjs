// 由 portable plugin.json／mcp.json 產生 Codex 相容入口 .codex-plugin/plugin.json 與 .mcp.json。
// build.mjs 用它產生檔案，validate-codex-plugin.mjs 用它比對，兩邊同源、不會漂移。
//
// 為什麼需要：Codex 0.159.3 本機安裝會優先讀 root plugin.json（agent-plugins schema），但 executor 端的
// capability discovery（codex-rs/exec-server/src/capability_discovery.rs、core-plugins/src/executor_provider.rs）
// 只找 .codex-plugin/、.claude-plugin/、.cursor-plugin/plugin.json；legacy manifest 再從 .mcp.json 讀 MCP 設定。
// 有 root plugin.json 時 Codex 不讀相容入口的 MCP server，只把它的 env_vars 併入同名 server（agent_plugin_mcp_overlay.rs），
// 所以相容入口只能有同名、無 env 的 server，不會多啟動一個。
//
// legacy .mcp.json 不展開 ${PLUGIN_ROOT}：相對 cwd 由 Codex 接到 plugin 根目錄（codex-mcp/src/plugin_config.rs），
// args 則由 node 依 cwd 解析，因此把 `${PLUGIN_ROOT}/x` 轉成 `./x`、cwd 轉成 `.`。

export const COMPAT_MANIFEST = ".codex-plugin/plugin.json";
// 桌面版封存檔匯入器另有只接受 Claude manifest／top-level SKILL.md 的版本。
// 這個入口只為 ZIP 格式相容，仍指向同一組 skill 與本機 MCP，不是 Claude 的聊天指引包。
export const ARCHIVE_MANIFEST = ".claude-plugin/plugin.json";
export const COMPAT_MCP = ".mcp.json";

const ROOT_PREFIX = "${PLUGIN_ROOT}/";

/** @param {any} manifest root plugin.json */
export function compatManifest(manifest) {
  const out = { name: manifest.name, version: manifest.version, description: manifest.description };
  for (const key of ["author", "homepage", "license", "keywords"]) if (manifest[key] !== undefined) out[key] = manifest[key];
  out.skills = "./skills/";
  out.mcpServers = `./${COMPAT_MCP}`;
  const iface = manifest.extensions?.["com.openai"]?.interface;
  if (iface) out.interface = iface;
  return out;
}

export function archiveManifest(manifest) {
  const out = compatManifest(manifest);
  // interface 是 Codex 欄位，Claude manifest 不接受。
  delete out.interface;
  return out;
}

function compatPath(value, label) {
  if (value === "${PLUGIN_ROOT}") return ".";
  if (value.startsWith(ROOT_PREFIX)) return `./${value.slice(ROOT_PREFIX.length)}`;
  if (value.includes("${")) throw new Error(`${label}：相容入口不支援 placeholder（${value}）`);
  return value;
}

/** @param {any} mcp root mcp.json */
export function compatMcp(mcp) {
  const servers = {};
  for (const [name, s] of Object.entries(mcp.mcpServers ?? {})) {
    const label = `mcp.json mcpServers.${name}`;
    if (s.type !== "stdio") throw new Error(`${label}：相容入口只支援 stdio`);
    if (s.env && Object.keys(s.env).length) throw new Error(`${label}：相容入口不轉換 env`);
    servers[name] = {
      type: "stdio",
      command: s.command,
      args: (s.args ?? []).map((a) => compatPath(a, `${label}.args`)),
      cwd: compatPath(s.cwd ?? "${PLUGIN_ROOT}", `${label}.cwd`),
    };
  }
  return { mcpServers: servers };
}

export const compatJson = (value) => JSON.stringify(value, null, 2) + "\n";
