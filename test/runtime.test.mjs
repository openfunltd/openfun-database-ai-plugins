// Token 來源回歸：舊 Token 檔不載入，只接受 MCP 環境變數與選用的對話設定。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveRuntime } from "../build/lib/runtime.js";
import { GOOD_TOKEN, INVALID_TOKEN } from "./helpers/mock-api.mjs";

test("啟動：合法舊 Token 檔仍存在時，沒有環境變數就回報尚未設定", () => {
  const home = mkdtempSync(join(tmpdir(), "openfun-runtime-"));
  const env = { HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData", "Roaming") };
  const paths = [join(home, ".config", "openfun-data", "credentials.json"), join(env.APPDATA, "openfun-data", "credentials.json")];
  try {
    for (const path of paths) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, JSON.stringify({ version: 1, api_token: GOOD_TOKEN }), { mode: 0o600 });
    }
    for (const token of [undefined, "", "   "]) {
      const r = resolveRuntime(["--host=codex"], { ...env, OPENFUN_API_TOKEN: token });
      assert.equal(r.config.token, null);
      assert.equal(r.config.tokenProblem, null);
      assert.equal(r.tokenSource, "none");
    }
    const fromEnv = resolveRuntime(["--host=codex"], { ...env, OPENFUN_API_TOKEN: INVALID_TOKEN });
    assert.equal(fromEnv.config.token, INVALID_TOKEN);
    assert.equal(fromEnv.tokenSource, "env");
    const badEnv = resolveRuntime(["--host=codex"], { ...env, OPENFUN_API_TOKEN: "Bearer x" });
    assert.equal(badEnv.config.token, null);
    assert.ok(badEnv.config.tokenProblem);
    assert.equal(badEnv.tokenSource, "none");
    for (const path of paths) assert.equal(JSON.parse(readFileSync(path, "utf8")).api_token, GOOD_TOKEN, "不修改舊檔");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("啟動：預設 Claude Desktop；Codex 環境變數與宿主參數", () => {
  const plain = resolveRuntime([], { OPENFUN_API_TOKEN: GOOD_TOKEN });
  assert.equal(plain.host.kind, "claude-desktop");
  assert.equal(plain.config.token, GOOD_TOKEN);
  assert.equal(plain.tokenSource, "env");
  const codex = resolveRuntime(["--host=codex"], { OPENFUN_API_TOKEN: GOOD_TOKEN });
  assert.equal(codex.host.kind, "codex");
  assert.equal(codex.config.token, GOOD_TOKEN);
  assert.equal(codex.tokenSource, "env");
  for (const bad of [["--host=other"], ["--host="]]) assert.throws(() => resolveRuntime(bad, {}));
  assert.equal(resolveRuntime(["extra"], {}).host.kind, "claude-desktop");
});

test("宿主提示：維持 Claude Desktop 原文字；Codex 使用 MCP 畫面或對話設定，沒有舊設定方式", async () => {
  const { notConfiguredError } = await import("../build/lib/errors.js");
  const { serverInstructions, extensionGuide, EXTENSION_GUIDE, SERVER_INSTRUCTIONS } = await import("../build/lib/tools.js");
  const { codexHost } = await import("../build/lib/host.js");
  const claude = notConfiguredError(null);
  assert.equal(claude.message, "尚未設定可用的歐噴 API Token：擴充套件設定中的「歐噴 API Token」是空的。");
  assert.match(claude.hint, /Claude Desktop「設定 > 擴充功能（Extensions）」/);
  assert.match(SERVER_INSTRUCTIONS, /Token 已在擴充套件設定中，不要在聊天中索取。$/);
  assert.match(EXTENSION_GUIDE, /Token 已由使用者在 Claude Desktop 的擴充套件設定中提供/);
  assert.doesNotMatch(EXTENSION_GUIDE + SERVER_INSTRUCTIONS, /openfun_set_token|短效/, "Claude 的說明不提對話 Token");
  const host = codexHost();
  const codex = notConfiguredError(null, host);
  const prompt = "請到歐噴建立短效 Token，再貼到這個對話。Token 會留在對話與工具呼叫紀錄中；不要分享此對話，用完可到歐噴撤銷。";
  for (const text of [codex.hint, host.updateHint, serverInstructions(host), extensionGuide(host)]) {
    assert.ok(text.includes(prompt), `應包含固定提示：${text.slice(0, 80)}`);
    assert.match(text, /openfun_set_token/);
    // 預設由使用者本人在 MCP 畫面輸入；AI 不代跑、不讀檔、不轉送 Token、不主動在對話索取。
    assert.match(text, /設定 → MCP 伺服器/);
    assert.match(text, /OPENFUN_API_TOKEN/);
    assert.match(text, /環境變數透傳.*留空/);
    assert.match(text, /未加密/);
    assert.doesNotMatch(text, /setup\.mjs|credentials|終端機/);
    assert.ok(text.indexOf("OPENFUN_API_TOKEN") < text.indexOf(prompt), "畫面設定優先於對話方式");
    assert.match(text, /不要主動請使用者把 Token 貼到對話/);
    assert.match(text, /不要讀取、顯示或搜尋 Token 設定檔或 MCP 環境變數的 Token 值/);
    assert.match(text, /不要代為用 shell、curl、命令列參數、環境變數或寫檔處理或轉送 Token/);
    // 舊值（被拒絕、過期、已清除）不可從聊天紀錄自行再套用；不可有「已提供就不要再索取」的絕對規則
    assert.match(text, /曾被拒絕、已過期或已清除的 Token，不要從聊天紀錄自行再次套用/);
    assert.doesNotMatch(text, /已經提供過時不要再次索取|已經提供時不要重複索取/);
    assert.doesNotMatch(text, /Claude/);
    // 歐噴目前沒有限縮 Token 權限的功能，提示不可要求限縮；也不可宣稱固定的有效期限
    assert.doesNotMatch(text, /限縮|最小權限|唯讀 Token|1 ?小時|一小時/);
  }
  for (const hint of [codex.hint, host.updateHint]) {
    assert.match(hint, /儲存後重新啟動 Codex/);
    assert.match(hint, /也可選擇在對話中使用(新的)?短效 Token/);
  }
  assert.match(host.updateHint, /請不要再套用同一個 Token/);
  assert.match(extensionGuide(host), /重新啟動後用 openfun_check_config/);
  assert.match(extensionGuide(host), /重新啟動後需要重貼/);
  assert.match(extensionGuide(host), /不會刪除環境變數或對話紀錄，也不會撤銷 Token/);
  assert.match(extensionGuide(host), /openfun_clear_token/);
});

