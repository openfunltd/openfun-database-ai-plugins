// 產生 icon.png（512×512，透明背景），只用 Node 內建模組，可重現。
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 512, H = 512, SS = 4;
const bg = [15, 118, 110];   // teal
const fg = [255, 255, 255];

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function sample(x, y) {
  if (!inRoundRect(x, y, 16, 16, 496, 496, 96)) return null;
  // 放大鏡外環
  const d = Math.hypot(x - 220, y - 220);
  if (d >= 120 && d <= 150) return fg;
  // 把手
  const t = ((x - 320) + (y - 320)) / 2;
  const off = Math.abs((x - 320) - (y - 320)) / Math.SQRT2;
  if (t >= -10 && t <= 110 && off <= 24) return fg;
  // 環內長條圖
  const bars = [[160, 250], [205, 190], [250, 220]];
  for (const [bx, top] of bars) if (x >= bx && x <= bx + 30 && y >= top && y <= 290) return fg;
  return bg;
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const o = y * (W * 4 + 1) + 1 + x * 4;
    const n = SS * SS;
    raw[o] = a ? Math.round(r / a) : 0;
    raw[o + 1] = a ? Math.round(g / a) : 0;
    raw[o + 2] = a ? Math.round(b / a) : 0;
    raw[o + 3] = Math.round((a / n) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../icon.png", import.meta.url), png);
console.log(`icon.png ${png.length} bytes`);
