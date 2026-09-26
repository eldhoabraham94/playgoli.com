import { CENTER, GOLI_POINTS, GOLI_R, RAJA_POINTS, RING_R, STRIKER_R } from './constants';

export interface GoliPos {
  id: number;
  x: number;
  y: number;
}

export interface Layout {
  goli: GoliPos[];
  /** Points per goli, indexed by goli id. */
  values: number[];
}

const D = Math.SQRT1_2;
/** Opposite pairs first, so a part-filled ring stays symmetric. */
const ARMS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [D, D],
  [-D, -D],
  [D, -D],
  [-D, D],
];

export const MAX_LAYOUT = 24;

/** Points for a goli standing this far from the centre: the deeper, the more it's worth. */
export function pointsAt(dist: number): number {
  if (dist < 120) return GOLI_POINTS.blue;
  if (dist < 190) return GOLI_POINTS.green;
  return GOLI_POINTS.white;
}

/**
 * The starting pattern: `n` goli on 4 arms (small games) or 8 arms (big games),
 * rings spread evenly out towards the edge, and the red Raja (id n) in the centre.
 * Never overlapping, always fully inside the ring (tests check every count).
 */
export function layoutGoli(n: number): Layout {
  if (!Number.isInteger(n) || n < 0 || n > MAX_LAYOUT) throw new RangeError(`bad goli count ${n}`);
  const arms = n <= 8 ? 4 : 8;
  const perArm = Math.ceil(n / arms);
  const goli: GoliPos[] = [];
  const values: number[] = [];
  for (let k = 1; k <= perArm; k++) {
    const r = (250 * k) / (perArm + 0.5);
    for (let a = 0; a < arms && goli.length < n; a++) {
      const [dx, dy] = ARMS[a];
      goli.push({ id: goli.length, x: CENTER + dx * r, y: CENTER + dy * r });
      values.push(pointsAt(r));
    }
  }
  goli.push({ id: n, x: CENTER, y: CENTER });
  values.push(RAJA_POINTS);
  return { goli, values };
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
 * Put goli back into the ring (a foul, or a leaving player's pouch) on free spots that
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
