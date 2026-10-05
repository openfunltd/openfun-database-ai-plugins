// 離線驗證 MCPB manifest.json，取代 `mcpb validate`：
// 1. 以 vendored 官方 JSON schema（schemas/mcpb-manifest-v0.3.schema.json，固定 commit 與 SHA-256）嚴格驗證；
// 2. 與官方 CLI 相同的 icon 檢查（相對路徑、不可用 ${__dirname}、檔案存在、PNG 簽章）；
// 3. 本專案規則：manifest_version 必須是 0.3；指定 checkEntryPoint 時 entry_point 必須存在於 bundle 內。
//
// 用法：node scripts/validate-manifest.mjs [manifest.json 或目錄] [--entry-point]
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA_PATH = join(root, "schemas", "mcpb-manifest-v0.3.schema.json");
export const SCHEMA_SHA256 = "3a0ac9d845711a1b9b17dfa5a52f8b60628239d6a86a9db417206a9efc78592d";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let compiled = null;
function schemaValidator() {
  if (compiled) return compiled;
  const raw = readFileSync(SCHEMA_PATH);
  const hash = createHash("sha256").update(raw).digest("hex");
  if (hash !== SCHEMA_SHA256) {
    throw new Error(`官方 schema 檔案雜湊不符（${hash}），請確認 ${relative(root, SCHEMA_PATH)} 未被修改`);
  }
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv, ["uri", "email"]);
  compiled = ajv.compile(JSON.parse(raw.toString("utf8")));
  return compiled;
}

function checkIcon(icon, baseDir, errors) {
  if (/^https?:\/\//.test(icon)) {
    errors.push("icon：Claude Desktop 只支援 bundle 內的本機圖示，請改用相對路徑（例如 icon.png）");
    return;
  }
  if (icon.includes("${__dirname}")) {
    errors.push("icon：不可使用 ${__dirname}，請用相對路徑（例如 icon.png）");
    return;
  }
  if (isAbsolute(icon)) {
    errors.push(`icon：必須是相對於 bundle 根目錄的路徑，不可為絕對路徑（${icon}）`);
    return;
  }
  const full = resolve(baseDir, icon);
  if (!full.startsWith(resolve(baseDir) + sep)) {
    errors.push(`icon：路徑不可離開 bundle 根目錄（${icon}）`);
    return;
  }
  if (!existsSync(full) || !statSync(full).isFile()) {
    errors.push(`icon：找不到檔案 ${icon}`);
    return;
  }
  const head = readFileSync(full).subarray(0, 8);
  if (!head.equals(PNG_SIGNATURE)) errors.push(`icon：${icon} 不是 PNG 檔`);
}

/**
 * @param {string} inputPath manifest.json 路徑或其所在目錄
 * @param {{ checkEntryPoint?: boolean }} [opts]
 * @returns {{ ok: boolean, errors: string[], manifest: any }}
 */
export function validateManifest(inputPath, opts = {}) {
  let manifestPath = resolve(inputPath);
  if (existsSync(manifestPath) && statSync(manifestPath).isDirectory()) manifestPath = join(manifestPath, "manifest.json");
  const baseDir = dirname(manifestPath);
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return { ok: false, errors: [`無法讀取或解析 ${manifestPath}：${err.message}`], manifest: null };
  }

  const validate = schemaValidator();
  if (!validate(manifest)) {
    for (const e of validate.errors ?? []) {
      const extra = e.params?.additionalProperty ? `（${e.params.additionalProperty}）` : "";
      errors.push(`schema ${e.instancePath || "/"}：${e.message}${extra}`);
    }
  }
  if (manifest?.manifest_version !== "0.3") {
    errors.push(`manifest_version 必須是 "0.3"（目前：${JSON.stringify(manifest?.manifest_version)}）`);
  }
  if (typeof manifest?.icon === "string") checkIcon(manifest.icon, baseDir, errors);
  if (opts.checkEntryPoint) {
    const entry = manifest?.server?.entry_point;
    const full = typeof entry === "string" ? resolve(baseDir, entry) : null;
    if (!full || !full.startsWith(resolve(baseDir) + sep) || !existsSync(full) || !statSync(full).isFile()) {
      errors.push(`server.entry_point 指向的檔案不存在於 bundle 內（${entry}）`);
    }
  }
  return { ok: errors.length === 0, errors, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--")) ?? join(root, "manifest.json");
  const r = validateManifest(target, { checkEntryPoint: args.includes("--entry-point") });
  if (r.ok) {
    console.log(`manifest 驗證通過：${relative(process.cwd(), resolve(target)) || "."}（官方 schema v0.3 @ 257af30）`);
  } else {
    console.error(`manifest 驗證失敗：${target}`);
    for (const e of r.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}
