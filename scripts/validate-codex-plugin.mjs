// 離線驗證 Codex plugin 目錄（build/codex-plugin 或解壓後的 ZIP）：
// 1. plugin.json／mcp.json：vendored Agent Plugins 1.0.0 官方 schema（固定 commit、SHA-256）以 Ajv strict 驗證；
// 2. Codex 0.159.3 對 portable stdio server 的額外規則（codex-rs/codex-mcp/src/agent_plugin_config.rs）：
//    command 為裸指令名或 `./` 開頭、cwd 在 plugin 內、env 不可覆寫 PLUGIN_ROOT／PLUGIN_DATA；
// 3. extensions.com.openai 內的路徑以 `./` 開頭且存在；marketplace.json 依官方文件必填欄位；
// 4. skill frontmatter、版本與 package.json 一致、args 指到的檔案存在。
//
// 用法：node scripts/validate-codex-plugin.mjs [plugin 目錄]
import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_DIR = join(root, "schemas", "agent-plugins");
export const SCHEMA_SHA256 = {
  "plugin.schema.json": "0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883",
  "mcp.schema.json": "6539175bfcdf43085855183e86da40ea94b166547a72b47ae9a0a390516d3acb",
};
export const PLUGIN_SCHEMA_URI = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const MCP_SCHEMA_URI = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

let validators = null;
function schemaValidators() {
  if (validators) return validators;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const load = (name) => {
    const raw = readFileSync(join(SCHEMA_DIR, name));
    const hash = createHash("sha256").update(raw).digest("hex");
    if (hash !== SCHEMA_SHA256[name]) throw new Error(`vendored schema ${name} 雜湊不符（${hash}）`);
    return ajv.compile(JSON.parse(raw.toString("utf8")));
  };
  validators = { plugin: load("plugin.schema.json"), mcp: load("mcp.schema.json") };
  return validators;
}

const readJson = (path, errors, label) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    errors.push(`${label}：無法讀取或解析（${err.message}）`);
    return null;
  }
};

function contained(base, rel) {
  const full = resolve(base, rel);
  return full === resolve(base) || full.startsWith(resolve(base) + sep) ? full : null;
}

function schemaErrors(validate, data, label, errors) {
  if (!validate(data)) {
    for (const e of validate.errors ?? []) {
      const extra = e.params?.additionalProperty ? `（${e.params.additionalProperty}）` : "";
      errors.push(`${label} ${e.instancePath || "/"}：${e.message}${extra}`);
    }
  }
}

function checkSkill(dir, name, errors) {
  const path = join(dir, "skills", name, "SKILL.md");
  if (!existsSync(path)) return errors.push(`缺少 skills/${name}/SKILL.md`);
  const md = readFileSync(path, "utf8");
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return errors.push(`skills/${name}/SKILL.md：缺少 frontmatter`);
  const fm = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0 || !/^[a-z_-]+$/.test(line.slice(0, i))) return errors.push(`skills/${name}/SKILL.md：frontmatter 行格式錯誤`);
    fm[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  if (fm.name !== name) errors.push(`skills/${name}/SKILL.md：name（${fm.name}）需與資料夾名稱相同`);
  if (!fm.description || fm.description.length > 1024) errors.push(`skills/${name}/SKILL.md：description 需為 1–1024 字`);
}

/**
 * @param {string} dir plugin 根目錄
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCodexPlugin(dir) {
  const errors = [];
  const { plugin: vPlugin, mcp: vMcp } = schemaValidators();
  const base = resolve(dir);

  const manifest = readJson(join(base, "plugin.json"), errors, "plugin.json");
  if (manifest) {
    schemaErrors(vPlugin, manifest, "plugin.json", errors);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (manifest.version !== pkg.version) errors.push(`plugin.json version（${manifest.version}）需與 package.json（${pkg.version}）一致`);
    const ext = manifest.extensions?.["com.openai"];
    for (const key of ["composerIcon", "logo", "logoDark"]) {
      const p = ext?.interface?.[key];
      if (p === undefined) continue;
      if (typeof p !== "string" || !p.startsWith("./")) errors.push(`extensions.com.openai.interface.${key} 需以 ./ 開頭`);
      else if (!contained(base, p) || !existsSync(contained(base, p))) errors.push(`extensions.com.openai.interface.${key} 指向的檔案不存在：${p}`);
    }
    for (const key of ["apps", "hooks", "mcpServers"]) {
      if (ext && key in ext) errors.push(`extensions.com.openai.${key}：本 plugin 不使用（MCP server 由 portable mcp.json 提供）`);
    }
  }
  if (existsSync(join(base, ".codex-plugin"))) errors.push("不應同時提供 .codex-plugin/ 相容 overlay（設定已在 plugin.json 的 extensions.com.openai）");

  const mcp = readJson(join(base, "mcp.json"), errors, "mcp.json");
  if (mcp) {
    schemaErrors(vMcp, mcp, "mcp.json", errors);
    for (const [name, server] of Object.entries(mcp.mcpServers ?? {})) {
      const label = `mcp.json mcpServers.${name}`;
      if (server?.type !== "stdio") {
        errors.push(`${label}：本 plugin 只應有 stdio server`);
        continue;
      }
      const cmd = server.command ?? "";
      const bare = cmd !== "" && !cmd.includes("/") && !cmd.includes("\\");
      const rel = cmd.startsWith("./") && !cmd.includes("\\");
      if (!bare && !rel) errors.push(`${label}.command：Codex 只接受裸指令名或 ./ 開頭的 plugin 內路徑`);
      if (rel && !contained(base, cmd)) errors.push(`${label}.command：路徑離開 plugin 根目錄`);
      for (const k of Object.keys(server.env ?? {})) {
        if (["PLUGIN_ROOT", "PLUGIN_DATA"].includes(k.toUpperCase())) errors.push(`${label}.env 不可覆寫 ${k}`);
      }
      const cwd = server.cwd ?? "${PLUGIN_ROOT}";
      if (!/^(\.\/[^\\]*|\$\{PLUGIN_ROOT\}(\/[^\\]*)?|\$\{PLUGIN_DATA\}(\/[^\\]*)?)$/.test(cwd)) errors.push(`${label}.cwd 不符合 Codex 規則`);
      for (const arg of server.args ?? []) {
        const m = arg.match(/^\$\{PLUGIN_ROOT\}\/(.+)$/);
        if (!m) continue;
        const target = contained(base, m[1]);
        if (!target || !existsSync(target) || !statSync(target).isFile()) errors.push(`${label}.args 指向的檔案不存在：${arg}`);
      }
      if (/OPENFUN_API_TOKEN|ofk_/i.test(JSON.stringify(server))) errors.push(`${label} 不可包含 Token 或 Token 環境變數`);
    }
  }

  const market = readJson(join(base, ".agents", "plugins", "marketplace.json"), errors, ".agents/plugins/marketplace.json");
  if (market) {
    if (typeof market.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(market.name)) errors.push("marketplace.json：name 需為 kebab-case 字串");
    if (!Array.isArray(market.plugins) || market.plugins.length === 0) errors.push("marketplace.json：plugins 需為非空陣列");
    for (const [i, entry] of (market.plugins ?? []).entries()) {
      const label = `marketplace.json plugins[${i}]`;
      if (manifest && entry.name !== manifest.name) errors.push(`${label}.name 需與 plugin.json name 相同`);
      const path = typeof entry.source === "string" ? entry.source : entry.source?.source === "local" ? entry.source.path : null;
      if (typeof path !== "string" || !(path === "./" || path.startsWith("./"))) errors.push(`${label}.source 需為 ./ 開頭的 local 路徑`);
      else if (!contained(base, path) || !existsSync(join(contained(base, path), "plugin.json"))) errors.push(`${label}.source.path 找不到 plugin.json`);
      if (!entry.policy?.installation || !entry.policy?.authentication) errors.push(`${label}.policy.installation／authentication 為必填`);
      if (typeof entry.category !== "string" || entry.category === "") errors.push(`${label}.category 為必填`);
    }
  }

  checkSkill(base, "openfun-data", errors);
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] ?? join(root, "build", "codex-plugin");
  const r = validateCodexPlugin(target);
  if (r.ok) console.log(`Codex plugin 驗證通過：${relative(process.cwd(), resolve(target)) || "."}`);
  else {
    console.error(`Codex plugin 驗證失敗：${target}`);
    for (const e of r.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}
