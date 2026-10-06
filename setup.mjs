// src/credentials.ts
import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, chmodSync, unlinkSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// src/config.ts
var TOKEN_PAGE_URL = "https://data.openfun.tw/user";
var MAX_TOKEN_LENGTH = 512;
var MIN_TOKEN_LENGTH = 20;
function checkToken(raw) {
  if (raw === void 0) return { token: null, problem: null };
  const token = raw.trim();
  if (token === "") return { token: null, problem: null };
  if (/^\$\{user_config\.[^}]*\}$/.test(token)) return { token: null, problem: null };
  if (token.length > MAX_TOKEN_LENGTH) {
    return { token: null, problem: "Token \u9577\u5EA6\u7570\u5E38\uFF0C\u8ACB\u78BA\u8A8D\u53EA\u8CBC\u4E0A Token \u672C\u8EAB\u3002" };
  }
  if (/^bearer\s/i.test(token)) {
    return { token: null, problem: "Token \u524D\u9762\u4E0D\u9700\u8981\u52A0\u300CBearer\u300D\uFF0C\u8ACB\u53EA\u8CBC\u4E0A Token \u672C\u8EAB\u3002" };
  }
  if (!/^[\x21-\x7e]+$/.test(token)) {
    return { token: null, problem: "Token \u542B\u6709\u7A7A\u767D\u3001\u63DB\u884C\u6216\u975E\u82F1\u6578\u7B26\u865F\uFF0C\u8ACB\u91CD\u65B0\u8907\u88FD\u8CBC\u4E0A Token\u3002" };
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    return { token: null, problem: "Token \u592A\u77ED\uFF0C\u53EF\u80FD\u53EA\u8907\u88FD\u5230\u4E00\u90E8\u5206\uFF1B\u8ACB\u5230\u5E33\u865F\u9801\u9762\u91CD\u65B0\u8907\u88FD\u5B8C\u6574\u7684 Token\u3002" };
  }
  return { token, problem: null };
}

// src/credentials.ts
var CREDENTIALS_DIR_NAME = "openfun-data";
var CREDENTIALS_FILE_NAME = "credentials.json";
var MAX_FILE_BYTES = 4096;
function credentialsPath(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    const base = env.APPDATA || join(env.USERPROFILE || homedir(), "AppData", "Roaming");
    return join(base, CREDENTIALS_DIR_NAME, CREDENTIALS_FILE_NAME);
  }
  return join(env.HOME || homedir(), ".config", CREDENTIALS_DIR_NAME, CREDENTIALS_FILE_NAME);
}
var isPosix = (platform) => platform !== "win32";
function readCredentials(path, platform = process.platform) {
  let st;
  try {
    st = lstatSync(path);
  } catch (err) {
    if (err.code === "ENOENT") return { token: null, problem: null, exists: false };
    return { token: null, problem: "\u7121\u6CD5\u8B80\u53D6 Token \u8A2D\u5B9A\u6A94\uFF0C\u8ACB\u91CD\u65B0\u57F7\u884C\u8A2D\u5B9A\u7A0B\u5F0F\u3002", exists: true };
  }
  if (!st.isFile()) return { token: null, problem: "Token \u8A2D\u5B9A\u6A94\u4E0D\u662F\u4E00\u822C\u6A94\u6848\uFF08\u53EF\u80FD\u662F\u7B26\u865F\u9023\u7D50\uFF09\uFF0C\u5DF2\u62D2\u7D55\u4F7F\u7528\uFF1B\u8ACB\u91CD\u65B0\u57F7\u884C\u8A2D\u5B9A\u7A0B\u5F0F\u3002", exists: true };
  if (isPosix(platform)) {
    if ((st.mode & 63) !== 0) {
      return { token: null, problem: "Token \u8A2D\u5B9A\u6A94\u6B0A\u9650\u904E\u5BEC\uFF08\u5176\u4ED6\u4F7F\u7528\u8005\u53EF\u8B80\uFF09\uFF0C\u5DF2\u62D2\u7D55\u4F7F\u7528\uFF1B\u8ACB\u91CD\u65B0\u57F7\u884C\u8A2D\u5B9A\u7A0B\u5F0F\u4FEE\u6B63\u3002", exists: true };
    }
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) {
      return { token: null, problem: "Token \u8A2D\u5B9A\u6A94\u4E0D\u5C6C\u65BC\u76EE\u524D\u7684\u4F7F\u7528\u8005\uFF0C\u5DF2\u62D2\u7D55\u4F7F\u7528\uFF1B\u8ACB\u91CD\u65B0\u57F7\u884C\u8A2D\u5B9A\u7A0B\u5F0F\u3002", exists: true };
    }
  }
  if (st.size > MAX_FILE_BYTES) return { token: null, problem: "Token \u8A2D\u5B9A\u6A94\u683C\u5F0F\u7570\u5E38\uFF0C\u8ACB\u91CD\u65B0\u57F7\u884C\u8A2D\u5B9A\u7A0B\u5F0F\u3002", exists: true };
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { token: null, problem: "Token \u8A2D\u5B9A\u6A94\u683C\u5F0F\u7570\u5E38\uFF0C\u8ACB\u91CD\u65B0\u57F7\u884C\u8A2D\u5B9A\u7A0B\u5F0F\u3002", exists: true };
  }
  const raw = data && typeof data === "object" && !Array.isArray(data) ? data.api_token : void 0;
  if (typeof raw !== "string") return { token: null, problem: "Token \u8A2D\u5B9A\u6A94\u683C\u5F0F\u7570\u5E38\uFF0C\u8ACB\u91CD\u65B0\u57F7\u884C\u8A2D\u5B9A\u7A0B\u5F0F\u3002", exists: true };
  const checked = checkToken(raw);
  if (!checked.token) return { token: null, problem: checked.problem ?? "Token \u8A2D\u5B9A\u6A94\u4E2D\u6C92\u6709 Token\uFF0C\u8ACB\u91CD\u65B0\u57F7\u884C\u8A2D\u5B9A\u7A0B\u5F0F\u3002", exists: true };
  return { token: checked.token, problem: null, exists: true };
}
function writeCredentials(path, rawToken, platform = process.platform) {
  const checked = checkToken(rawToken);
  if (!checked.token) throw new Error(checked.problem ?? "Token \u662F\u7A7A\u7684\u3002");
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 448 });
  const dst = lstatSync(dir);
  if (!dst.isDirectory()) throw new Error(`\u8A2D\u5B9A\u76EE\u9304\u4E0D\u662F\u4E00\u822C\u76EE\u9304\uFF1A${dir}`);
  if (isPosix(platform)) {
    if (typeof process.getuid === "function" && dst.uid !== process.getuid()) throw new Error(`\u8A2D\u5B9A\u76EE\u9304\u4E0D\u5C6C\u65BC\u76EE\u524D\u7684\u4F7F\u7528\u8005\uFF1A${dir}`);
    chmodSync(dir, 448);
  }
  try {
    const existing = lstatSync(path);
    if (!existing.isFile()) throw new Error(`\u65E2\u6709\u7684\u8A2D\u5B9A\u6A94\u4E0D\u662F\u4E00\u822C\u6A94\u6848\uFF0C\u8ACB\u5148\u624B\u52D5\u79FB\u9664\uFF1A${path}`);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const tmp = join(dir, `.${CREDENTIALS_FILE_NAME}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const body = JSON.stringify({ version: 1, api_token: checked.token }) + "\n";
  const fd = openSync(tmp, "wx", 384);
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    if (isPosix(platform)) chmodSync(tmp, 384);
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
}
function removeCredentials(path) {
  try {
    const st = lstatSync(path);
    if (st.isDirectory()) throw new Error(`\u8A2D\u5B9A\u6A94\u8DEF\u5F91\u662F\u76EE\u9304\uFF0C\u672A\u522A\u9664\uFF1A${path}`);
    unlinkSync(path);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

// src/codex-setup.ts
var MAX_INPUT = 1024;
var USAGE = `\u6B50\u5674\u8CC7\u6599\u5EAB Codex plugin\uFF1AToken \u8A2D\u5B9A\u7A0B\u5F0F

\u7528\u6CD5\uFF1A
  node setup.mjs            \u8A2D\u5B9A\u6216\u53D6\u4EE3 Token\uFF08\u6703\u63D0\u793A\u8CBC\u4E0A\uFF0C\u8F38\u5165\u5167\u5BB9\u4E0D\u6703\u986F\u793A\uFF09
  node setup.mjs --status   \u67E5\u770B\u662F\u5426\u5DF2\u8A2D\u5B9A\uFF08\u4E0D\u986F\u793A Token\uFF09
  node setup.mjs --remove   \u79FB\u9664\u5DF2\u5132\u5B58\u7684 Token
  node setup.mjs --help     \u986F\u793A\u8AAA\u660E

Token \u8ACB\u5230 ${TOKEN_PAGE_URL} \u5EFA\u7ACB\u3002\u672C\u7A0B\u5F0F\u4E0D\u63A5\u53D7\u5F9E\u547D\u4EE4\u5217\u6216\u7BA1\u7DDA\u50B3\u5165 Token\u3002
`;
var Aborted = class extends Error {
};
function readKeys(stdin, stdout, echo) {
  return new Promise((resolvePromise, reject) => {
    let value = "";
    let escape = false;
    const finish = (err) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      stdout.write("\n");
      if (err) reject(err);
      else resolvePromise(value);
    };
    const onData = (chunk) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const ch of text) {
        if (escape) {
          if (/[A-Za-z~]/.test(ch)) escape = false;
          continue;
        }
        if (ch === "\x1B") {
          escape = true;
          continue;
        }
        if (ch === "\r" || ch === "\n") return finish(null);
        if (ch === "" || ch === "" && value === "") return finish(new Aborted());
        if (ch === "\x7F" || ch === "\b") {
          if (value.length > 0) {
            value = [...value].slice(0, -1).join("");
            if (echo) stdout.write("\b \b");
          }
          continue;
        }
        if (ch === "") {
          if (echo) stdout.write("\b \b".repeat([...value].length));
          value = "";
          continue;
        }
        if (ch < " ") continue;
        if (value.length >= MAX_INPUT) continue;
        value += ch;
        if (echo) stdout.write(ch);
      }
    };
    stdin.setRawMode?.(true);
    stdin.on("data", onData);
    stdin.resume();
  });
}
function permissionNote(platform) {
  return platform === "win32" ? "\uFF08Windows \u4E0D\u4F7F\u7528 POSIX \u6A94\u6848\u6B0A\u9650\uFF1B\u6A94\u6848\u6CBF\u7528\u4F7F\u7528\u8005\u8A2D\u5B9A\u76EE\u9304\u7684\u5B58\u53D6\u6B0A\u9650\uFF0C\u4E26\u975E\u52A0\u5BC6\u5132\u5B58\uFF09" : "\uFF08\u76EE\u9304\u6B0A\u9650 700\u3001\u6A94\u6848\u6B0A\u9650 600\uFF0C\u50C5\u9650\u76EE\u524D\u4F7F\u7528\u8005\u8B80\u53D6\uFF1B\u4E26\u975E\u52A0\u5BC6\u5132\u5B58\uFF09";
}
async function runSetup(argv, io) {
  const { stdin, stdout, stderr, env, platform } = io;
  const path = credentialsPath(env, platform);
  const flags = new Set(argv);
  const known = /* @__PURE__ */ new Set(["--status", "--remove", "--help", "-h"]);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length > 0) {
    stderr.write("\u4E0D\u652F\u63F4\u7684\u53C3\u6578\u3002\u70BA\u4E86\u5B89\u5168\uFF0C\u672C\u7A0B\u5F0F\u4E0D\u63A5\u53D7\u5F9E\u547D\u4EE4\u5217\u50B3\u5165 Token\uFF1B\u8ACB\u76F4\u63A5\u57F7\u884C node setup.mjs \u518D\u4F9D\u63D0\u793A\u8CBC\u4E0A\u3002\n\n");
    stderr.write(USAGE);
    return 2;
  }
  if (flags.has("--help") || flags.has("-h")) {
    stdout.write(USAGE);
    return 0;
  }
  if (flags.has("--status")) {
    const r = readCredentials(path, platform);
    stdout.write(`\u8A2D\u5B9A\u6A94\uFF1A${path}
`);
    if (r.token) stdout.write("\u72C0\u614B\uFF1A\u5DF2\u8A2D\u5B9A Token\uFF08\u4E0D\u986F\u793A\u5167\u5BB9\uFF09\u3002\n");
    else if (r.problem) stdout.write(`\u72C0\u614B\uFF1A\u8A2D\u5B9A\u6A94\u7121\u6CD5\u4F7F\u7528\uFF1A${r.problem}
`);
    else stdout.write("\u72C0\u614B\uFF1A\u5C1A\u672A\u8A2D\u5B9A Token\u3002\n");
    if (typeof env.OPENFUN_API_TOKEN === "string" && env.OPENFUN_API_TOKEN.trim() !== "") {
      stdout.write("\u6CE8\u610F\uFF1A\u76EE\u524D\u7684\u74B0\u5883\u8B8A\u6578 OPENFUN_API_TOKEN \u6709\u503C\uFF1B\u82E5 MCP server \u6536\u5230\u6B64\u8B8A\u6578\u6703\u512A\u5148\u4F7F\u7528\u5B83\u3002\n");
    }
    return 0;
  }
  if (flags.has("--remove")) {
    const removed = removeCredentials(path);
    stdout.write(removed ? `\u5DF2\u79FB\u9664 Token\uFF1A${path}
\u8ACB\u91CD\u65B0\u555F\u52D5 Codex \u8B93\u8B8A\u66F4\u751F\u6548\u3002
` : `\u6C92\u6709\u5DF2\u5132\u5B58\u7684 Token\uFF08${path}\uFF09\u3002
`);
    return 0;
  }
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    stderr.write(
      "\u9700\u8981\u5728\u4E92\u52D5\u5F0F\u7D42\u7AEF\u6A5F\u4E2D\u57F7\u884C\uFF0C\u624D\u80FD\u5728\u4E0D\u986F\u793A Token \u7684\u60C5\u6CC1\u4E0B\u8F38\u5165\u3002\n\u8ACB\u958B\u555F\u7D42\u7AEF\u6A5F\uFF08macOS\u300C\u7D42\u7AEF\u6A5F\u300D\u3001Windows\u300CPowerShell\u300D\uFF09\u76F4\u63A5\u57F7\u884C node setup.mjs\uFF1B\u672C\u7A0B\u5F0F\u4E0D\u63A5\u53D7\u7BA1\u7DDA\u6216\u91CD\u65B0\u5C0E\u5411\u8F38\u5165\u3002\n"
    );
    return 1;
  }
  try {
    const existing = readCredentials(path, platform);
    if (existing.exists) {
      stdout.write(existing.token ? "\u5DF2\u7D93\u8A2D\u5B9A\u904E Token\u3002\u8981\u53D6\u4EE3\u55CE\uFF1F(y/N) " : `\u73FE\u6709\u8A2D\u5B9A\u6A94\u7121\u6CD5\u4F7F\u7528\uFF08${existing.problem}\uFF09\u3002\u8981\u91CD\u65B0\u8A2D\u5B9A\u55CE\uFF1F(y/N) `);
      const answer = (await readKeys(stdin, stdout, true)).trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        stdout.write("\u672A\u8B8A\u66F4\u3002\n");
        return 0;
      }
    }
    stdout.write(`\u8ACB\u8CBC\u4E0A\u6B50\u5674 API Token\uFF08\u5230 ${TOKEN_PAGE_URL} \u5EFA\u7ACB\uFF09\uFF0C\u8CBC\u4E0A\u5F8C\u6309 Enter\u3002\u8F38\u5165\u5167\u5BB9\u4E0D\u6703\u986F\u793A\uFF1A`);
    const raw = await readKeys(stdin, stdout, false);
    const checked = checkToken(raw);
    if (!checked.token) {
      stderr.write(`\u672A\u5132\u5B58\uFF1A${checked.problem ?? "\u6C92\u6709\u8F38\u5165 Token\u3002"}
`);
      return 1;
    }
    writeCredentials(path, checked.token, platform);
    stdout.write(
      `\u5DF2\u5132\u5B58 Token \u5230 ${path}
${permissionNote(platform)}
\u672C\u7A0B\u5F0F\u53EA\u6AA2\u67E5 Token \u683C\u5F0F\u3001\u6C92\u6709\u9023\u7DDA\u9A57\u8B49\u3002\u8ACB\u91CD\u65B0\u555F\u52D5 Codex \u8B93\u8A2D\u5B9A\u751F\u6548\uFF0C\u518D\u8ACB Codex\u300C\u6AA2\u67E5\u6B50\u5674\u8CC7\u6599\u5EAB\u8A2D\u5B9A\u300D\u5411\u6B50\u5674\u78BA\u8A8D Token \u662F\u5426\u6709\u6548\u3002
`
    );
    return 0;
  } catch (err) {
    if (err instanceof Aborted) {
      stderr.write("\u5DF2\u53D6\u6D88\uFF0C\u672A\u8B8A\u66F4\u3002\n");
      return 130;
    }
    stderr.write(`\u8A2D\u5B9A\u5931\u6557\uFF1A${err.message}
`);
    return 1;
  }
}

// src/codex-setup-cli.ts
runSetup(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  platform: process.platform
}).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`\u8A2D\u5B9A\u5931\u6557\uFF1A${err?.message ?? err}
`);
    process.exit(1);
  }
);
