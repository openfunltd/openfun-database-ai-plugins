// Codex plugin 的 Token 設定檔、啟動解析與 setup 程式測試。全部使用暫存 HOME，不碰真實設定、不連網。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { credentialsPath, readCredentials, removeCredentials, writeCredentials } from "../build/lib/credentials.js";
import { resolveRuntime } from "../build/lib/runtime.js";
import { runSetup } from "../build/lib/codex-setup.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const TOKEN = "ofk_" + "a1".repeat(32);
const TOKEN2 = "ofk_" + "b2".repeat(32);
const posix = process.platform !== "win32";
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmpHome = () => {
  const d = mkdtempSync(join(tmpdir(), "openfun-cred 測試-"));
  dirs.push(d);
  return d;
};

test("credentialsPath：POSIX 只依 HOME（不用 XDG_CONFIG_HOME），Windows 用 APPDATA", () => {
  assert.equal(credentialsPath({ HOME: "/h/使用者 a", XDG_CONFIG_HOME: "/x" }, "linux"), "/h/使用者 a/.config/openfun-data/credentials.json");
  assert.equal(credentialsPath({ HOME: "/Users/a" }, "darwin"), "/Users/a/.config/openfun-data/credentials.json");
  const win = credentialsPath({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32");
  assert.match(win, /openfun-data[\\/]credentials\.json$/);
  assert.ok(win.startsWith("C:\\Users\\a\\AppData\\Roaming"));
});

test("writeCredentials：目錄 700、檔案 600、原子寫入不留暫存檔、取代舊值、拒絕不合法 Token", () => {
  const home = tmpHome();
  const path = credentialsPath({ HOME: home }, "linux");
  writeCredentials(path, `  ${TOKEN}\n`);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { version: 1, api_token: TOKEN });
  if (posix) {
    assert.equal(lstatSync(path).mode & 0o777, 0o600);
    assert.equal(lstatSync(join(home, ".config", "openfun-data")).mode & 0o777, 0o700);
  }
  writeCredentials(path, TOKEN2);
  assert.equal(readCredentials(path).token, TOKEN2);
  assert.deepEqual(readdirSync(join(home, ".config", "openfun-data")), ["credentials.json"], "不可留下暫存檔");
  for (const bad of ["short", `Bearer ${TOKEN}`, "ofk_ has space 1234567890"]) {
    assert.throws(() => writeCredentials(path, bad));
  }
  assert.equal(readCredentials(path).token, TOKEN2, "失敗的寫入不可覆蓋既有值");
  if (posix) {
    chmodSync(join(home, ".config", "openfun-data"), 0o755);
    writeCredentials(path, TOKEN);
    assert.equal(lstatSync(join(home, ".config", "openfun-data")).mode & 0o777, 0o700, "重寫時修正目錄權限");
  }
});

test("readCredentials：不存在、權限過寬、符號連結、格式錯誤、Token 不合法都不會給出 Token", () => {
  const home = tmpHome();
  const path = credentialsPath({ HOME: home }, "linux");
  assert.deepEqual(readCredentials(path), { token: null, problem: null, exists: false });
  mkdirSync(join(home, ".config", "openfun-data"), { recursive: true, mode: 0o700 });
  const put = (body, mode = 0o600) => {
    rmSync(path, { force: true });
    writeFileSync(path, body, { mode });
    chmodSync(path, mode);
  };
  if (posix) {
    put(JSON.stringify({ version: 1, api_token: TOKEN }), 0o644);
    assert.match(readCredentials(path).problem, /權限過寬/);
    assert.equal(readCredentials(path).token, null);
  }
  put("{ not json");
  assert.match(readCredentials(path).problem, /格式異常/);
  put(JSON.stringify({ api_token: 123 }));
  assert.match(readCredentials(path).problem, /格式異常/);
  put(JSON.stringify({ api_token: "abc" }));
  assert.match(readCredentials(path).problem, /太短/);
  put(JSON.stringify({ api_token: TOKEN }));
  assert.equal(readCredentials(path).token, TOKEN);
  if (posix) {
    const target = join(home, "elsewhere.json");
    writeFileSync(target, JSON.stringify({ api_token: TOKEN }), { mode: 0o600 });
    rmSync(path);
    symlinkSync(target, path);
    assert.match(readCredentials(path).problem, /符號連結/);
    rmSync(path);
  }
  assert.equal(removeCredentials(path), false);
  put(JSON.stringify({ api_token: TOKEN }));
  assert.equal(removeCredentials(path), true);
  assert.equal(existsSync(path), false);
});

test("resolveRuntime：Claude 原行為不讀設定檔；Codex 環境變數優先、否則讀設定檔", () => {
  const home = tmpHome();
  const path = credentialsPath({ HOME: home }, process.platform);
  writeCredentials(path, TOKEN);
  const env = { HOME: home, APPDATA: join(home, "AppData") };

  const claude = resolveRuntime([], env, "/x/server/index.mjs");
  assert.equal(claude.host.kind, "claude-desktop");
  assert.equal(claude.config.token, null, "Claude MCPB 只從 OPENFUN_API_TOKEN 取得 Token");
  assert.equal(claude.config.baseUrl, "https://data.openfun.tw");

  const fromFile = resolveRuntime(["--host=codex"], env, "/opt/p/server/index.mjs");
  assert.equal(fromFile.config.token, TOKEN);
  assert.equal(fromFile.tokenSource, "credentials-file");
  assert.match(fromFile.host.guideTokenNote, /node "\/opt\/p\/setup\.mjs"/, "說明中的 setup.mjs 為實際安裝位置");

  const fromEnv = resolveRuntime(["--host=codex"], { ...env, OPENFUN_API_TOKEN: TOKEN2 }, "/opt/p/server/index.mjs");
  assert.equal(fromEnv.config.token, TOKEN2);
  assert.equal(fromEnv.tokenSource, "env");

  const badEnv = resolveRuntime(["--host=codex"], { ...env, OPENFUN_API_TOKEN: "Bearer x" }, "/opt/p/server/index.mjs");
  assert.equal(badEnv.config.token, null, "環境變數有值但不合法時不改用設定檔");
  assert.ok(badEnv.config.tokenProblem);

  const withRoot = resolveRuntime(["--host=codex"], { ...env, PLUGIN_ROOT: "/cache/歐噴 p/0.1.0" }, "/ignored/server/index.mjs");
  assert.match(withRoot.host.guideTokenNote, /\/cache\/歐噴 p\/0\.1\.0\/setup\.mjs/);
  assert.ok(withRoot.host.setupHint.includes('node "/cache/歐噴 p/0.1.0/setup.mjs"'), "選用的終端機設定應使用實際 setup.mjs 路徑");
  assert.doesNotMatch(withRoot.host.setupHint, /Claude Desktop/);

  for (const bad of [["--host=other"], ["--host="]]) assert.throws(() => resolveRuntime(bad, env, "/x/server/index.mjs"));
  assert.equal(resolveRuntime(["extra"], env, "/x/server/index.mjs").host.kind, "claude-desktop", "其他參數照原行為忽略");
});

test("宿主提示：維持 Claude Desktop 原文字；Codex 優先在 MCP 畫面設定、終端機與對話為選用", async () => {
  const { notConfiguredError } = await import("../build/lib/errors.js");
  const { serverInstructions, extensionGuide, EXTENSION_GUIDE, SERVER_INSTRUCTIONS } = await import("../build/lib/tools.js");
  const { codexHost } = await import("../build/lib/host.js");
  const claude = notConfiguredError(null);
  assert.equal(claude.message, "尚未設定可用的歐噴 API Token：擴充套件設定中的「歐噴 API Token」是空的。");
  assert.match(claude.hint, /Claude Desktop「設定 > 擴充功能（Extensions）」/);
  assert.match(SERVER_INSTRUCTIONS, /Token 已在擴充套件設定中，不要在聊天中索取。$/);
  assert.match(EXTENSION_GUIDE, /Token 已由使用者在 Claude Desktop 的擴充套件設定中提供/);
  assert.doesNotMatch(EXTENSION_GUIDE + SERVER_INSTRUCTIONS, /openfun_set_token|短效/, "Claude 的說明不提對話 Token");
  const host = codexHost("/p/setup.mjs");
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
    assert.ok(text.includes('node "/p/setup.mjs"'), text.slice(0, 80));
    assert.match(text, /你不能代為執行/);
    assert.match(text, /不要主動請使用者把 Token 貼到對話/);
    assert.match(text, /不要讀取、顯示或搜尋 Token 設定檔或 MCP 環境變數的 Token 值/);
    assert.match(text, /不要代為用 shell、curl、命令列參數、環境變數或寫檔處理或轉送 Token/);
    assert.ok(text.indexOf("OPENFUN_API_TOKEN") < text.indexOf("setup.mjs"), "MCP 畫面設定優先於終端機方式");
    assert.ok(text.indexOf("setup.mjs") < text.indexOf(prompt), "對話方式為選用");
    // 舊值（被拒絕、過期、已清除）不可從聊天紀錄自行再套用；不可有「已提供就不要再索取」的絕對規則
    assert.match(text, /曾被拒絕、已過期或已清除的 Token，不要從聊天紀錄自行再次套用/);
    assert.doesNotMatch(text, /已經提供過時不要再次索取|已經提供時不要重複索取/);
    assert.doesNotMatch(text, /Claude/);
    // 歐噴目前沒有限縮 Token 權限的功能，提示不可要求限縮；也不可宣稱固定的有效期限
    assert.doesNotMatch(text, /限縮|最小權限|唯讀 Token|1 ?小時|一小時/);
  }
  for (const hint of [codex.hint, host.updateHint]) {
    assert.match(hint, /儲存後重新啟動 Codex/);
    assert.match(hint, /或選擇在對話中使用短效 Token|也可選擇在對話中使用新的短效 Token/);
  }
  assert.match(host.updateHint, /請不要再套用同一個 Token/);
  assert.match(extensionGuide(host), /setup.mjs 只檢查格式、不連網/);
  assert.match(extensionGuide(host), /重新啟動後用 openfun_check_config/);
  assert.match(extensionGuide(host), /node "\/p\/setup\.mjs" --remove/);
  assert.match(extensionGuide(host), /重新啟動後需要重貼/);
  assert.match(extensionGuide(host), /不會刪除環境變數、本機設定檔或對話紀錄，也不會撤銷 Token/);
  assert.match(extensionGuide(host), /openfun_clear_token/);
});

// ---------- setup 程式（以模擬 TTY 測試互動流程） ----------

class FakeTTY extends EventEmitter {
  constructor(isTTY = true) {
    super();
    this.isTTY = isTTY;
    this.raw = false;
    this.rawCalls = [];
    this.queue = [];
  }
  setRawMode(m) {
    this.raw = m;
    this.rawCalls.push(m);
  }
  resume() {
    const next = this.queue.shift();
    if (next !== undefined) setImmediate(() => this.emit("data", Buffer.from(next)));
  }
  pause() {}
}
class Out {
  constructor(isTTY = true) {
    this.isTTY = isTTY;
    this.text = "";
  }
  write(s) {
    this.text += s;
  }
}
async function setup(argv, { home, inputs = [], tty = true, env = {} }) {
  const stdin = new FakeTTY(tty);
  stdin.queue.push(...inputs);
  const stdout = new Out(tty);
  const stderr = new Out(tty);
  const code = await runSetup(argv, { stdin, stdout, stderr, env: { HOME: home, ...env }, platform: "linux" });
  return { code, out: stdout.text, err: stderr.text, stdin };
}

test("setup：互動設定不回顯 Token，支援 bracketed paste、Backspace，並以 600 寫入", async () => {
  const home = tmpHome();
  const r = await setup([], { home, inputs: [`\x1b[200~${TOKEN}x\x7f\x1b[201~\r`] });
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes(TOKEN) && !r.err.includes(TOKEN), "畫面輸出不可包含 Token");
  assert.ok(!r.out.includes("*".repeat(8)), "不顯示遮罩字元");
  assert.deepEqual(r.stdin.rawCalls, [true, false], "結束後還原終端機模式");
  const path = credentialsPath({ HOME: home }, "linux");
  assert.equal(readCredentials(path).token, TOKEN);
  if (posix) assert.equal(lstatSync(path).mode & 0o777, 0o600);
  assert.match(r.out, /重新啟動 Codex/);
});

test("setup：已有 Token 時需確認才取代；回答 n 不變更", async () => {
  const home = tmpHome();
  const path = credentialsPath({ HOME: home }, "linux");
  writeCredentials(path, TOKEN, "linux");
  const keep = await setup([], { home, inputs: ["n\r"] });
  assert.equal(keep.code, 0);
  assert.match(keep.out, /未變更/);
  assert.equal(readCredentials(path).token, TOKEN);
  const replace = await setup([], { home, inputs: ["y\r", `${TOKEN2}\r`] });
  assert.equal(replace.code, 0, replace.err);
  assert.equal(readCredentials(path).token, TOKEN2);
  assert.ok(!replace.out.includes(TOKEN2));
});

test("setup：不合法 Token 不儲存；Ctrl-C 取消；非 TTY 拒絕；不接受命令列 Token", async () => {
  const home = tmpHome();
  const path = credentialsPath({ HOME: home }, "linux");
  const bad = await setup([], { home, inputs: ["abc\r"] });
  assert.equal(bad.code, 1);
  assert.match(bad.err, /未儲存：Token 太短/);
  assert.equal(existsSync(path), false);

  const cancel = await setup([], { home, inputs: ["ofk_partial\x03"] });
  assert.equal(cancel.code, 130);
  assert.equal(existsSync(path), false);

  const pipe = await setup([], { home, inputs: [`${TOKEN}\n`], tty: false });
  assert.equal(pipe.code, 1);
  assert.match(pipe.err, /互動式終端機/);
  assert.equal(existsSync(path), false);

  const argvToken = await setup([TOKEN], { home });
  assert.equal(argvToken.code, 2);
  assert.ok(!argvToken.err.includes(TOKEN) && !argvToken.out.includes(TOKEN), "錯誤訊息不可回顯參數");
  assert.equal(existsSync(path), false);
});

test("setup：--status 不顯示 Token；--remove 刪除；提示環境變數", async () => {
  const home = tmpHome();
  const path = credentialsPath({ HOME: home }, "linux");
  assert.match((await setup(["--status"], { home })).out, /尚未設定/);
  writeCredentials(path, TOKEN, "linux");
  const st = await setup(["--status"], { home, env: { OPENFUN_API_TOKEN: "x" } });
  assert.match(st.out, /已設定 Token/);
  assert.match(st.out, /OPENFUN_API_TOKEN/);
  assert.ok(!st.out.includes(TOKEN));
  const rm = await setup(["--remove"], { home });
  assert.match(rm.out, /已移除/);
  assert.equal(existsSync(path), false);
  assert.match((await setup(["--remove"], { home })).out, /沒有已儲存的 Token/);
});

// ---------- 打包後的 setup.mjs：真實子程序 ----------

const setupMjs = join(root, "build", "codex-plugin", "setup.mjs");

test("setup.mjs（打包後）：管線輸入被拒絕，--status/--help 可用", () => {
  const home = tmpHome();
  const env = { PATH: process.env.PATH, HOME: home, APPDATA: join(home, "AppData") };
  const piped = spawnSync(process.execPath, [setupMjs], { input: `${TOKEN}\n`, env, encoding: "utf8" });
  assert.equal(piped.status, 1);
  assert.match(piped.stderr, /互動式終端機/);
  assert.equal(existsSync(credentialsPath(env)), false);
  assert.equal(spawnSync(process.execPath, [setupMjs, "--help"], { env, encoding: "utf8" }).status, 0);
  assert.match(spawnSync(process.execPath, [setupMjs, "--status"], { env, encoding: "utf8" }).stdout, /尚未設定/);
});

const hasPty = posix && spawnSync("python3", ["-c", "import pty"], { encoding: "utf8" }).status === 0;

test("setup.mjs（打包後）：在真實 PTY 中輸入 Token 不回顯並寫入 600 檔案", { skip: hasPty ? false : "需要 python3 pty（僅 POSIX）" }, () => {
  const home = tmpHome();
  // 以 python3 pty 建立真正的終端機，寫入 Token 後讀回終端機上的所有輸出
  const py = `
import os, pty, sys, time, select
pid, fd = pty.fork()
if pid == 0:
    os.execvpe(sys.argv[1], sys.argv[1:], os.environ)
out = b""
def drain(t):
    global out
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try:
                out += os.read(fd, 4096)
            except OSError:
                return
drain(1.5)
os.write(fd, os.environ["T"].encode() + b"\\r")
drain(2.0)
_, status = os.waitpid(pid, 0)
sys.stdout.buffer.write(out)
sys.exit(os.waitstatus_to_exitcode(status))
`;
  const r = spawnSync("python3", ["-c", py, process.execPath, setupMjs], {
    env: { PATH: process.env.PATH, HOME: home, T: TOKEN },
    encoding: "utf8",
    timeout: 20000,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /輸入內容不會顯示/);
  assert.match(r.stdout, /已儲存 Token/);
  assert.ok(!r.stdout.includes(TOKEN), "終端機上不可出現 Token");
  const path = credentialsPath({ HOME: home }, "linux");
  assert.equal(readCredentials(path).token, TOKEN);
  assert.equal(lstatSync(path).mode & 0o777, 0o600);
});
