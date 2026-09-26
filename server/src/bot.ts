import { CENTER, applyShot, currentShooter, slide, type GameState } from '@goli/shared';

export interface BotMove {
  /** Where to slide the in-hand striker first (radians around the throw line), if in hand. */
  slide: number | null;
  angle: number;
  power: number;
}

export interface BotOptions {
  /** Shots tried in the head before choosing. */
  candidates?: number;
  /** Aim wobble (radians, ±) and power wobble (fraction, ±) when actually shooting. */
  aimError?: number;
  powerError?: number;
}

/**
 * Plans with the real (deterministic) physics: imagines a handful of shots, keeps
 * the best (points won, no foul, the Raja is worth its bonus), then shoots it with
 * a little human-like wobble, so it's good but far from perfect.
 */
export function botMove(g: GameState, rng: () => number = Math.random, opts: BotOptions = {}): BotMove {
  const { candidates = 40, aimError = 0.03, powerError = 0.1 } = opts;
  const me = currentShooter(g);
  let best: { value: number; move: BotMove } = { value: -Infinity, move: { slide: null, angle: -Math.PI / 2, power: 0.6 } };
  if (!me || g.goli.length === 0) return best.move;

  for (let i = 0; i < candidates; i++) {
    const target = g.goli[Math.floor(rng() * g.goli.length)];
    let state = g;
    let slideAngle: number | null = null;
    if (g.striker.inHand) {
      // Stand roughly on the target's side, so the shot runs along a chord and can
      // clip the goli outwards and carry the striker out of the ring.
      const side = Math.atan2(target.y - CENTER, target.x - CENTER);
      slideAngle = side + (rng() - 0.5) * 2.4;
      state = slide(g, me, slideAngle) ?? g;
    }
    const from = state.striker;
    const angle = Math.atan2(target.y - from.y, target.x - from.x) + (rng() - 0.5) * 0.16;
    const power = 0.5 + rng() * 0.5;
    const r = applyShot(state, me, { seq: state.seq, angle, power });
    if (!r.ok) continue;
    const value = r.shot.foul ? -1 : r.shot.points + (r.shot.bonus ? 3 : 0) + rng() * 0.01;
    if (value > best.value) best = { value, move: { slide: slideAngle, angle, power } };
  }

  const m = best.move;
  return {
    slide: m.slide,
    angle: m.angle + (rng() - 0.5) * 2 * aimError,
    power: Math.min(1, Math.max(0.05, m.power * (1 + (rng() - 0.5) * 2 * powerError))),
  };
}
