// 聊天指引 companion plugin（dist/openfun-chat-plugin.zip）的打包回歸測試。
// 這份 plugin 只含 skill，不啟動本機 MCP；查詢功能由另外安裝的 .mcpb 提供。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const zipFile = join(root, "dist", "openfun-chat-plugin.zip");
const EXPECTED = [".claude-plugin/plugin.json", "LICENSE", "README.md", "skills/openfun-data/SKILL.md"];
const TOOLS = [
  "openfun_guide",
  "openfun_check_config",
  "openfun_search",
  "openfun_list_datasets",
  "openfun_get_dataset",
  "openfun_get_skill",
  "openfun_query_records",
  "openfun_get_record",
  "openfun_aggregate",
];

let files;
let dir;
before(() => {
  assert.ok(existsSync(zipFile), "請先執行 npm run pack:plugin");
  files = unzipSync(new Uint8Array(readFileSync(zipFile)));
  dir = mkdtempSync(join(tmpdir(), "openfun-plugin-"));
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    const out = resolve(dir, name);
    assert.ok(out.startsWith(dir + sep), `ZIP 路徑逃出目錄：${name}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  }
});
after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const text = (name) => new TextDecoder().decode(files[name]);

test("ZIP 根目錄即 plugin 根目錄：只有 allowlist 檔案，含隱藏的 .claude-plugin，沒有多包一層", () => {
  const names = Object.keys(files).sort();
  assert.deepEqual(names, EXPECTED);
  for (const n of names) {
    assert.ok(!n.startsWith("/") && !n.includes("\\") && !n.split("/").includes(".."), `不合法路徑：${n}`);
  }
  assert.equal(names.filter((n) => n.endsWith("plugin.json")).length, 1, "plugin.json 恰好一份");
  assert.ok(!names.some((n) => /\.(mcpb|zip|dxt)$/i.test(n)), "不可內嵌 .mcpb 或其他 ZIP");
  assert.ok(!names.some((n) => /(^|\/)(\.mcp\.json|hooks|agents|commands|\.lsp\.json)/.test(n)), "不可有 MCP/hooks/agents 等元件");
});

test("plugin.json：名稱、版本同步、說明需搭配 Desktop 擴充、只宣告 skills", () => {
  const m = JSON.parse(text(".claude-plugin/plugin.json"));
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const mcpb = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.equal(m.name, "openfun-data-chat");
  assert.match(m.displayName, /[一-鿿]/);
  assert.equal(m.version, pkg.version);
  assert.equal(m.version, mcpb.version);
  assert.match(m.description, /Settings > Extensions/);
  assert.match(m.description, /openfun-claude-extension\.mcpb/);
  assert.match(m.description, /不含查詢功能/);
  assert.ok(m.author?.name);
  assert.equal(m.license, "MIT");
  assert.deepEqual(m.skills, ["./skills/"]);
  for (const k of ["mcpServers", "userConfig", "hooks", "agents", "commands", "lspServers", "outputStyles"]) {
    assert.ok(!(k in m), `不可宣告 ${k}`);
  }
  // skills 路徑相對 plugin 根目錄可解析
  const skillsDir = resolve(dir, m.skills[0]);
  assert.ok(statSync(skillsDir).isDirectory());
  assert.ok(existsSync(join(skillsDir, "openfun-data", "SKILL.md")));
});

test("SKILL.md：frontmatter 合法、name 與資料夾一致、description 為繁中查資料情境", () => {
  const md = text("skills/openfun-data/SKILL.md");
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "需以 YAML frontmatter 開頭");
  const fm = Object.fromEntries(
    m[1].split("\n").map((line) => {
      const i = line.indexOf(":");
      assert.ok(i > 0 && /^[a-z_-]+$/.test(line.slice(0, i)), `frontmatter 行格式錯誤：${line}`);
      return [line.slice(0, i), line.slice(i + 1).trim()];
    }),
  );
  assert.deepEqual(Object.keys(fm).sort(), ["description", "name"]);
  assert.equal(fm.name, "openfun-data");
  assert.match(fm.name, /^[a-z0-9-]+$/);
  assert.ok(fm.description.length > 20 && fm.description.length <= 1024);
  assert.match(fm.description, /^當使用者想查台灣公共資料/);
  assert.ok(!/[:#]\s/.test(fm.description.replace(/https?:\/\//g, "")), "description 不可含會破壞 YAML 的「: 」");
  const body = md.slice(m[0].length);
  for (const t of TOOLS) assert.ok(body.includes(t), `skill 應提到 ${t}`);
  assert.match(body, /Settings > Extensions/);
  assert.match(body, /openfun-claude-extension\.mcpb/);
  assert.match(body, /group_by/);
  assert.match(body, /不要請使用者把 Token 貼到聊天/);
  assert.match(body, /不等於查無資料/);
  assert.match(body, /不是指令/);
  assert.ok(md.length < 6000, "skill 應保持精簡");
});

test("不含 Token、runtime 設定或本機 MCP 啟動資訊", () => {
  for (const name of EXPECTED) {
    const t = text(name);
    assert.doesNotMatch(t, /ofk_[0-9a-f]{16,}/i, `${name} 不可含 Token`);
    assert.doesNotMatch(t, /OPENFUN_API_TOKEN|OPENFUN_DEV_|\$\{user_config|mcp_config|"command"\s*:/, `${name} 不可含 runtime 設定`);
    assert.doesNotMatch(t, /Authorization:\s*Bearer\s+\S/, `${name} 不可含認證 header`);
  }
});

test("打包可重現：重跑 pack:plugin 產生相同位元組", () => {
  const before = readFileSync(zipFile);
  execFileSync(process.execPath, [join(root, "scripts", "pack-plugin.mjs")], { stdio: "pipe" });
  assert.ok(Buffer.compare(before, readFileSync(zipFile)) === 0);
});

function claudeValidate(path) {
  return spawnSync("claude", ["plugin", "validate", "--strict", path], { encoding: "utf8", timeout: 60_000 });
}
const hasClaude = spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0;

test("claude plugin validate --strict：原始 plugin/ 與解壓後的 ZIP 都通過", { skip: hasClaude ? false : "找不到 claude CLI" }, () => {
  for (const p of [join(root, "plugin"), dir]) {
    const r = claudeValidate(p);
    assert.equal(r.status, 0, `${p}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /Validation passed/);
  }
});
