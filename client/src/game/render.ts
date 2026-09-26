/**
 * Canvas drawing: a sunlit laterite ground (generated per pixel), the ring scratched
 * into it, glass cat's-eye marbles, rolling marks and dust. Everything static is
 * pre-rendered once per canvas size; each frame blits layers and sprites.
 * Drawing uses logical 1000×1000 coordinates.
 */
import { BOARD, CENTER, GOLI_R, RAJA_POINTS, RING_R, STRIKER_R, THROW_R } from '@goli/shared';

export interface SceneMarble {
  id: number;
  x: number;
  y: number;
  rot: number;
  value: number;
}

export interface Scene {
  goli: SceneMarble[];
  striker: { x: number; y: number; rot: number; color: string } | null;
  /** Show the throw line highlighted in this colour (striker in hand). */
  throwLine: string | null;
  aim: { angle: number; power: number } | null;
  /** 0..1 of shot clock remaining, or null for no clock. */
  clock: number | null;
  clockSecs: number | null;
  time: number;
}

/** Glass colour by points: white 1, green 2, blue 3, the red Raja 5. */
export const VALUE_GLASS: Record<number, string> = { 1: '#eef1ea', 2: '#5fc98c', 3: '#4f8fea', [RAJA_POINTS]: '#e23a44' };
const EYES = ['#e63946', '#ffb703', '#06d6a0', '#1f7ae0', '#ff6b35', '#9b5de5', '#2ec4b6'];

export function goliLook(id: number, value: number) {
  const glass = VALUE_GLASS[value] ?? VALUE_GLASS[1];
  if (value === RAJA_POINTS) return { glass, eye: '#ffd166' };
  // Keep the eye from vanishing into same-coloured glass.
  const eyes = EYES.filter((e) => e !== (value === 2 ? '#06d6a0' : value === 3 ? '#1f7ae0' : ''));
  return { glass, eye: eyes[(id * 3 + 1) % eyes.length] };
}

function canvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, to: string, t: number, alpha = 1): string {
  const a = hexRgb(hex);
  const b = hexRgb(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Fractal value noise on precomputed lattices (fast enough for every pixel on a phone). */
function heightField(px: number, rnd: () => number): Float32Array {
  const H = new Float32Array(px * px);
  const octaves = [
    { cell: 210, amp: 0.55 },
    { cell: 80, amp: 0.27 },
    { cell: 28, amp: 0.12 },
    { cell: 10, amp: 0.04 },
  ];
  for (const o of octaves) {
    const cellPx = Math.max(2, (o.cell * px) / BOARD);
    const n = Math.ceil(px / cellPx) + 2;
    const lat = new Float32Array(n * n).map(() => rnd());
    for (let y = 0; y < px; y++) {
      const fy = y / cellPx;
      const iy = Math.floor(fy);
      let ty = fy - iy;
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < px; x++) {
        const fx = x / cellPx;
        const ix = Math.floor(fx);
        let tx = fx - ix;
        tx = tx * tx * (3 - 2 * tx);
        const a = lat[iy * n + ix];
        const b = lat[iy * n + ix + 1];
        const c = lat[(iy + 1) * n + ix];
        const d = lat[(iy + 1) * n + ix + 1];
        H[y * px + x] += o.amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
    }
  }
  return H;
}

/** The ground: compact laterite, a worn dusty play area, grit, cracks, pebbles, dry grass. */
function makeGround(px: number): HTMLCanvasElement {
  const c = canvas(px);
  const g = c.getContext('2d')!;
  const rnd = mulberry32(20240925);
  const H = heightField(px, rnd);

  // ---- per pixel: colour from height + wear, lit by the height's slope ----
  const img = g.createImageData(px, px);
  const data = img.data;
  const dark = [112, 46, 24];
  const light = [192, 102, 60];
  const dust = [214, 146, 100];
  const toLogical = BOARD / px;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const i = y * px + x;
      const h = H[i];
      const hx = H[i + (x < px - 1 ? 1 : 0)] - H[i - (x > 0 ? 1 : 0)];
      const hy = H[i + (y < px - 1 ? px : 0)] - H[i - (y > 0 ? px : 0)];
      // Sun from the upper left.
      const lit = 1 + (-hx * 0.8 - hy * 1.0) * (px / 220);
      const lx = x * toLogical - CENTER;
      const ly = y * toLogical - CENTER;
      const r = Math.sqrt(lx * lx + ly * ly);
      const worn = smooth(THROW_R + 70, THROW_R - 80, r) * 0.55; // feet and hands have scuffed the play area
      const t = Math.min(1, Math.max(0, (h - 0.22) * 1.6));
      const grain = (rnd() - 0.5) * 22;
      const o = i * 4;
      for (let k = 0; k < 3; k++) {
        let v = dark[k] + (light[k] - dark[k]) * t;
        v = v + (dust[k] - v) * worn;
        data[o + k] = v * lit + grain;
      }
      // Pores and grit.
      const s = rnd();
      if (s < 0.008) {
        data[o] *= 0.55;
        data[o + 1] *= 0.5;
        data[o + 2] *= 0.5;
      } else if (s > 0.994) {
        // loose sand grains catch the light
        data[o] = 236 - rnd() * 30;
        data[o + 1] = 190 - rnd() * 30;
        data[o + 2] = 146 - rnd() * 30;
      }
      data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.scale(px / BOARD, px / BOARD);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // ---- dry cracks in the untouched soil outside the play area ----
  for (let n = 0; n < 16; n++) {
    const a = rnd() * Math.PI * 2;
    const rr = THROW_R + 60 + rnd() * 220;
    let x = CENTER + Math.cos(a) * rr;
    let y = CENTER + Math.sin(a) * rr;
    if (x < 10 || y < 10 || x > BOARD - 10 || y > BOARD - 10) continue;
    let dir = rnd() * Math.PI * 2;
    const steps = 8 + Math.floor(rnd() * 16);
    g.beginPath();
    g.moveTo(x, y);
    const pts: [number, number][] = [[x, y]];
    for (let s = 0; s < steps; s++) {
      dir += (rnd() - 0.5) * 1.1;
      x += Math.cos(dir) * (5 + rnd() * 7);
      y += Math.sin(dir) * (5 + rnd() * 7);
      g.lineTo(x, y);
      pts.push([x, y]);
      if (rnd() < 0.12) {
        // a short branch
        const b = pts[pts.length - 1];
        g.moveTo(b[0], b[1]);
        let bd = dir + (rnd() < 0.5 ? 1 : -1) * (0.8 + rnd() * 0.6);
        let bx = b[0];
        let by = b[1];
        for (let k = 0; k < 4; k++) {
          bd += (rnd() - 0.5) * 0.8;
          bx += Math.cos(bd) * 6;
          by += Math.sin(bd) * 6;
          g.lineTo(bx, by);
        }
        g.moveTo(x, y);
      }
    }
    g.strokeStyle = 'rgba(52,18,6,0.55)';
    g.lineWidth = 1.4 + rnd() * 1.2;
    g.stroke();
    g.save();
    g.translate(0.8, 1.2);
    g.strokeStyle = 'rgba(245,190,140,0.18)';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  // ---- scuffs and old heel marks ----
  for (let n = 0; n < 12; n++) {
    const a = rnd() * Math.PI * 2;
    const rr = THROW_R + 30 + rnd() * 150;
    const x = CENTER + Math.cos(a) * rr;
    const y = CENTER + Math.sin(a) * rr;
    const sg = g.createRadialGradient(x, y, 0, x, y, 26);
    sg.addColorStop(0, 'rgba(225,160,112,0.22)');
    sg.addColorStop(1, 'rgba(225,160,112,0)');
    g.fillStyle = sg;
    g.beginPath();
    g.ellipse(x, y, 30, 16, a, 0, Math.PI * 2);
    g.fill();
  }

  // ---- pebbles: gravel near the edges, the odd stone inside ----
  for (let n = 0; n < 120; n++) {
    let x: number;
    let y: number;
    if (n < 90) {
      const edge = Math.floor(rnd() * 4);
      const along = rnd() * BOARD;
      const inset = Math.pow(rnd(), 2) * 120;
      x = edge === 0 ? inset : edge === 1 ? BOARD - inset : along;
      y = edge === 2 ? inset : edge === 3 ? BOARD - inset : along;
    } else {
      x = 60 + rnd() * (BOARD - 120);
      y = 60 + rnd() * (BOARD - 120);
    }
    const r = 1.8 + Math.pow(rnd(), 2) * 7;
    const rot = rnd() * Math.PI;
    const tone = ['#b58a68', '#8f7766', '#c9a07c', '#6f5d52', '#d8b48f'][Math.floor(rnd() * 5)];
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(28,10,4,0.4)';
    g.beginPath();
    g.ellipse(r * 0.35, r * 0.45, r, r * 0.72, 0, 0, Math.PI * 2);
    g.fill();
    const pg = g.createRadialGradient(-r * 0.35, -r * 0.35, 0, 0, 0, r);
    pg.addColorStop(0, mix(tone, '#ffffff', 0.35));
    pg.addColorStop(1, mix(tone, '#000000', 0.2));
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // ---- dry grass tufts and a few fallen leaves along the edges ----
  const blades = ['#c9b25a', '#a5a043', '#8a9a3a', '#d8c779', '#6f7a2e'];
  for (let n = 0; n < 26; n++) {
    const edge = Math.floor(rnd() * 4);
    const along = 20 + rnd() * (BOARD - 40);
    const inset = 6 + rnd() * 50;
    const bx = edge === 0 ? inset : edge === 1 ? BOARD - inset : along;
    const by = edge === 2 ? inset : edge === 3 ? BOARD - inset : along;
    const x = bx;
    const y = by;
    g.fillStyle = 'rgba(30,14,4,0.35)';
    g.beginPath();
    g.ellipse(x + 2, y + 3, 7, 4, 0, 0, Math.PI * 2);
    g.fill();
    const count = 6 + Math.floor(rnd() * 10);
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2;
      const len = 9 + rnd() * 20;
      const bend = (rnd() - 0.5) * 10;
      g.strokeStyle = blades[Math.floor(rnd() * blades.length)];
      g.lineWidth = 1 + rnd() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + bend, y + Math.sin(a) * len * 0.5 - bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
  }
  for (let n = 0; n < 6; n++) {
    const x = rnd() < 0.5 ? 20 + rnd() * 90 : BOARD - 20 - rnd() * 90;
    const y = 30 + rnd() * (BOARD - 60);
    const rot = rnd() * Math.PI * 2;
    const tone = ['#a86b2d', '#c99a3b', '#7e5a2a', '#8f9a3a'][Math.floor(rnd() * 4)];
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(30,12,4,0.3)';
    g.beginPath();
    g.ellipse(2, 3, 13, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = tone;
    g.beginPath();
    g.ellipse(0, 0, 13, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(60,30,10,0.5)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-13, 0);
    g.lineTo(13, 0);
    g.stroke();
    g.restore();
  }

  // ---- sunlight and haze ----
  const sun = g.createRadialGradient(BOARD * 0.2, BOARD * 0.15, 40, BOARD * 0.35, BOARD * 0.3, BOARD * 0.95);
  sun.addColorStop(0, 'rgba(255,214,160,0.16)');
  sun.addColorStop(1, 'rgba(255,214,160,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, BOARD, BOARD);
  const v = g.createRadialGradient(CENTER, CENTER, 360, CENTER, CENTER, 760);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(34,10,3,0.5)');
  g.fillStyle = v;
  g.fillRect(0, 0, BOARD, BOARD);

  // ---- the throw line, scratched in short strokes ----
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 60) {
    const a2 = a + Math.PI / 110;
    const r0 = THROW_R + (rnd() - 0.5) * 3;
    g.strokeStyle = 'rgba(58,20,8,0.45)';
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(CENTER + Math.cos(a) * r0, CENTER + Math.sin(a) * r0);
    g.lineTo(CENTER + Math.cos(a2) * r0, CENTER + Math.sin(a2) * r0);
    g.stroke();
    g.strokeStyle = 'rgba(250,210,170,0.28)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(CENTER + Math.cos(a) * r0 + 0.8, CENTER + Math.sin(a) * r0 + 1.4);
    g.lineTo(CENTER + Math.cos(a2) * r0 + 0.8, CENTER + Math.sin(a2) * r0 + 1.4);
    g.stroke();
  }

  scratchedRing(g, rnd);
  return c;
}

/** The ring, gouged with a stick: a dark trough, lit far wall, and loose soil kicked up along it. */
function scratchedRing(g: CanvasRenderingContext2D, rnd: () => number) {
  const p1 = rnd() * 6.28;
  const p2 = rnd() * 6.28;
  const p3 = rnd() * 6.28;
  const wob = (a: number) => 2.4 * Math.sin(3 * a + p1) + 1.4 * Math.sin(7 * a + p2) + 0.8 * Math.sin(17 * a + p3);
  const passes = [
    { w: 11, c: 'rgba(48,16,5,0.4)', dx: 0, dy: 0, reps: 1 },
    { w: 4.5, c: 'rgba(30,9,2,0.78)', dx: 0, dy: 0, reps: 3 },
    { w: 1.8, c: 'rgba(250,200,158,0.42)', dx: 0.9, dy: 2.6, reps: 2 },
  ];
  for (const p of passes) {
    for (let rep = 0; rep < p.reps; rep++) {
      g.strokeStyle = p.c;
      g.lineWidth = p.w * (0.8 + rnd() * 0.4);
      g.beginPath();
      const start = rnd() * 0.3;
      for (let a = start; a <= Math.PI * 2 + start + 0.05; a += Math.PI / 150) {
        const r = RING_R + wob(a) + (rnd() - 0.5) * 1.4 + rep * 0.9;
        const x = CENTER + Math.cos(a) * r + p.dx;
        const y = CENTER + Math.sin(a) * r + p.dy;
        if (a === start) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // Crumbs of displaced soil on both lips of the groove.
  for (let n = 0; n < 520; n++) {
    const a = rnd() * Math.PI * 2;
    const side = rnd() < 0.6 ? 1 : -1;
    const r = RING_R + wob(a) + side * (5 + Math.pow(rnd(), 2) * 11);
    const x = CENTER + Math.cos(a) * r;
    const y = CENTER + Math.sin(a) * r;
    const s = 0.6 + rnd() * 1.8;
    g.fillStyle = rnd() < 0.7 ? `rgba(226,160,112,${0.35 + rnd() * 0.35})` : `rgba(70,26,10,${0.35 + rnd() * 0.3})`;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }
}

/** Glass body + cat's-eye vanes, clipped to the marble. Rotates with rolling. */
function makeMarble(r: number, scale: number, glass: string, eye: string, seed: number): HTMLCanvasElement {
  const half = r + 1;
  const c = canvas(half * 2 * scale);
  const g = c.getContext('2d')!;
  g.scale(c.width / (half * 2), c.height / (half * 2));
  g.translate(half, half);
  const rnd = mulberry32(seed);

  g.save();
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.clip();

  const body = g.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
  body.addColorStop(0, mix(glass, '#ffffff', 0.55, 0.95));
  body.addColorStop(0.65, mix(glass, '#000000', 0.05, 0.9));
  body.addColorStop(1, mix(glass, '#000000', 0.45, 0.95));
  g.fillStyle = body;
  g.fillRect(-r, -r, r * 2, r * 2);

  // Cat's-eye: three twisted vanes through the middle.
  const twist = 0.25 + rnd() * 0.2;
  for (let k = 0; k < 3; k++) {
    g.save();
    g.rotate((k * Math.PI) / 3 + rnd() * 0.3);
    g.beginPath();
    g.moveTo(-r * 0.86, 0);
    g.bezierCurveTo(-r * 0.3, -r * twist, r * 0.3, r * twist, r * 0.86, 0);
    g.bezierCurveTo(r * 0.3, r * (twist - 0.14), -r * 0.3, -r * (twist - 0.14), -r * 0.86, 0);
    g.closePath();
    const vg = g.createLinearGradient(-r, 0, r, 0);
    vg.addColorStop(0, mix(eye, '#000000', 0.3, 0.3));
    vg.addColorStop(0.5, mix(eye, '#ffffff', 0.15, 0.95));
    vg.addColorStop(1, mix(eye, '#000000', 0.3, 0.3));
    g.fillStyle = vg;
    g.fill();
    g.restore();
  }

  // Depth: darker rim; a little soil dust clinging to the glass.
  const rim = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(20,8,2,0.45)');
  g.fillStyle = rim;
  g.fillRect(-r, -r, r * 2, r * 2);
  for (let k = 0; k < 10; k++) {
    g.fillStyle = `rgba(190,110,70,${0.12 + rnd() * 0.18})`;
    g.beginPath();
    g.arc((rnd() - 0.5) * r * 1.8, (rnd() - 0.5) * r * 1.8, 0.5 + rnd() * 1.1, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  return c;
}

/** Fixed specular highlight (doesn't rotate with the marble). */
function makeShine(r: number, scale: number): HTMLCanvasElement {
  const half = r + 1;
  const c = canvas(half * 2 * scale);
  const g = c.getContext('2d')!;
  g.scale(c.width / (half * 2), c.height / (half * 2));
  g.translate(half, half);
  const hl = g.createRadialGradient(-r * 0.38, -r * 0.42, 0, -r * 0.38, -r * 0.42, r * 0.42);
  hl.addColorStop(0, 'rgba(255,255,255,0.95)');
  hl.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = r * 0.09;
  g.beginPath();
  g.arc(0, 0, r * 0.8, 0.15 * Math.PI, 0.55 * Math.PI);
  g.stroke();
  return c;
}

/** Soft cast shadow: wide and gentle so it reads as shade, not a second marble. */
function makeShadow(r: number, scale: number): HTMLCanvasElement {
  const half = r * 1.7;
  const c = canvas(half * 2 * scale);
  const g = c.getContext('2d')!;
  g.scale(c.width / (half * 2), c.height / (half * 2));
  g.translate(half, half);
  const sg = g.createRadialGradient(0, 0, 0, 0, 0, half);
  sg.addColorStop(0, 'rgba(25,8,2,0.4)');
  sg.addColorStop(0.45, 'rgba(25,8,2,0.22)');
  sg.addColorStop(1, 'rgba(25,8,2,0)');
  g.fillStyle = sg;
  g.fillRect(-half, -half, half * 2, half * 2);
  return c;
}

/** Tight dark spot right under the marble where it presses into the soil. */
function makeContact(r: number, scale: number): HTMLCanvasElement {
  const half = r * 0.8;
  const c = canvas(half * 2 * scale);
  const g = c.getContext('2d')!;
  g.scale(c.width / (half * 2), c.height / (half * 2));
  g.translate(half, half);
  const cg = g.createRadialGradient(0, 0, 0, 0, 0, half);
  cg.addColorStop(0, 'rgba(18,5,1,0.75)');
  cg.addColorStop(0.6, 'rgba(18,5,1,0.3)');
  cg.addColorStop(1, 'rgba(18,5,1,0)');
  g.fillStyle = cg;
  g.fillRect(-half, -half, half * 2, half * 2);
  return c;
}

/** Light focused through the glass onto the soil: a bright, tinted spot inside the shadow. */
function makeCaustic(r: number, scale: number, glass: string): HTMLCanvasElement {
  const half = r * 0.75;
  const c = canvas(half * 2 * scale);
  const g = c.getContext('2d')!;
  g.scale(c.width / (half * 2), c.height / (half * 2));
  g.translate(half, half);
  const cg = g.createRadialGradient(0, 0, 0, 0, 0, half);
  cg.addColorStop(0, 'rgba(255,248,225,0.85)');
  cg.addColorStop(0.35, mix(glass, '#ffffff', 0.4, 0.45));
  cg.addColorStop(1, mix(glass, '#ffffff', 0, 0));
  g.fillStyle = cg;
  g.fillRect(-half, -half, half * 2, half * 2);
  return c;
}

interface Drawn {
  x: number;
  y: number;
  r: number;
  rot: number;
  body: HTMLCanvasElement;
  glass: string;
  raja?: boolean;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  grain: boolean;
}

export class Renderer {
  private px = 0;
  private scale = 1;
  private ground: HTMLCanvasElement | null = null;
  /** Where marbles have rolled through the dust (kept for the whole game). */
  private marks: HTMLCanvasElement | null = null;
  private marksCtx: CanvasRenderingContext2D | null = null;
  private dust: Dust[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  /** How far a sphere's centre rises above its contact point on the tilted ground (× r). */
  private lift: number;
  /** Undo the tilt's vertical squash so marbles stay round on screen. */
  private stretch: number;

  constructor(tilt = 0) {
    this.lift = Math.tan(tilt);
    this.stretch = 1 / Math.cos(tilt);
  }

  resize(px: number) {
    if (px === this.px) return;
    const oldMarks = this.marks;
    this.px = px;
    this.scale = px / BOARD;
    this.ground = makeGround(px);
    this.marks = canvas(px);
    this.marksCtx = this.marks.getContext('2d')!;
    if (oldMarks) this.marksCtx.drawImage(oldMarks, 0, 0, px, px);
    this.sprites.clear();
  }

  /** A new game: smooth the ground again. */
  clearMarks() {
    this.marksCtx?.clearRect(0, 0, this.px, this.px);
    this.dust = [];
  }

  /** A marble rolled from (x0,y0) to (x1,y1): press a faint track into the dust. */
  trail(x0: number, y0: number, x1: number, y1: number, r: number) {
    const g = this.marksCtx;
    if (!g) return;
    const s = this.scale;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(70,26,10,0.045)';
    g.lineWidth = r * 0.9;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.strokeStyle = 'rgba(236,178,130,0.04)';
    g.lineWidth = r * 0.35;
    g.beginPath();
    g.moveTo(x0 + 1, y0 + 1.5);
    g.lineTo(x1 + 1, y1 + 1.5);
    g.stroke();
  }

  /** A puff of soil (impacts, the striker landing). strength 0..1. */
  puff(x: number, y: number, strength: number) {
    const n = 3 + Math.round(strength * 7);
    this.dust.push({ x, y, vx: 0, vy: 0, age: 0, life: 0.7 + strength * 0.5, size: 16 + strength * 30, grain: false });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160 * (0.4 + strength);
      this.dust.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.35 + Math.random() * 0.4, size: 1.2 + Math.random() * 2, grain: true });
    }
    if (this.dust.length > 160) this.dust.splice(0, this.dust.length - 160);
  }

  private stepDust(dt: number) {
    for (const d of this.dust) {
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 1 - 3 * dt;
      d.vy *= 1 - 3 * dt;
    }
    this.dust = this.dust.filter((d) => d.age < d.life);
  }

  private drawDust(ctx: CanvasRenderingContext2D) {
    for (const d of this.dust) {
      const t = d.age / d.life;
      if (d.grain) {
        ctx.fillStyle = `rgba(150,72,40,${0.7 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = d.size * (0.6 + t * 1.2);
        const pg = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
        pg.addColorStop(0, `rgba(222,160,112,${0.45 * (1 - t)})`);
        pg.addColorStop(1, 'rgba(222,160,112,0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y - t * 6, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private sprite(key: string, make: () => HTMLCanvasElement) {
    let s = this.sprites.get(key);
    if (!s) this.sprites.set(key, (s = make()));
    return s;
  }

  /** Everything a marble puts on the ground: soft shadow, contact spot, caustic (and the Raja's glow). */
  private drawGroundMarks(ctx: CanvasRenderingContext2D, m: Drawn, time: number) {
    const { x, y, r } = m;
    if (m.raja) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,209,102,${0.35 + 0.2 * Math.sin(time * 0.004)})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255,209,102,0.8)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.55, r * 1.35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const shadow = this.sprite(`shadow${r}`, () => makeShadow(r, this.scale));
    const contact = this.sprite(`contact${r}`, () => makeContact(r, this.scale));
    const caustic = this.sprite(`caustic${r}${m.glass}`, () => makeCaustic(r, this.scale, m.glass));
    // Light from the upper left: the shadow falls down and to the right.
    const sh = r * 1.7;
    ctx.drawImage(shadow, x + r * 0.3 - sh, y + r * 0.4 - sh, sh * 2, sh * 2);
    const ch = r * 0.7;
    ctx.globalAlpha = 0.8;
    ctx.drawImage(contact, x - ch, y - ch * 0.5, ch * 2, ch * 1.2);
    ctx.globalAlpha = 1;
    const ca = r * 0.75;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(caustic, x + r * 0.6 - ca, y + r * 0.7 - ca, ca * 2, ca * 2);
    ctx.restore();
  }

  /** The sphere itself, lifted off the ground and kept round despite the tilt. */
  private drawBody(ctx: CanvasRenderingContext2D, m: Drawn) {
    const { x, y, r } = m;
    const shine = this.sprite(`shine${r}`, () => makeShine(r, this.scale));
    const h = r + 1;
    ctx.save();
    ctx.translate(x, y - r * this.lift);
    ctx.scale(1, this.stretch);
    ctx.save();
    ctx.rotate(m.rot);
    ctx.drawImage(m.body, -h, -h, h * 2, h * 2);
    ctx.restore();
    ctx.drawImage(shine, -h, -h, h * 2, h * 2);
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, scene: Scene, dt = 0) {
    const s = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.ground) ctx.drawImage(this.ground, 0, 0);
    if (this.marks) ctx.drawImage(this.marks, 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);

    if (scene.throwLine) {
      ctx.save();
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = -scene.time * 0.02;
      ctx.strokeStyle = scene.throwLine;
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(scene.time * 0.005);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, THROW_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    this.stepDust(dt);
    this.drawDust(ctx);

    const marbles: Drawn[] = scene.goli.map((m) => {
      const look = goliLook(m.id, m.value);
      const body = this.sprite(`goli${m.id}:${m.value}`, () => makeMarble(GOLI_R, s, look.glass, look.eye, m.id + 1));
      return { x: m.x, y: m.y, r: GOLI_R, rot: m.rot, body, glass: look.glass, raja: m.value === RAJA_POINTS };
    });
    const st = scene.striker;
    if (st) {
      const body = this.sprite(`striker${st.color}`, () => makeMarble(STRIKER_R, s, st.color, '#ffffff', 99));
      marbles.push({ x: st.x, y: st.y, r: STRIKER_R, rot: st.rot, body, glass: st.color });
    }

    // Ground first (shadows, the clock ring, aim guide), then spheres from far to near.
    for (const m of marbles) this.drawGroundMarks(ctx, m, scene.time);
    if (st && scene.clock !== null) this.drawClockRing(ctx, st.x, st.y, scene.clock);
    if (st && scene.aim) this.drawAim(ctx, st.x, st.y, scene.aim.angle, scene.aim.power);
    marbles.sort((a, b) => a.y - b.y);
    for (const m of marbles) this.drawBody(ctx, m);
    if (st && scene.clockSecs !== null && scene.clockSecs <= 5) this.drawCountdown(ctx, st.x, st.y, scene.clockSecs);
  }

  /** Catapult band plus a short direction arrow: you judge the line yourself. */
  private drawAim(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, power: number) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const pull = 40 + power * 190;
    const bx = x - dx * pull;
    const by = y - dy * pull;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,240,220,0.55)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - dy * STRIKER_R, y + dx * STRIKER_R);
    ctx.lineTo(bx, by);
    ctx.lineTo(x + dy * STRIKER_R, y - dx * STRIKER_R);
    ctx.stroke();
    const hot = `hsl(${50 - power * 50}, 95%, ${60 - power * 8}%)`;
    const len = 34 + power * 70;
    ctx.fillStyle = hot;
    for (let d = STRIKER_R + 12; d < STRIKER_R + len; d += 16) {
      const t = (d - STRIKER_R) / len;
      ctx.globalAlpha = 1 - t * 0.7;
      ctx.beginPath();
      ctx.arc(x + dx * d, y + dy * d, 5 - t * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Arrow head.
    const tip = STRIKER_R + len + 6;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x + dx * tip, y + dy * tip);
    ctx.lineTo(x + dx * (tip - 14) - dy * 8, y + dy * (tip - 14) + dx * 8);
    ctx.lineTo(x + dx * (tip - 14) + dy * 8, y + dy * (tip - 14) - dx * 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Countdown ring lying on the ground around the striker. */
  private drawClockRing(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number) {
    const r = STRIKER_R + 14;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(30,10,4,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = frac > 0.5 ? '#8be28f' : frac > 0.25 ? '#f6c945' : '#ff5a4f';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.restore();
  }

  /** Last seconds, floating upright above the striker. */
  private drawCountdown(ctx: CanvasRenderingContext2D, x: number, y: number, secs: number) {
    ctx.save();
    ctx.translate(x, y - STRIKER_R * this.lift - STRIKER_R - 34);
    ctx.scale(1, this.stretch);
    ctx.font = '800 40px "Baloo Chettan 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(30,10,4,0.55)';
    ctx.fillText(String(secs), 2, 3);
    ctx.fillStyle = '#fff4e6';
    ctx.fillText(String(secs), 0, 0);
    ctx.restore();
  }
}
