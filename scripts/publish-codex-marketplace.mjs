// 發布已打包的 Codex plugin 到獨立 codex-marketplace 分支，供桌面版 Git 市集直接安裝。
// main 保留共用原始碼；發行分支只含實際 ZIP 的檔案，不需要使用者自行編譯。
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { validateCodexPlugin } from "./validate-codex-plugin.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const branch = "codex-marketplace";
const git = (args, cwd = root) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"])) throw new Error("請先提交原始碼，避免發布無法追溯的安裝包");
const sourceCommit = git(["rev-parse", "HEAD"]);
const remote = git(["remote", "get-url", "origin"]);
const files = unzipSync(readFileSync(join(root, "dist", "openfun-codex-plugin.zip")));
const dir = mkdtempSync(join(tmpdir(), "openfun-marketplace-publish-"));
try {
  const exists = git(["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
  if (exists) {
    git(["clone", "--quiet", "--depth=1", "--single-branch", "--branch", branch, remote, dir]);
    for (const name of readdirSync(dir)) if (name !== ".git") rmSync(join(dir, name), { recursive: true, force: true });
  } else {
    git(["init", "--quiet", "--initial-branch", branch], dir);
    git(["remote", "add", "origin", remote], dir);
  }
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith("/") || name.includes("\\") || name.split("/").some((s) => s === ".." || s === "")) throw new Error(`不安全的 ZIP entry：${name}`);
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data, { mode: 0o644 });
  }
  const result = validateCodexPlugin(dir);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  git(["add", "--all"], dir);
  if (!git(["diff", "--cached", "--name-only"], dir)) {
    console.log("Codex 市集已是目前打包內容");
  } else {
    git(["-c", `user.name=${git(["config", "user.name"])}`, "-c", `user.email=${git(["config", "user.email"])}`,
      "commit", "--quiet", "-m", `Publish Codex plugin from ${sourceCommit}`], dir);
    git(["push", "origin", `HEAD:refs/heads/${branch}`], dir);
    console.log(`Codex 市集已發布：${branch}，來源 ${sourceCommit}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
