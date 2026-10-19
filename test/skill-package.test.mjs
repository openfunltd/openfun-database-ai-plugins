import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const archive = join(root, "dist", "openfun-chat-skill.zip");

test("Claude skill ZIP：單一頂層資料夾、SKILL.md 直接位於其中、不含 plugin manifest", () => {
  const files = unzipSync(readFileSync(archive));
  const names = Object.keys(files);
  assert.deepEqual([...new Set(names.map((name) => name.split("/")[0]))], ["openfun-data"]);
  assert.ok(names.includes("openfun-data/SKILL.md"));
  assert.ok(names.every((name) => name.split("/").length === 2));
  assert.ok(names.every((name) => !name.includes("plugin.json") && !name.includes(".claude-plugin")));
  assert.equal(names.filter((name) => name.endsWith("/SKILL.md")).length, 1);
  // An independent ZIP reader checks the upload layout, not the packer's serializer.
  execFileSync("python3", ["-c", `
import sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 assert set(z.namelist()) == {'openfun-data/SKILL.md', 'openfun-data/LICENSE'}
 assert z.read('openfun-data/SKILL.md').decode().startswith('---\\nname: openfun-data\\n')
`, archive]);
});

test("Skill 與 plugin 使用同一份查詢／匯出指引，不含 Token 或啟動設定", () => {
  const files = unzipSync(readFileSync(archive));
  const source = readFileSync(join(root, "plugin", "skills", "openfun-data", "SKILL.md"), "utf8");
  const text = strFromU8(files["openfun-data/SKILL.md"]);
  assert.equal(text, source);
  const description = text.match(/^description: (.+)$/m)?.[1];
  assert.ok(description && description.length <= 200);
  assert.match(text, /openfun_check_config/);
  assert.match(text, /openfun_export_excel/);
  assert.match(text, /openfun-claude-extension\.mcpb/);
  for (const content of Object.values(files).map((bytes) => strFromU8(bytes))) {
    assert.doesNotMatch(content, /ofk_[0-9a-f]{16,}|OPENFUN_API_TOKEN|mcp_config|Authorization:\s*Bearer/i);
  }
});

test("Skill ZIP 打包可重現", () => {
  const original = readFileSync(archive);
  execFileSync(process.execPath, [join(root, "scripts", "pack-skill.mjs")]);
  assert.deepEqual(readFileSync(archive), original);
});
