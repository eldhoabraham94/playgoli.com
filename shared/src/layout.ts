import { CENTER, GOLI_R, RING_R, STRIKER_R } from './constants';

export interface GoliPos {
  id: number;
  x: number;
  y: number;
}

const ARMS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;
const DIAGONALS = [
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
] as const;

export const MAX_LAYOUT = 24;

/**
 * Tidy cross in the middle of the ring: four arms of goli, plus up to four
 * on the diagonals for counts that don't divide by 4. Never overlapping,
 * always fully inside the ring (checked by tests for every count).
 */
export function layoutGoli(n: number): GoliPos[] {
  if (!Number.isInteger(n) || n < 0 || n > MAX_LAYOUT) throw new RangeError(`bad goli count ${n}`);
  const perArm = Math.min(5, Math.floor(n / 4));
  const extra = n - perArm * 4;
  const step = perArm >= 4 ? 50 : 65;
  const pts: { x: number; y: number }[] = [];
  for (let k = 1; k <= perArm; k++) {
    for (const [ax, ay] of ARMS) pts.push({ x: CENTER + ax * k * step, y: CENTER + ay * k * step });
  }
  for (let i = 0; i < extra; i++) {
    const [dx, dy] = DIAGONALS[i];
    pts.push({ x: CENTER + dx * step, y: CENTER + dy * step });
  }
  return pts.map((p, id) => ({ id, x: p.x, y: p.y }));
}

/** Grid of candidate spots inside the ring, nearest the centre first (fixed order, so deterministic). */
const SPOTS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number; d: number }[] = [];
  const max = RING_R - GOLI_R - 12;
  const lim = Math.floor(max / 25) * 25;
  for (let gx = -lim; gx <= lim; gx += 25) {
    for (let gy = -lim; gy <= lim; gy += 25) {
      const d = gx * gx + gy * gy;
      if (d <= max * max) out.push({ x: CENTER + gx, y: CENTER + gy, d });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y).map(({ x, y }) => ({ x, y }));
})();

/**
 * Put goli back into the ring (e.g. a leaving player's pouch) on free spots that
 * don't touch existing goli or the striker.
 */
export function placeGoli(existing: readonly GoliPos[], ids: readonly number[], striker?: { x: number; y: number }): GoliPos[] {
  const placed = existing.slice();
  const gap = 2 * GOLI_R + 4;
  for (const id of ids) {
    const spot = SPOTS.find((p) => {
      if (striker) {
        const dx = p.x - striker.x;
        const dy = p.y - striker.y;
        if (dx * dx + dy * dy < (GOLI_R + STRIKER_R + 4) ** 2) return false;
      }
      return placed.every((g) => (g.x - p.x) ** 2 + (g.y - p.y) ** 2 >= gap * gap);
    });
    if (spot) placed.push({ id, x: spot.x, y: spot.y });
  }
  return placed;
}
