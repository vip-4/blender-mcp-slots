/* 零依赖生成社交分享卡片（1200×630 PNG）
 * 用法：node scripts/og-cards.mjs
 * 说明：自带 PNG 编码器（zlib + CRC32），不引入任何第三方库，可在 CI 中复现。
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site', 'assets');
const W = 1200, H = 630;

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y += 1) {
    raw[y * (W * 3 + 1)] = 0;
    rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 画布 ---------- */
class Canvas {
  constructor() {
    this.buf = Buffer.alloc(W * H * 3);
    // 深紫渐变底
    for (let y = 0; y < H; y += 1) {
      const t = y / H;
      const r = Math.round(18 + 22 * t), g = Math.round(10 + 14 * t), b = Math.round(48 + 40 * t);
      for (let x = 0; x < W; x += 1) this.set(x, y, [r, g, b]);
    }
  }
  set(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = r; this.buf[i + 1] = g; this.buf[i + 2] = b;
  }
  // 带径向柔光的方块（模拟霓虹发光）
  rect(x, y, w, h, color, glow = 0) {
    for (let gy = y - glow; gy < y + h + glow; gy += 1) {
      for (let gx = x - glow; gx < x + w + glow; gx += 1) {
        const dx = Math.max(x - gx, gx - (x + w - 1), 0);
        const dy = Math.max(y - gy, gy - (y + h - 1), 0);
        const d = Math.hypot(dx, dy);
        const a = d <= 0 ? 1 : Math.max(0, 1 - d / (glow + 1));
        if (a <= 0) continue;
        const i = (gy * W + gx) * 3;
        if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
        const blend = d <= 0 ? 1 : a * 0.55;
        this.buf[i] = Math.round(this.buf[i] * (1 - blend) + color[0] * blend);
        this.buf[i + 1] = Math.round(this.buf[i + 1] * (1 - blend) + color[1] * blend);
        this.buf[i + 2] = Math.round(this.buf[i + 2] * (1 - blend) + color[2] * blend);
      }
    }
  }
  circle(cx, cy, r, color, glow = 0) {
    for (let y = cy - r - glow; y <= cy + r + glow; y += 1) {
      for (let x = cx - r - glow; x <= cx + r + glow; x += 1) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) this.set(x, y, color);
        else if (d <= r + glow) {
          const a = (1 - (d - r) / (glow + 1)) * 0.6;
          const i = ((y * W) + x) * 3;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          this.buf[i] = Math.round(this.buf[i] * (1 - a) + color[0] * a);
          this.buf[i + 1] = Math.round(this.buf[i + 1] * (1 - a) + color[1] * a);
          this.buf[i + 2] = Math.round(this.buf[i + 2] * (1 - a) + color[2] * a);
        }
      }
    }
  }
  png() { return encodePng(this.buf); }
}

const GOLD = [255, 209, 102], CYAN = [125, 226, 252], PURPLE = [124, 92, 255], GREEN = [6, 214, 160], PINK = [255, 107, 107], WHITE = [244, 241, 255];

/* ---------- 各卡片 ---------- */
function card2048() {
  const c = new Canvas();
  const size = 220, gap = 26;
  const ox = (W - (size * 4 + gap * 3)) / 2, oy = (H - (size * 4 + gap * 3)) / 2;
  const palette = [[201, 195, 230], [168, 224, 255], CYAN, GREEN, GOLD, [255, 183, 3], [255, 159, 28], PINK];
  const values = [2, 4, 8, 16, 32, 64, 128, 2048, 4, 8, 16, 32, 64, 128, 2, 4];
  values.forEach((v, i) => {
    const cx = ox + (i % 4) * (size + gap), cy = oy + Math.floor(i / 4) * (size + gap);
    const col = palette[Math.min(palette.length - 1, Math.log2(v) - 1)] || WHITE;
    if (v === 2048) c.rect(cx, cy, size, size, GOLD, 14);
    else c.rect(cx, cy, size, size, col, 8);
    c.rect(cx + 26, cy + 26, size - 52, size - 52, [col[0] * 0.35, col[1] * 0.35, col[2] * 0.45], 0);
  });
  return c.png();
}

function cardSnake() {
  const c = new Canvas();
  const cell = 46, ox = (W - cell * 18) / 2, oy = (H - cell * 12) / 2;
  for (let i = 0; i < 18; i += 1) for (let j = 0; j < 12; j += 1) {
    if ((i + j) % 2 === 0) c.rect(ox + i * cell + 4, oy + j * cell + 4, cell - 8, cell - 8, [40, 26, 92], 0);
  }
  const path = [];
  for (let i = 3; i < 12; i += 1) path.push([i, 6]);
  for (let j = 6; j < 9; j += 1) path.push([11, j]);
  for (let i = 11; i > 6; i -= 1) path.push([i, 9]);
  path.forEach((p, idx) => {
    const x = ox + p[0] * cell, y = oy + p[1] * cell;
    c.rect(x + 2, y + 2, cell - 4, cell - 4, idx === path.length - 1 ? GREEN : PURPLE, idx === path.length - 1 ? 12 : 6);
  });
  c.circle(ox + 15 * cell + cell / 2, oy + 4 * cell + cell / 2, 20, GOLD, 22);
  return c.png();
}

function cardBreakout() {
  const c = new Canvas();
  const rows = [PINK, [255, 159, 28], GOLD, GREEN, CYAN];
  const bw = 108, bh = 34, gap = 12, cols = 10;
  const ox = (W - (bw * cols + gap * (cols - 1))) / 2, oy = 90;
  rows.forEach((color, r) => {
    for (let col = 0; col < cols; col += 1) {
      if (r === 2 && (col === 3 || col === 7)) continue;
      c.rect(ox + col * (bw + gap), oy + r * (bh + gap), bw, bh, color, 6);
    }
  });
  c.circle(W / 2 - 150, 420, 16, WHITE, 26);
  c.rect(W / 2 - 90, 520, 180, 22, CYAN, 18);
  return c.png();
}

mkdirSync(ROOT, { recursive: true });
const cards = [
  ['og-2048.png', card2048()],
  ['og-snake.png', cardSnake()],
  ['og-breakout.png', cardBreakout()]
];
cards.forEach(([name, buf]) => {
  writeFileSync(path.join(ROOT, name), buf);
  console.log(`${name}: ${(buf.length / 1024).toFixed(1)} KB`);
});
