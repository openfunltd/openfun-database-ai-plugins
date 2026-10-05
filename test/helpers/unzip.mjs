// 以 fflate 解壓 ZIP 到指定目錄（測試用，取代 `mcpb unpack`）：拒絕絕對路徑、反斜線與 ..，
// 並依 central directory 的 Unix 權限設定檔案模式（與官方 CLI unpack 相同的行為）。
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { unzipSync } from "fflate";

function unixModes(buf) {
  const modes = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 ZIP（找不到 end of central directory）");
  let off = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("central directory 格式錯誤");
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const mode = (buf.readUInt32LE(off + 38) >>> 16) & 0o777;
    modes.set(buf.toString("utf8", off + 46, off + 46 + nameLen), mode);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return modes;
}

/** @returns {{ names: string[], modes: Map<string, number> }} */
export function extractZip(zipBuffer, outDir) {
  const buf = Buffer.from(zipBuffer);
  const modes = unixModes(buf);
  const files = unzipSync(new Uint8Array(buf));
  const base = resolve(outDir);
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) throw new Error(`不安全的 ZIP 路徑：${name}`);
    if (name.endsWith("/")) continue;
    const out = resolve(base, name);
    if (!out.startsWith(base + sep)) throw new Error(`ZIP 路徑逃出目錄：${name}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
    const mode = modes.get(name);
    if (mode) chmodSync(out, mode);
  }
  return { names: Object.keys(files), modes };
}
