// manifest 驗證（scripts/validate-manifest.mjs，取代 `mcpb validate`）：
// 合法 manifest 通過，各類非法 manifest 必須被拒絕並指出原因。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_PATH, SCHEMA_SHA256, validateManifest } from "../scripts/validate-manifest.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const base = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function check(mutate, { raw, icon = true, entry = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "openfun-manifest-"));
  dirs.push(dir);
  if (icon) copyFileSync(join(root, "icon.png"), join(dir, "icon.png"));
  if (entry) {
    mkdirSync(join(dir, "server"));
    writeFileSync(join(dir, "server", "index.mjs"), "");
  }
  const m = structuredClone(base);
  writeFileSync(join(dir, "manifest.json"), raw ?? JSON.stringify(mutate ? mutate(m) ?? m : m));
  return { dir, ...validateManifest(join(dir, "manifest.json"), { checkEntryPoint: entry }) };
}

test("vendored 官方 schema 雜湊與來源紀錄一致", () => {
  const hash = createHash("sha256").update(readFileSync(SCHEMA_PATH)).digest("hex");
  assert.equal(hash, SCHEMA_SHA256);
  const readme = readFileSync(join(root, "schemas", "README.md"), "utf8");
  assert.ok(readme.includes(SCHEMA_SHA256));
  assert.match(readme, /257af308122753c311825523d19e8c939aeaccc5/);
  assert.match(readFileSync(join(root, "schemas", "LICENSE.mcpb"), "utf8"), /Anthropic, PBC/);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  assert.equal(schema.properties.manifest_version.const, "0.3");
  assert.equal(schema.additionalProperties, false);
});

test("專案 manifest.json 與加上 entry_point 的 bundle 都通過", () => {
  assert.deepEqual(validateManifest(join(root, "manifest.json")).errors, []);
  assert.deepEqual(check(null, { entry: true }).errors, []);
});

const INVALID = {
  "缺 name": [(m) => void delete m.name, /required|name/],
  "缺 author.name": [(m) => void (m.author = { url: "https://x.example" }), /author/],
  "未知頂層欄位（permissions）": [(m) => void (m.permissions = {}), /additional properties.*permissions/],
  "user_config 用不存在的 secret": [(m) => void (m.user_config.api_token.secret = true), /secret/],
  "user_config 型別錯誤": [(m) => void (m.user_config.api_token.type = "password"), /user_config/],
  "server.type 不支援": [(m) => void (m.server.type = "deno"), /server/],
  "缺 mcp_config": [(m) => void delete m.server.mcp_config, /mcp_config/],
  "平台不在允許清單": [(m) => void (m.compatibility.platforms = ["darwin", "android"]), /platforms/],
  "email 格式錯誤": [(m) => void (m.author.email = "not-an-email"), /format "email"/],
  "homepage 非 URI": [(m) => void (m.homepage = "not a uri"), /format "uri"/],
  "tools 非陣列": [(m) => void (m.tools = { name: "x" }), /tools/],
  "manifest_version 0.4": [(m) => void (m.manifest_version = "0.4"), /manifest_version/],
  "缺 manifest_version": [(m) => void delete m.manifest_version, /manifest_version 必須是 "0.3"/],
  "icon 檔案不存在": [(m) => void (m.icon = "nope.png"), /找不到檔案/],
  "icon 絕對路徑": [(m) => void (m.icon = "/etc/icon.png"), /絕對路徑/],
  "icon 使用 ${__dirname}": [(m) => void (m.icon = "${__dirname}/icon.png"), /__dirname/],
  "icon 遠端 URL": [(m) => void (m.icon = "https://example.com/i.png"), /本機圖示/],
  "icon 離開 bundle": [(m) => void (m.icon = "../icon.png"), /離開/],
};

for (const [name, [mutate, re]] of Object.entries(INVALID)) {
  test(`拒絕非法 manifest：${name}`, () => {
    const r = check(mutate);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => re.test(e)), r.errors.join("\n"));
  });
}

test("拒絕非 PNG 的 icon、無法解析的 JSON、缺少 entry_point", () => {
  const notPng = check(null, { icon: false });
  writeFileSync(join(notPng.dir, "icon.png"), "GIF89a not a png");
  const r1 = validateManifest(join(notPng.dir, "manifest.json"));
  assert.ok(r1.errors.some((e) => /不是 PNG/.test(e)), r1.errors.join("\n"));

  const bad = check(null, { raw: "{ not json" });
  assert.ok(bad.errors.some((e) => /無法讀取或解析/.test(e)));

  const noEntry = check(null, { entry: false });
  const r3 = validateManifest(join(noEntry.dir, "manifest.json"), { checkEntryPoint: true });
  assert.ok(r3.errors.some((e) => /entry_point/.test(e)));
  const escape = check((m) => void (m.server.entry_point = "../server/index.mjs"), { entry: true });
  assert.ok(validateManifest(join(escape.dir, "manifest.json"), { checkEntryPoint: true }).errors.some((e) => /entry_point/.test(e)));
});

test("CLI：合法時 exit 0，非法時 exit 1 並列出原因", () => {
  const script = join(root, "scripts", "validate-manifest.mjs");
  const okRun = spawnSync(process.execPath, [script, join(root, "manifest.json")], { encoding: "utf8" });
  assert.equal(okRun.status, 0, okRun.stderr);
  const badDir = check((m) => void (m.permissions = {})).dir;
  const badRun = spawnSync(process.execPath, [script, badDir], { encoding: "utf8" });
  assert.equal(badRun.status, 1);
  assert.match(badRun.stderr, /permissions/);
});
