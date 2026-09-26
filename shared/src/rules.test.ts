import { describe, expect, it } from 'vitest';
import { CENTER, GOLI_R, RAJA_POINTS, RING_R, THROW_R } from './constants';
import { layoutGoli, MAX_LAYOUT } from './layout';
import {
  applyShot,
  currentShooter,
  newGame,
  removePlayer,
  score,
  skipTurn,
  slide,
  winners,
  type GameState,
  type ShotOutcome,
} from './rules';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Two-player game with a fixed order ['a', 'b']. Values: ids 0-3 are green (2), id 4 is the Raja. */
function twoPlayer(): GameState {
  const g = newGame(['a', 'b'], seeded(1));
  return { ...g, order: ['a', 'b'], turn: 0 };
}
const RAJA_ID = 4;

/**
 * A clean capture (found by searching the real physics): striker on the left of the throw
 * line, a full-power shot that clips the goli at the top edge out of the ring and carries
 * on out of the ring itself.
 */
function cleanCapture(s: GameState, targetId: number, extra: { id: number; x: number; y: number }[] = []) {
  const set = { ...s, goli: [{ id: targetId, x: 500, y: 238 }, ...extra] };
  const slid = slide(set, 'a', -Math.PI)!;
  const angle = Math.atan2(238 - 500, 500 - 92) + (3 * Math.PI) / 180;
  return { state: slid, input: { seq: slid.seq, angle, power: 1 } };
}
const OTHER = { id: 1, x: 500, y: 700 };

function ok(r: ShotOutcome) {
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('layout', () => {
  it('never overlaps, stays inside the ring, and puts the Raja in the centre, for every count', () => {
    for (let n = 0; n <= MAX_LAYOUT; n++) {
      const { goli, values } = layoutGoli(n);
      expect(goli).toHaveLength(n + 1);
      expect(values).toHaveLength(n + 1);
      expect(goli[n]).toEqual({ id: n, x: CENTER, y: CENTER });
      expect(values[n]).toBe(RAJA_POINTS);
      for (const v of values.slice(0, n)) expect([1, 2, 3]).toContain(v);
      for (const p of goli) expect(Math.hypot(p.x - CENTER, p.y - CENTER) + GOLI_R).toBeLessThan(RING_R);
      for (let i = 0; i < goli.length; i++)
        for (let j = i + 1; j < goli.length; j++)
          expect(Math.hypot(goli[i].x - goli[j].x, goli[i].y - goli[j].y)).toBeGreaterThanOrEqual(2 * GOLI_R + 4);
    }
  });

  it('is worth more the deeper a goli sits', () => {
    const { goli, values } = layoutGoli(20);
    const d = (i: number) => Math.hypot(goli[i].x - CENTER, goli[i].y - CENTER);
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) if (d(i) < d(j) - 1) expect(values[i]).toBeGreaterThanOrEqual(values[j]);
    expect(new Set(values.slice(0, 20))).toEqual(new Set([1, 2, 3]));
  });
});

describe('rules', () => {
  it('starts with 2 goli per player plus the Raja, and the striker in hand on the throw line', () => {
    const g = newGame(['a', 'b', 'c'], seeded(3));
    expect(g.goli).toHaveLength(7);
    expect(g.values).toHaveLength(7);
    expect(g.striker.inHand).toBe(true);
    expect(Math.hypot(g.striker.x - CENTER, g.striker.y - CENTER)).toBeCloseTo(THROW_R, 2);
    expect([...g.order].sort()).toEqual(['a', 'b', 'c']);
  });

  it('same shot gives an identical result twice (determinism)', () => {
    const rng = seeded(42);
    let s = newGame(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], seeded(7));
    for (let k = 0; k < 40 && s.status === 'playing'; k++) {
      const shooter = currentShooter(s)!;
      if (s.striker.inHand) s = slide(s, shooter, rng() * Math.PI * 2)!;
      const input = { seq: s.seq, angle: rng() * Math.PI * 2, power: 0.2 + rng() * 0.8 };
      const r1 = ok(applyShot(s, shooter, input));
      const r2 = ok(applyShot(s, shooter, input));
      expect(JSON.stringify(r1.shot)).toBe(JSON.stringify(r2.shot));
      s = r1.state;
    }
  });

  it('clean capture: the goli and its points go to the shooter, then play passes on', () => {
    const { state, input } = cleanCapture(twoPlayer(), 0, [OTHER]);
    const r = ok(applyShot(state, 'a', input));
    expect(r.shot.knockedOut).toEqual([0]);
    expect(r.shot.foul).toBeNull();
    expect(r.shot.points).toBe(2);
    expect(r.shot.bonus).toBe(false);
    expect(score(r.state, 'a')).toBe(2);
    expect(r.state.goli.map((g) => g.id)).toEqual([1]);
    expect(currentShooter(r.state)).toBe('b');
    expect(r.state.striker.inHand).toBe(true);
  });

  it('the Raja: 5 points and one extra shot from where the striker stopped', () => {
    const { state, input } = cleanCapture(twoPlayer(), RAJA_ID, [OTHER]);
    const r = ok(applyShot(state, 'a', input));
    expect(r.shot.knockedOut).toEqual([RAJA_ID]);
    expect(r.shot.points).toBe(RAJA_POINTS);
    expect(r.shot.bonus).toBe(true);
    expect(score(r.state, 'a')).toBe(RAJA_POINTS);
    expect(currentShooter(r.state)).toBe('a');
    expect(r.state.shotInTurn).toBe(1);
    expect(r.state.striker).toMatchObject({ x: r.shot.strikerEnd.x, y: r.shot.strikerEnd.y, inHand: false });

    // The bonus is a single shot: whatever it does, play then passes.
    const next = ok(applyShot(r.state, 'a', { seq: r.state.seq, angle: 0, power: 0.1 }));
    expect(currentShooter(next.state)).toBe('b');
  });

  it('a striker that stops inside the ring is fine: the capture counts', () => {
    const s: GameState = {
      ...twoPlayer(),
      goli: [{ id: 0, x: 500, y: 250 }, OTHER],
      striker: { x: 500, y: 420, inHand: false, angle: 0 },
    };
    const r = ok(applyShot(s, 'a', { seq: s.seq, angle: -Math.PI / 2, power: 0.55 }));
    expect(Math.hypot(r.shot.strikerEnd.x - CENTER, r.shot.strikerEnd.y - CENTER)).toBeLessThan(RING_R);
    expect(r.shot.knockedOut).toEqual([0]);
    expect(r.shot.foul).toBeNull();
    expect(r.shot.points).toBe(2);
    expect(score(r.state, 'a')).toBe(2);
    expect(r.state.goli.map((g) => g.id)).toEqual([1]);
    expect(currentShooter(r.state)).toBe('b');
  });

  it('foul: goli knocked out on a shot whose striker leaves the ground go back in', () => {
    // Glancing full-power hit: the goli is clipped out, the striker flies off the board.
    const s: GameState = {
      ...twoPlayer(),
      goli: [{ id: 0, x: 500, y: 235 }, OTHER],
      striker: { x: 540, y: 420, inHand: false, angle: 0 },
    };
    const r = ok(applyShot(s, 'a', { seq: s.seq, angle: -Math.PI / 2, power: 1 }));
    expect(r.shot.knockedOut).toContain(0);
    expect(r.shot.foul).toBe('off-board');
    expect(r.shot.points).toBe(0);
    expect(score(r.state, 'a')).toBe(0);
    expect(r.state.goli.map((g) => g.id).sort()).toEqual([0, 1]);
    for (const g of r.state.goli) expect(Math.hypot(g.x - CENTER, g.y - CENTER)).toBeLessThan(RING_R);
    expect(currentShooter(r.state)).toBe('b');
  });

  it('foul: a striker that leaves the ground ends the turn', () => {
    const s = twoPlayer();
    const r = ok(applyShot(s, 'a', { seq: s.seq, angle: Math.PI / 2, power: 1 }));
    expect(r.shot.foul).toBe('off-board');
    expect(r.shot.strikerEnd.onBoard).toBe(false);
    expect(r.shot.points).toBe(0);
    expect(currentShooter(r.state)).toBe('b');
  });

  it('miss: a striker that stays outside the ring is fine, play passes on', () => {
    const s = twoPlayer();
    const r = ok(applyShot(s, 'a', { seq: s.seq, angle: 0, power: 0.2 }));
    expect(r.shot.knockedOut).toEqual([]);
    expect(r.shot.foul).toBeNull();
    expect(currentShooter(r.state)).toBe('b');
    expect(r.state.striker.inHand).toBe(true);
  });

  it('game ends when the ring is empty; most points wins, ties share', () => {
    const base = { ...twoPlayer(), pouches: { a: [], b: [2] } }; // b already has 2 points
    const { state, input } = cleanCapture(base, 0);
    const r = ok(applyShot(state, 'a', input));
    expect(r.state.status).toBe('over');
    expect(currentShooter(r.state)).toBeNull();
    expect(score(r.state, 'a')).toBe(2);
    expect(winners(r.state).sort()).toEqual(['a', 'b']);
  });

  it('rejects wrong player, stale seq and out-of-range values', () => {
    const s = twoPlayer();
    expect(applyShot(s, 'b', { seq: s.seq, angle: 0, power: 0.5 })).toEqual({ ok: false, error: 'not-your-turn' });
    expect(applyShot(s, 'a', { seq: s.seq + 1, angle: 0, power: 0.5 })).toEqual({ ok: false, error: 'stale-seq' });
    for (const bad of [0, -0.1, 1.01, NaN, Infinity])
      expect(applyShot(s, 'a', { seq: s.seq, angle: 0, power: bad }).ok).toBe(false);
    expect(applyShot(s, 'a', { seq: s.seq, angle: NaN, power: 0.5 }).ok).toBe(false);
  });

  it('skipTurn passes play (shot clock timeout)', () => {
    const s = twoPlayer();
    const t = skipTurn(s);
    expect(currentShooter(t)).toBe('b');
    expect(t.seq).toBe(s.seq + 1);
    expect(currentShooter(skipTurn(t))).toBe('a');
  });

  it('slide moves the in-hand striker along the throw line, only for the shooter', () => {
    const s = twoPlayer();
    const t = slide(s, 'a', 0)!;
    expect(t.striker).toMatchObject({ x: CENTER + THROW_R, y: CENTER, inHand: true });
    expect(slide(s, 'b', 0)).toBeNull();
    const notInHand = { ...s, striker: { ...s.striker, inHand: false } };
    expect(slide(notInHand, 'a', 0)).toBeNull();
  });
});

describe('removePlayer', () => {
  it("returns the leaver's pouch to the ring without overlaps and fixes the turn index", () => {
    let s = newGame(['a', 'b', 'c'], seeded(2));
    s = { ...s, order: ['a', 'b', 'c'], turn: 2, goli: s.goli.slice(3), pouches: { a: [0, 1, 2], b: [], c: [] } };
    const t = removePlayer(s, 'a');
    expect(t.order).toEqual(['b', 'c']);
    expect(t.turn).toBe(1); // still c's turn
    expect(currentShooter(t)).toBe('c');
    expect(t.seq).toBe(s.seq); // c's pending shot stays valid
    expect(t.goli).toHaveLength(s.goli.length + 3);
    for (let i = 0; i < t.goli.length; i++) {
      const g = t.goli[i];
      expect(Math.hypot(g.x - CENTER, g.y - CENTER) + GOLI_R).toBeLessThan(RING_R);
      for (let j = i + 1; j < t.goli.length; j++)
        expect(Math.hypot(g.x - t.goli[j].x, g.y - t.goli[j].y)).toBeGreaterThanOrEqual(2 * GOLI_R);
    }
  });

  it('passes play on when the current shooter leaves', () => {
    let s = newGame(['a', 'b', 'c'], seeded(2));
    s = { ...s, order: ['a', 'b', 'c'], turn: 2 };
    const t = removePlayer(s, 'c');
    expect(currentShooter(t)).toBe('a');
    expect(t.striker.inHand).toBe(true);
    expect(t.seq).toBe(s.seq + 1);
  });
});
