/**
 * Canvas drawing: laterite ground, scratched ring, glass cat's-eye marbles.
 * Everything static is pre-rendered once per canvas size; each frame just
 * blits sprites. Drawing uses logical 1000×1000 coordinates.
 */
import { BOARD, CENTER, GOLI_R, RING_R, STRIKER_R, THROW_R } from '@goli/shared';

export interface SceneMarble {
  id: number;
  x: number;
  y: number;
  rot: number;
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

const GLASS = ['#cfeee9', '#9fdcbf', '#f3c27a', '#a9c8f2', '#e6e0d6', '#f2a6a0'];
const EYES = ['#e63946', '#ffb703', '#06d6a0', '#1f7ae0', '#ff6b35', '#c1121f', '#2ec4b6'];

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

function makeGround(px: number): HTMLCanvasElement {
  const c = canvas(px);
  const g = c.getContext('2d')!;
  g.scale(px / BOARD, px / BOARD);
  const rnd = mulberry32(20240925);

  g.fillStyle = '#a14e2e';
  g.fillRect(0, 0, BOARD, BOARD);

  // Mottled laterite: soft darker and lighter patches.
  for (let i = 0; i < 200; i++) {
    const x = rnd() * BOARD;
    const y = rnd() * BOARD;
    const r = 30 + rnd() * 130;
    const dark = rnd() < 0.55;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, dark ? 'rgba(92,34,16,0.20)' : 'rgba(222,138,90,0.17)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Laterite pores: small pits with a lit lower rim.
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * BOARD;
    const y = rnd() * BOARD;
    const r = 0.8 + rnd() * 2.8;
    g.fillStyle = `rgba(58,20,8,${0.25 + rnd() * 0.35})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(242,176,128,0.22)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(x, y, r, 0.2, Math.PI - 0.2);
    g.stroke();
  }

  // Grit.
  const grit = ['rgba(60,22,10,0.5)', 'rgba(230,160,112,0.45)', 'rgba(250,215,180,0.35)', 'rgba(40,14,6,0.5)'];
  for (let i = 0; i < 7000; i++) {
    g.fillStyle = grit[i % grit.length];
    g.fillRect(rnd() * BOARD, rnd() * BOARD, 0.6 + rnd() * 1.4, 0.6 + rnd() * 1.4);
  }

  // Pebbles.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * BOARD;
    const y = rnd() * BOARD;
    const r = 2.5 + rnd() * 6;
    const rot = rnd() * Math.PI;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(30,10,4,0.35)';
    g.beginPath();
    g.ellipse(1.2, 1.8, r, r * 0.7, 0, 0, Math.PI * 2);
    g.fill();
    const tone = rnd() < 0.5 ? '#c98a5e' : '#8a6a58';
    const pg = g.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    pg.addColorStop(0, mix(tone, '#ffffff', 0.35));
    pg.addColorStop(1, tone);
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // Faint old scratches and footprints of earlier games.
  g.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const x = rnd() * BOARD;
    const y = rnd() * BOARD;
    const a = rnd() * Math.PI * 2;
    const len = 15 + rnd() * 50;
    g.strokeStyle = 'rgba(60,22,10,0.22)';
    g.lineWidth = 1 + rnd() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }

  // Vignette towards the edges of the ground.
  const v = g.createRadialGradient(CENTER, CENTER, 380, CENTER, CENTER, 760);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(36,12,4,0.5)');
  g.fillStyle = v;
  g.fillRect(0, 0, BOARD, BOARD);

  // Throw line: light dashed scratch.
  g.setLineDash([14, 12]);
  g.strokeStyle = 'rgba(255,224,192,0.32)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(CENTER, CENTER, THROW_R, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);

  scratchedRing(g, rnd);
  return c;
}

/** The ring, scratched into the soil with a stick: a dark groove with a lit lip, drawn in several wobbly passes. */
function scratchedRing(g: CanvasRenderingContext2D, rnd: () => number) {
  const p1 = rnd() * 6.28;
  const p2 = rnd() * 6.28;
  const p3 = rnd() * 6.28;
  const passes = [
    { w: 9, c: 'rgba(52,18,6,0.45)', dx: 0, dy: 0, reps: 1 },
    { w: 3.5, c: 'rgba(34,10,3,0.75)', dx: 0, dy: 0, reps: 3 },
    { w: 1.6, c: 'rgba(248,196,152,0.45)', dx: 0.9, dy: 2.4, reps: 2 },
  ];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const p of passes) {
    for (let rep = 0; rep < p.reps; rep++) {
      g.strokeStyle = p.c;
      g.lineWidth = p.w * (0.8 + rnd() * 0.4);
      g.beginPath();
      const start = rnd() * 0.3;
      for (let a = start; a <= Math.PI * 2 + start + 0.02; a += Math.PI / 150) {
        const r =
          RING_R + 2.4 * Math.sin(3 * a + p1) + 1.4 * Math.sin(7 * a + p2) + 0.8 * Math.sin(17 * a + p3) + (rnd() - 0.5) * 1.3 + rep * 0.9;
        const x = CENTER + Math.cos(a) * r + p.dx;
        const y = CENTER + Math.sin(a) * r + p.dy;
        if (a === start) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // A few stray scratches where the stick slipped.
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const span = 0.08 + rnd() * 0.2;
    const r = RING_R + (rnd() - 0.5) * 12;
    g.strokeStyle = 'rgba(40,12,4,0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(CENTER, CENTER, r, a, a + span);
    g.stroke();
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

  // Depth: darker rim, light pooling on the far side.
  const rim = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(20,8,2,0.45)');
  g.fillStyle = rim;
  g.fillRect(-r, -r, r * 2, r * 2);
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
  // Caustic: light passing through the glass, bright on the lower right.
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = r * 0.09;
  g.beginPath();
  g.arc(0, 0, r * 0.8, 0.15 * Math.PI, 0.55 * Math.PI);
  g.stroke();
  return c;
}

function makeShadow(r: number, scale: number): HTMLCanvasElement {
  const half = r * 1.4;
  const c = canvas(half * 2 * scale);
  const g = c.getContext('2d')!;
  g.scale(c.width / (half * 2), c.height / (half * 2));
  g.translate(half, half);
  const sg = g.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.3);
  sg.addColorStop(0, 'rgba(25,8,2,0.55)');
  sg.addColorStop(1, 'rgba(25,8,2,0)');
  g.fillStyle = sg;
  g.beginPath();
  g.arc(0, 0, r * 1.35, 0, Math.PI * 2);
  g.fill();
  return c;
}

export function goliLook(id: number) {
  return { glass: GLASS[id % GLASS.length], eye: EYES[(id * 3 + 1) % EYES.length] };
}

export class Renderer {
  private px = 0;
  private scale = 1;
  private ground: HTMLCanvasElement | null = null;
  private sprites = new Map<string, HTMLCanvasElement>();

  resize(px: number) {
    if (px === this.px) return;
    this.px = px;
    this.scale = px / BOARD;
    this.ground = makeGround(px);
    this.sprites.clear();
  }

  private sprite(key: string, make: () => HTMLCanvasElement) {
    let s = this.sprites.get(key);
    if (!s) this.sprites.set(key, (s = make()));
    return s;
  }

  private drawMarble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, body: HTMLCanvasElement) {
    const shadow = this.sprite(`shadow${r}`, () => makeShadow(r, this.scale));
    const shine = this.sprite(`shine${r}`, () => makeShine(r, this.scale));
    const sh = r * 1.4;
    ctx.drawImage(shadow, x + r * 0.28 - sh, y + r * 0.4 - sh, sh * 2, sh * 2);
    const h = r + 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(body, -h, -h, h * 2, h * 2);
    ctx.restore();
    ctx.drawImage(shine, x - h, y - h, h * 2, h * 2);
  }

  draw(ctx: CanvasRenderingContext2D, scene: Scene) {
    const s = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.ground) ctx.drawImage(this.ground, 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);

    if (scene.throwLine) {
      ctx.save();
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = -scene.time * 0.02;
      ctx.strokeStyle = scene.throwLine;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(scene.time * 0.005);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, THROW_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const m of scene.goli) {
      const look = goliLook(m.id);
      const body = this.sprite(`goli${m.id % 42}`, () => makeMarble(GOLI_R, s, look.glass, look.eye, m.id + 1));
      this.drawMarble(ctx, m.x, m.y, GOLI_R, m.rot, body);
    }

    const st = scene.striker;
    if (st) {
      if (scene.aim) this.drawAim(ctx, st.x, st.y, scene.aim.angle, scene.aim.power);
      const body = this.sprite(`striker${st.color}`, () => makeMarble(STRIKER_R, s, st.color, '#ffffff', 99));
      this.drawMarble(ctx, st.x, st.y, STRIKER_R, st.rot, body);
      if (scene.clock !== null) this.drawClock(ctx, st.x, st.y, scene.clock, scene.clockSecs);
    }
  }

  private drawAim(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, power: number) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const pull = 40 + power * 190;
    // Catapult band: from the striker back towards the finger.
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
    // Direction dots, longer and hotter with more power.
    const hot = `hsl(${50 - power * 50}, 95%, ${60 - power * 8}%)`;
    const len = 60 + power * 320;
    ctx.fillStyle = hot;
    for (let d = STRIKER_R + 14; d < STRIKER_R + len; d += 18) {
      const t = (d - STRIKER_R) / len;
      ctx.globalAlpha = 1 - t * 0.8;
      ctx.beginPath();
      ctx.arc(x + dx * d, y + dy * d, 5 - t * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawClock(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, secs: number | null) {
    const r = STRIKER_R + 13;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(30,10,4,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = frac > 0.5 ? '#8be28f' : frac > 0.25 ? '#f6c945' : '#ff5a4f';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    if (secs !== null && secs <= 5) {
      ctx.fillStyle = '#fff4e6';
      ctx.font = '700 34px "Baloo Chettan 2", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(secs), x, y - r - 26);
    }
    ctx.restore();
  }
}
