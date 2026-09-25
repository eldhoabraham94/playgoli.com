// Generates client/public/og.png (1200×630 link preview), favicon.png and icon-192.png.
// Pure Node (zlib for PNG), no image libraries: everything is painted per pixel.
// Run: npm run og
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ---------- PNG encoder (RGBA, 8-bit) ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** Opaque images are written as RGB; each row gets the PNG filter that compresses best. */
function encodePng(w, h, px, alpha) {
  const ch = alpha ? 4 : 3;
  const stride = w * ch;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < w; x++)
      for (let k = 0; k < ch; k++) row[x * ch + k] = Math.max(0, Math.min(255, Math.round(px[(y * w + x) * 4 + k])));
    rows.push(row);
  }
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const out = [];
  const zero = Buffer.alloc(stride);
  rows.forEach((row, y) => {
    const up = y ? rows[y - 1] : zero;
    let best = null, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = Buffer.alloc(stride + 1);
      o[0] = f;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? row[i - ch] : 0, b = up[i], c = i >= ch ? up[i - ch] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (row[i] - pred) & 0xff;
        o[i + 1] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) (best = o), (bestScore = score);
    }
    out.push(best);
  });
  const raw = Buffer.concat(out);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, alpha ? 6 : 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- tiny paint toolkit ----------
class Canvas {
  constructor(w, h, bg = null) {
    this.w = w;
    this.h = h;
    this.px = new Float32Array(w * h * 4);
    if (bg) for (let i = 0; i < w * h; i++) this.px.set([...bg, 255], i * 4);
  }
  blend(x, y, rgb, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const p = this.px;
    const da = p[i + 3] / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) p[i + k] = oa ? (rgb[k] * a + p[i + k] * da * (1 - a)) / oa : 0;
    p[i + 3] = oa * 255;
  }
  png(alpha = false) {
    return encodePng(this.w, this.h, this.px, alpha);
  }
}

const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function laterite(cv, seed = 0) {
  const { w, h, px } = cv;
  const base = hex('#a14e2e');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 90 + seed, y / 90);
      const pit = hash(x + seed * 7, y) > 0.993 ? -38 : 0;
      // Sparse grit (dense per-pixel noise makes the PNG huge).
      const g = hash(x * 1.3, y * 0.7 + seed);
      const grit = g > 0.988 ? (g - 0.994) * 2400 : 0;
      const dx = (x - w / 2) / (w * 0.7), dy = (y - h / 2) / (h * 0.9);
      const vig = 1 - clamp(dx * dx + dy * dy - 0.25, 0, 1) * 0.45;
      const i = (y * w + x) * 4;
      // Quantize the smooth part a little so neighbouring pixels repeat.
      const shade = Math.round((0.78 + n * 0.45) * vig * 24) / 24;
      for (let k = 0; k < 3; k++) px[i + k] = base[k] * shade + grit + pit;
      px[i + 3] = 255;
    }
  }
}

/** The ring scratched with a stick: dark wobbly groove + lit lip. */
function ring(cv, cx, cy, R) {
  const wob = (a) => 2.6 * Math.sin(3 * a + 1) + 1.5 * Math.sin(7 * a + 2) + 0.8 * Math.sin(17 * a);
  for (let y = Math.floor(cy - R - 14); y <= cy + R + 14; y++) {
    for (let x = Math.floor(cx - R - 14); x <= cx + R + 14; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      const groove = Math.abs(d - (R + wob(a)));
      if (groove < 7) cv.blend(x, y, [34, 10, 3], clamp(1 - groove / 7) * 0.75);
      const dl = Math.sqrt((dx - 1) ** 2 + (dy - 2.6) ** 2);
      const lip = Math.abs(dl - (R + wob(a)) - 1.5);
      if (lip < 1.6) cv.blend(x, y, [250, 200, 160], clamp(1 - lip / 1.6) * 0.45);
    }
  }
}

/** Glass cat's-eye marble with a soft shadow. */
function marble(cv, cx, cy, r, glassHex, eyeHex, rot = 0, shadow = true) {
  const glass = hex(glassHex), eye = hex(eyeHex);
  if (shadow) {
    const sx = cx + r * 0.28, sy = cy + r * 0.42, sr = r * 1.3;
    for (let y = Math.floor(sy - sr); y <= sy + sr; y++)
      for (let x = Math.floor(sx - sr); x <= sx + sr; x++) {
        const d = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2) / sr;
        if (d < 1) cv.blend(x, y, [25, 8, 2], (1 - d) ** 2 * 0.55);
      }
  }
  const L = [-0.45, -0.55, 0.7];
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const cov = clamp(r - d + 0.5);
      if (cov <= 0) continue;
      const nx = dx / r, ny = dy / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const diffuse = clamp(nx * L[0] + ny * L[1] + nz * L[2]);
      let c = glass.map((v) => v * (0.5 + 0.55 * diffuse));
      // Three twisted vanes = the cat's eye.
      let e = 0;
      for (let k = 0; k < 3; k++) {
        const t = rot + (k * Math.PI) / 3;
        const u = nx * Math.cos(t) + ny * Math.sin(t);
        const v = -nx * Math.sin(t) + ny * Math.cos(t);
        const w = 0.15 * (1 - u * u);
        const curve = 0.45 * u * (1 - u * u);
        const dist = Math.abs(v - curve);
        if (dist < w) e = Math.max(e, 1 - dist / w);
      }
      c = mix(c, eye.map((v) => v * (0.7 + 0.4 * diffuse)), e * 0.9);
      c = c.map((v) => v * (0.62 + 0.38 * nz));
      const spec = Math.exp(-((nx + 0.38) ** 2 + (ny + 0.42) ** 2) / 0.018);
      const caustic = Math.exp(-((nx - 0.35) ** 2 + (ny - 0.45) ** 2) / 0.05) * 0.25;
      c = c.map((v) => v + 255 * (spec * 0.95 + caustic));
      cv.blend(x, y, c, cov);
    }
  }
}

const GLASS = ['#cfeee9', '#9fdcbf', '#f3c27a', '#a9c8f2', '#e6e0d6', '#f2a6a0'];
const EYES = ['#e63946', '#ffb703', '#06d6a0', '#1f7ae0', '#ff6b35', '#c1121f', '#2ec4b6'];

// ---------- og.png ----------
const LETTERS = {
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
};
{
  const cv = new Canvas(1200, 630);
  laterite(cv, 3);
  const cx = 1005, cy = 322, R = 232;
  ring(cv, cx, cy, R);
  // A little cross of goli in the ring, and a striker lining up.
  const cross = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [0, -2], [-2, 0]];
  cross.forEach(([a, b], i) => marble(cv, cx + a * 46, cy + b * 46, 17, GLASS[i % 6], EYES[(i * 3 + 1) % 7], i));
  marble(cv, cx - 150, cy + 150, 23, '#e63946', '#ffffff', 0.6);

  // "GOLI" spelled in marbles.
  let col = 0;
  const step = 34, x0 = 64, y0 = 322 - 3 * step;
  let n = 0;
  for (const ch of 'GOLI') {
    const g = LETTERS[ch];
    g.forEach((row, ry) =>
      [...row].forEach((c, rx) => {
        if (c !== '#') return;
        marble(cv, x0 + (col + rx) * step, y0 + ry * step, 15, GLASS[n % 6], EYES[(n * 5 + 2) % 7], n * 0.7);
        n++;
      }),
    );
    col += g[0].length + 1;
  }
  writeFileSync(new URL('../client/public/og.png', import.meta.url), cv.png());
}

// ---------- icons ----------
function icon(size, bg, alpha = false) {
  const cv = new Canvas(size, size, bg);
  const r = size * 0.4;
  marble(cv, size / 2 - size * 0.02, size / 2 - size * 0.03, r, '#a9c8f2', '#1f7ae0', 0.5, bg !== null);
  return cv.png(alpha);
}
writeFileSync(new URL('../client/public/favicon.png', import.meta.url), icon(64, null, true));
writeFileSync(new URL('../client/public/icon-192.png', import.meta.url), icon(192, hex('#241510')));

console.log('Wrote client/public/og.png, favicon.png, icon-192.png');
