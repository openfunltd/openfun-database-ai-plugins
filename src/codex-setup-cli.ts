import { runSetup } from "./codex-setup.js";

runSetup(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  platform: process.platform,
}).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`設定失敗：${(err as Error)?.message ?? err}\n`);
    process.exit(1);
  },
);
