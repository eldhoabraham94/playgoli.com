/**
 * Pure game rules. Used by the local practice game and by the server referee.
 * Trig (for turning an angle into a position/velocity) lives here, OUTSIDE the
 * simulation, and results are quantized so they travel as exact numbers.
 */
import {
  CENTER,
  GOLI_PER_PLAYER,
  MAX_SHOTS_PER_TURN,
  MAX_SPEED,
  RAJA_POINTS,
  RING_R,
  THROW_R,
} from './constants';
import { layoutGoli, placeGoli, type GoliPos } from './layout';
import { createSim, runToRest, type Vec, type Velocity } from './physics';

export interface Striker {
  x: number;
  y: number;
  /** In hand: sits on the throw line and can be slid around it. */
  inHand: boolean;
  angle: number;
}

export interface GameState {
  status: 'playing' | 'over';
  /** Player ids in turn order. */
  order: string[];
  /** Index into order of the current shooter. */
  turn: number;
  /** Shots already taken this turn (0 .. MAX_SHOTS_PER_TURN - 1). */
  shotInTurn: number;
  striker: Striker;
  /** Goli still in the ring. */
  goli: GoliPos[];
  /** Points per goli, indexed by goli id (by starting ring; the Raja is RAJA_POINTS). */
  values: number[];
  /** Goli ids each player has won. */
  pouches: Record<string, number[]>;
  /** Increments on every shot and turn change; shots must quote it. */
  seq: number;
}

export interface ShotInput {
  seq: number;
  angle: number;
  /** 0 < power <= 1 */
  power: number;
}

/** Striker left the ground: the shot scores nothing. */
export type Foul = 'off-board';

export interface ShotResult {
  seq: number;
  shooterId: string;
  start: Vec;
  velocity: Velocity;
  /** Ring goli before the shot (what the animation starts from). */
  before: GoliPos[];
  strikerEnd: { x: number; y: number; onBoard: boolean };
  /** Goli that left the ring (on a foul they go back in). */
  knockedOut: number[];
  foul: Foul | null;
  /** Points the shooter won with this shot. */
  points: number;
  /** Knocked out the Raja cleanly: one more shot. */
  bonus: boolean;
  steps: number;
  /** Authoritative state after the shot — every client snaps to this. */
  after: GameState;
}

export type ShotOutcome = { ok: true; state: GameState; shot: ShotResult } | { ok: false; error: string };

/** Round to 1/1000 so values are canonical regardless of trig last-bit noise. */
export function q(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r; // no -0
}

export function throwLinePoint(angle: number): Vec {
  return { x: q(CENTER + THROW_R * Math.cos(angle)), y: q(CENTER + THROW_R * Math.sin(angle)) };
}

/** Where player number `turn` of `n` starts: spread around the table, first at the bottom. */
export function seatAngle(turn: number, n: number): number {
  return Math.PI / 2 + (2 * Math.PI * turn) / Math.max(1, n);
}

function strikerInHand(angle: number): Striker {
  return { ...throwLinePoint(angle), inHand: true, angle };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(playerIds: readonly string[], rng: () => number = Math.random): GameState {
  if (playerIds.length < 1) throw new Error('need at least one player');
  const order = shuffle(playerIds, rng);
  const { goli, values } = layoutGoli(order.length * GOLI_PER_PLAYER);
  return {
    status: 'playing',
    order,
    turn: 0,
    shotInTurn: 0,
    striker: strikerInHand(seatAngle(0, order.length)),
    goli,
    values,
    pouches: Object.fromEntries(order.map((id) => [id, []])),
    seq: 0,
  };
}

export function currentShooter(s: GameState): string | null {
  return s.status === 'playing' ? (s.order[s.turn] ?? null) : null;
}

/** A player's points: the value of every goli in their pouch. */
export function score(s: GameState, playerId: string): number {
  let total = 0;
  for (const id of s.pouches[playerId] ?? []) total += s.values[id] ?? 0;
  return total;
}

export const isRaja = (s: GameState, goliId: number) => s.values[goliId] === RAJA_POINTS;

/** Pass play to the next player around the table. Bumps seq. */
function advanceTurn(s: GameState): GameState {
  const turn = (s.turn + 1) % s.order.length;
  return {
    ...s,
    turn,
    shotInTurn: 0,
    striker: strikerInHand(seatAngle(turn, s.order.length)),
    seq: s.seq + 1,
  };
}

/** Shot clock ran out (or shooter is away): skip to the next player. */
export function skipTurn(s: GameState): GameState {
  return s.status === 'playing' ? advanceTurn(s) : s;
}

/** Slide the in-hand striker along the throw line. Returns null if not allowed. */
export function slide(s: GameState, playerId: string, angle: number): GameState | null {
  if (currentShooter(s) !== playerId || !s.striker.inHand || !Number.isFinite(angle)) return null;
  return { ...s, striker: strikerInHand(angle) };
}

export function shotVelocity(angle: number, power: number): Velocity {
  const speed = power * MAX_SPEED;
  return { vx: q(speed * Math.cos(angle)), vy: q(speed * Math.sin(angle)) };
}

export function applyShot(s: GameState, playerId: string, input: ShotInput): ShotOutcome {
  if (s.status !== 'playing') return { ok: false, error: 'not-playing' };
  if (currentShooter(s) !== playerId) return { ok: false, error: 'not-your-turn' };
  if (input.seq !== s.seq) return { ok: false, error: 'stale-seq' };
  const { angle, power } = input;
  if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0 || power > 1) {
    return { ok: false, error: 'bad-shot' };
  }

  const start = { x: s.striker.x, y: s.striker.y };
  const velocity = shotVelocity(angle, power);
  const before = s.goli.map((g) => ({ ...g }));
  const sim = runToRest(createSim(start, velocity, before));

  const sb = sim.bodies[0];
  // The striker must stay on the ground (stopping inside the ring is fine).
  const foul: Foul | null = sb.onBoard ? null : 'off-board';
  const knockedOut: number[] = [];
  let remaining: GoliPos[] = [];
  before.forEach((g, i) => {
    const b = sim.bodies[i + 1];
    const dx = b.x - CENTER;
    const dy = b.y - CENTER;
    if (!b.onBoard || dx * dx + dy * dy > RING_R * RING_R) knockedOut.push(g.id);
    else remaining.push({ id: g.id, x: b.x, y: b.y });
  });

  // A foul scores nothing: whatever left the ring goes back in.
  const won = foul ? [] : knockedOut;
  if (foul && knockedOut.length) remaining = placeGoli(remaining, knockedOut);
  const points = won.reduce((t, id) => t + (s.values[id] ?? 0), 0);
  const bonus = won.some((id) => isRaja(s, id));

  const pouches = { ...s.pouches, [playerId]: [...(s.pouches[playerId] ?? []), ...won] };
  const base: GameState = { ...s, goli: remaining, pouches };

  let after: GameState;
  if (remaining.length === 0) {
    after = { ...base, status: 'over', seq: s.seq + 1 };
  } else if (won.length === 0 || !(bonus || s.shotInTurn + 1 < MAX_SHOTS_PER_TURN)) {
    after = advanceTurn(base);
  } else {
    after = {
      ...base,
      shotInTurn: s.shotInTurn + 1,
      striker: { x: sb.x, y: sb.y, inHand: false, angle: s.striker.angle },
      seq: s.seq + 1,
    };
  }

  return {
    ok: true,
    state: after,
    shot: {
      seq: s.seq,
      shooterId: playerId,
      start,
      velocity,
      before,
      strikerEnd: { x: sb.x, y: sb.y, onBoard: sb.onBoard },
      knockedOut,
      foul,
      points,
      bonus,
      steps: sim.steps,
      after,
    },
  };
}

/**
 * A player left for good: drop them from the turn order and put the goli they
 * had won back into the ring. If it was their turn, play passes on.
 */
export function removePlayer(s: GameState, playerId: string): GameState {
  const idx = s.order.indexOf(playerId);
  if (idx < 0 || s.status !== 'playing') return s;
  const order = s.order.filter((id) => id !== playerId);
  const pouches = { ...s.pouches };
  const returned = pouches[playerId] ?? [];
  delete pouches[playerId];
  const goli = placeGoli(s.goli, returned, s.striker.inHand ? undefined : s.striker);
  if (order.length === 0) return { ...s, order, pouches, goli, status: 'over', seq: s.seq + 1 };

  if (idx === s.turn) {
    const turn = idx % order.length;
    return {
      ...s,
      order,
      pouches,
      goli,
      turn,
      shotInTurn: 0,
      striker: strikerInHand(seatAngle(turn, order.length)),
      seq: s.seq + 1,
    };
  }
  // Someone else's turn continues untouched (same seq, so their shot stays valid).
  return { ...s, order, pouches, goli, turn: idx < s.turn ? s.turn - 1 : s.turn };
}

/** Everyone with the most points (ties share the win). */
export function winners(s: GameState): string[] {
  let best = -1;
  for (const id of s.order) best = Math.max(best, score(s, id));
  return s.order.filter((id) => score(s, id) === best);
}
