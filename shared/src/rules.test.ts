import { describe, expect, it } from 'vitest';
import { CENTER, GOLI_R, MAX_SHOTS_PER_TURN, RING_R, THROW_R } from './constants';
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

/** Two-player game with a fixed order ['a', 'b']. */
function twoPlayer(): GameState {
  const g = newGame(['a', 'b'], seeded(1));
  return { ...g, order: ['a', 'b'], turn: 0 };
}

/** Striker just inside the ring, one goli between it and the ring edge. */
function captureSetup(s: GameState): GameState {
  return {
    ...s,
    goli: [
      { id: 0, x: 500, y: 250 },
      { id: 1, x: 500, y: 700 },
    ],
    striker: { x: 500, y: 420, inHand: false, angle: 0 },
  };
}
const CAPTURE_SHOT = { angle: -Math.PI / 2, power: 0.35 };

function ok(r: ShotOutcome) {
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('layout', () => {
  it('never overlaps and stays fully inside the ring for every count', () => {
    for (let n = 0; n <= MAX_LAYOUT; n++) {
      const g = layoutGoli(n);
      expect(g).toHaveLength(n);
      for (const p of g) expect(Math.hypot(p.x - CENTER, p.y - CENTER) + GOLI_R).toBeLessThan(RING_R);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          expect(Math.hypot(g[i].x - g[j].x, g[i].y - g[j].y)).toBeGreaterThanOrEqual(2 * GOLI_R);
    }
  });
});

describe('rules', () => {
  it('starts with 2 goli per player and the striker in hand on the throw line', () => {
    const g = newGame(['a', 'b', 'c'], seeded(3));
    expect(g.goli).toHaveLength(6);
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

  it('capture: knocked-out goli go to the shooter; with one attempt each, play passes on', () => {
    const s = captureSetup(twoPlayer());
    const r = ok(applyShot(s, 'a', { seq: s.seq, ...CAPTURE_SHOT }));
    expect(r.shot.knockedOut).toEqual([0]);
    expect(r.shot.foul).toBe(false);
    expect(score(r.state, 'a')).toBe(1);
    expect(r.state.goli.map((g) => g.id)).toEqual([1]);
    expect(r.state.seq).toBe(s.seq + 1);
    expect(MAX_SHOTS_PER_TURN).toBe(1);
    expect(currentShooter(r.state)).toBe('b');
    expect(r.state.shotInTurn).toBe(0);
    expect(r.state.striker.inHand).toBe(true);
  });

  it('miss: turn passes and the next striker is in hand', () => {
    const s = twoPlayer();
    // From the bottom of the throw line, roll gently sideways: hits nothing.
    const r = ok(applyShot(s, 'a', { seq: s.seq, angle: 0, power: 0.2 }));
    expect(r.shot.knockedOut).toEqual([]);
    expect(r.shot.foul).toBe(false);
    expect(currentShooter(r.state)).toBe('b');
    expect(r.state.striker.inHand).toBe(true);
    expect(r.state.shotInTurn).toBe(0);
  });

  it('foul: striker leaving the board ends the turn', () => {
    const s = twoPlayer();
    const r = ok(applyShot(s, 'a', { seq: s.seq, angle: Math.PI / 2, power: 1 }));
    expect(r.shot.foul).toBe(true);
    expect(r.shot.strikerEnd.onBoard).toBe(false);
    expect(currentShooter(r.state)).toBe('b');
  });

  it('foul after a capture still ends the turn (goli are kept)', () => {
    // Glancing hit at full power: the goli is clipped out, the striker flies on off the board.
    const s: GameState = {
      ...twoPlayer(),
      goli: [
        { id: 0, x: 500, y: 235 },
        { id: 1, x: 500, y: 700 },
      ],
      striker: { x: 540, y: 420, inHand: false, angle: 0 },
    };
    const r = ok(applyShot(s, 'a', { seq: s.seq, angle: -Math.PI / 2, power: 1 }));
    expect(r.shot.knockedOut).toContain(0);
    expect(r.shot.foul).toBe(true);
    expect(score(r.state, 'a')).toBeGreaterThan(0);
    expect(currentShooter(r.state)).toBe('b');
  });

  it(`caps a turn at ${MAX_SHOTS_PER_TURN} shots even if every shot captures`, () => {
    let s = twoPlayer();
    for (let shot = 1; shot <= MAX_SHOTS_PER_TURN; shot++) {
      s = captureSetup({ ...s, goli: [] });
      const r = ok(applyShot(s, 'a', { seq: s.seq, ...CAPTURE_SHOT }));
      expect(r.shot.knockedOut).toEqual([0]);
      s = r.state;
      expect(currentShooter(s)).toBe(shot < MAX_SHOTS_PER_TURN ? 'a' : 'b');
    }
    expect(s.shotInTurn).toBe(0);
    expect(s.striker.inHand).toBe(true);
    expect(score(s, 'a')).toBe(MAX_SHOTS_PER_TURN);
  });

  it('game ends when the ring is empty; most goli wins, ties share', () => {
    let s = twoPlayer();
    s = { ...s, goli: [{ id: 0, x: 500, y: 250 }], striker: { x: 500, y: 420, inHand: false, angle: 0 } };
    s = { ...s, pouches: { a: [], b: [5] } };
    const r = ok(applyShot(s, 'a', { seq: s.seq, ...CAPTURE_SHOT }));
    expect(r.state.status).toBe('over');
    expect(currentShooter(r.state)).toBeNull();
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
    s = { ...s, order: ['a', 'b', 'c'], turn: 2, pouches: { a: [50, 51, 52], b: [], c: [] } };
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
