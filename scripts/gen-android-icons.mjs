// Generates all Android mipmap launcher icons from the ResusCode ECG mark with zero dependencies.
// Run with: npm run android:icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RES_DIR = resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const COLORS = {
  bg: [6, 8, 14],
  red: [239, 68, 68],
  cyan: [6, 182, 212],
  amber: [245, 158, 11],
};

const ECG = [
  [0.094, 0.594],
  [0.3125, 0.594],
  [0.406, 0.3125],
  [0.516, 0.781],
  [0.609, 0.453],
  [0.6875, 0.594],
  [0.906, 0.594],
];
const STROKE_W = 0.075;
const DOT_R = 0.05;

function blend(dst, i, [r, g, b], a) {
  const inv = 1 - a;
  dst[i] = r * a + dst[i] * inv;
  dst[i + 1] = g * a + dst[i + 1] * inv;
  dst[i + 2] = b * a + dst[i + 2] * inv;
  dst[i + 3] = Math.min(255, a * 255 + dst[i + 3] * inv);
}

function insideRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x > size || y > size) return false;
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy || 1e-9;
  let t = (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

function renderIcon(size, mode) {
  const SS = 4;
  const W = size * SS;
  const buf = new Float32Array(W * W * 4);
  const center = W / 2;
  const artScale = mode === 'foreground' ? 0.6 : 0.84;

  const mapPoint = ([nx, ny]) => [
    center + (nx * W - center) * artScale,
    center + (ny * W - center) * artScale,
  ];
  const pts = ECG.map(mapPoint);
  const strokeW = STROKE_W * W * artScale;
  const dotR = DOT_R * W * artScale;

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      if (mode === 'square') {
        if (insideRoundedRect(px, py, W, W * 0.2)) blend(buf, i, COLORS.bg, 1);
      } else if (mode === 'round') {
        if (Math.hypot(px - center, py - center) <= center) blend(buf, i, COLORS.bg, 1);
      }

      let d = Infinity;
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, ay] = pts[s];
        const [bx, by] = pts[s + 1];
        d = Math.min(d, distToSegment(px, py, ax, ay, bx, by));
      }
      if (d <= strokeW / 2) blend(buf, i, COLORS.red, 1);

      const [fx, fy] = pts[0];
      const [lx, ly] = pts[pts.length - 1];
      if (Math.hypot(px - fx, py - fy) <= dotR) blend(buf, i, COLORS.cyan, 1);
      if (Math.hypot(px - lx, py - ly) <= dotR) blend(buf, i, COLORS.amber, 1);
    }
  }

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    rgba.copy(raw, y * rowLen + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const DENSITIES = [
  { dir: 'mipmap-mdpi', launcher: 48, fg: 108 },
  { dir: 'mipmap-hdpi', launcher: 72, fg: 162 },
  { dir: 'mipmap-xhdpi', launcher: 96, fg: 216 },
  { dir: 'mipmap-xxhdpi', launcher: 144, fg: 324 },
  { dir: 'mipmap-xxxhdpi', launcher: 192, fg: 432 },
];

for (const d of DENSITIES) {
  const outDir = resolve(RES_DIR, d.dir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'ic_launcher.png'), encodePng(renderIcon(d.launcher, 'square'), d.launcher));
  writeFileSync(resolve(outDir, 'ic_launcher_round.png'), encodePng(renderIcon(d.launcher, 'round'), d.launcher));
  writeFileSync(resolve(outDir, 'ic_launcher_foreground.png'), encodePng(renderIcon(d.fg, 'foreground'), d.fg));
  console.log(`wrote ${d.dir} icons`);
}
