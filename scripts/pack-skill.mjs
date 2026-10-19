// Claude「技能」上傳格式：只有一個頂層資料夾，直接包含 SKILL.md，不含 plugin manifest。
// 與聊天指引 plugin 共用原文，避免另外維護一份行為不同的指引。
import { zipSync } from "fflate";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const name = "openfun-data";
const skill = readFileSync(join(root, "plugin", "skills", name, "SKILL.md"));
if (!skill.toString("utf8").startsWith(`---\nname: ${name}\n`)) throw new Error("Skill 名稱必須與頂層資料夾相同");
const options = { mtime: new Date("2026-01-01T00:00:00Z"), level: 9 };
const archive = zipSync({
  [`${name}/SKILL.md`]: [skill, options],
  [`${name}/LICENSE`]: [readFileSync(join(root, "LICENSE")), options],
});
mkdirSync(join(root, "dist"), { recursive: true });
const output = join(root, "dist", "openfun-chat-skill.zip");
writeFileSync(output, archive);
console.log(`聊天指引 skill：${output}（${archive.length} bytes；Customize > Skills 上傳）`);
