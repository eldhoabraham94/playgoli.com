/**
 * Deterministic marble physics.
 *
 * RULE: only + - * / and sqrt in this file. Those are correctly rounded
 * IEEE-754 operations, so every JS engine (browsers, Node) produces bit-identical
 * results. No trig, hypot, pow etc. (a test enforces this).
 */
import {
  BOARD,
  DT,
  FRICTION_A,
  FRICTION_B,
  GOLI_R,
  MAX_SIM_STEPS,
  RESTITUTION,
  STOP_SPEED,
  STRIKER_R,
} from './constants';

export interface Vec {
  x: number;
  y: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  m: number;
  /** False once the centre has left the square board; the body is then out of play. */
  onBoard: boolean;
}

export interface Sim {
  /** bodies[0] is the striker, bodies[i + 1] is goli[i]. */
  bodies: Body[];
  steps: number;
}

function makeBody(x: number, y: number, r: number, vx: number, vy: number): Body {
  return { x, y, vx, vy, r, m: r * r, onBoard: true };
}

export function createSim(striker: Vec, velocity: Velocity, goli: readonly Vec[]): Sim {
  const bodies = [makeBody(striker.x, striker.y, STRIKER_R, velocity.vx, velocity.vy)];
  for (const g of goli) bodies.push(makeBody(g.x, g.y, GOLI_R, 0, 0));
  return { bodies, steps: 0 };
}

function moving(b: Body): boolean {
  return b.vx !== 0 || b.vy !== 0;
}

/** Called for each collision with the body indices and the impulse (for dust/sound; never affects results). */
export type HitHook = (i: number, j: number, impulse: number) => void;

export function stepSim(sim: Sim, onHit?: HitHook): void {
  const bodies = sim.bodies;
  const n = bodies.length;

  // 1. Integrate positions; anything whose centre leaves the board is out of play.
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!b.onBoard || !moving(b)) continue;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    if (b.x < 0 || b.x > BOARD || b.y < 0 || b.y > BOARD) {
      b.onBoard = false;
      b.vx = 0;
      b.vy = 0;
    }
  }

  // 2. Resolve collisions pairwise in fixed index order.
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    if (!a.onBoard) continue;
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      if (!b.onBoard) continue;
      if (!moving(a) && !moving(b)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minD = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const imp = (-(1 + RESTITUTION) * vn) / (1 / a.m + 1 / b.m);
        a.vx -= (imp / a.m) * nx;
        a.vy -= (imp / a.m) * ny;
        b.vx += (imp / b.m) * nx;
        b.vy += (imp / b.m) * ny;
        if (onHit) onHit(i, j, imp);
      }
      // Push apart so they never stay overlapped (split by inverse mass).
      const overlap = minD - d;
      const total = a.m + b.m;
      const pa = (overlap * b.m) / total;
      const pb = (overlap * a.m) / total;
      a.x -= nx * pa;
      a.y -= ny * pa;
      b.x += nx * pb;
      b.y += ny * pb;
    }
  }

  // 3. Rolling friction: speed -= (A + B * speed) * dt, stop below STOP_SPEED.
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!b.onBoard || !moving(b)) continue;
    const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    const ns = s - (FRICTION_A + FRICTION_B * s) * DT;
    if (ns < STOP_SPEED) {
      b.vx = 0;
      b.vy = 0;
    } else {
      const k = ns / s;
      b.vx *= k;
      b.vy *= k;
    }
  }

  sim.steps++;
}

export function isAtRest(sim: Sim): boolean {
  for (const b of sim.bodies) if (b.onBoard && moving(b)) return false;
  return true;
}

/** True when the simulation is finished (at rest or hit the step cap). */
export function isSimDone(sim: Sim): boolean {
  return sim.steps >= MAX_SIM_STEPS || isAtRest(sim);
}

/** Force everything to stop (used when the step cap is hit). */
export function freezeSim(sim: Sim): void {
  for (const b of sim.bodies) {
    b.vx = 0;
    b.vy = 0;
  }
}

export function runToRest(sim: Sim): Sim {
  while (!isSimDone(sim)) stepSim(sim);
  freezeSim(sim);
  return sim;
}
