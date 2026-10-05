// 以子程序啟動 `codex app-server`（stdio JSON-RPC），只在呼叫端指定的隔離 CODEX_HOME／HOME 下執行。
// 不送出任何對話 turn，因此不會呼叫模型，也不需要 API Key。
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";

export class CodexAppServer {
  constructor(env) {
    this.child = spawn("codex", ["app-server"], { env, stdio: ["pipe", "pipe", "pipe"] });
    this.pending = new Map();
    this.nextId = 0;
    this.stderr = "";
    let buf = "";
    this.child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          this.pending.get(msg.id)(msg);
          this.pending.delete(msg.id);
        }
      }
    });
    this.child.stderr.on("data", (d) => (this.stderr += d));
  }

  request(method, params, timeoutMs = 60_000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`app-server ${method} 逾時\n${this.stderr.slice(-2000)}`));
      }, timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(Object.assign(new Error(`${method}: ${msg.error.message}`), { rpc: msg.error }));
        else resolve(msg.result);
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  async initialize() {
    const r = await this.request("initialize", { clientInfo: { name: "openfun-test", version: "0" } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
    return r;
  }

  async close() {
    if (this.child.exitCode !== null) return;
    const exited = new Promise((r) => this.child.once("exit", r));
    this.child.stdin.end();
    this.child.kill("SIGTERM");
    const t = setTimeout(() => this.child.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(t);
  }
}

/** Linux：列出 rootPid 的所有子孫程序（含 cmdline、cwd、environ） */
export function descendantProcesses(rootPid) {
  const parentOf = new Map();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      parentOf.set(Number(name), ppid);
    } catch {
      /* 程序已結束 */
    }
  }
  const isDescendant = (pid) => {
    for (let p = parentOf.get(pid), n = 0; p !== undefined && n < 64; p = parentOf.get(p), n++) if (p === rootPid) return true;
    return false;
  };
  const out = [];
  for (const pid of parentOf.keys()) {
    if (!isDescendant(pid)) continue;
    try {
      const argv = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
      const env = Object.fromEntries(
        readFileSync(`/proc/${pid}/environ`, "utf8")
          .split("\0")
          .filter(Boolean)
          .map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]),
      );
      out.push({ pid, argv, cwd: readlinkSync(`/proc/${pid}/cwd`), env });
    } catch {
      /* 程序已結束或無權限 */
    }
  }
  return out;
}
