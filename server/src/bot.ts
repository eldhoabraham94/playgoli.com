import { CENTER, type GameState } from '@goli/shared';

export interface BotMove {
  /** Where to slide the in-hand striker first (radians around the throw line), if in hand. */
  slide: number | null;
  angle: number;
  power: number;
}

/**
 * A simple, decent player: from the throw line, line up behind a goli so the
 * shot drives it straight out; otherwise shoot at the goli nearest the edge.
 */
export function botMove(g: GameState, rng: () => number = Math.random): BotMove {
  const target = [...g.goli].sort(
    (a, b) => (b.x - CENTER) ** 2 + (b.y - CENTER) ** 2 - ((a.x - CENTER) ** 2 + (a.y - CENTER) ** 2),
  )[0];
  const jitter = () => (rng() - 0.5) * 0.12;
  if (!target) return { slide: null, angle: 0, power: 0.5 };

  let from = { x: g.striker.x, y: g.striker.y };
  let slide: number | null = null;
  if (g.striker.inHand) {
    // Stand on the opposite side of the ring from the target, then shoot through it.
    slide = Math.atan2(CENTER - target.y, CENTER - target.x) + (rng() - 0.5) * 0.5;
    from = { x: CENTER + 408 * Math.cos(slide), y: CENTER + 408 * Math.sin(slide) };
  }
  const angle = Math.atan2(target.y - from.y, target.x - from.x) + jitter();
  return { slide, angle, power: 0.65 + rng() * 0.35 };
}
