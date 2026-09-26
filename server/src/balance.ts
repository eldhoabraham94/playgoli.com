/**
 * npm run balance: plays many bot games offline (pure rules, no server) and reports how
 * long games take, so physics/rules can be tuned towards ~5 minutes with people.
 */
import { ANIM_BUFFER_MS, DT, applyShot, currentShooter, newGame, slide, type GameState } from '@goli/shared';
import { botMove } from './bot';

/** Time a person takes to line up a shot, on average (seconds). */
const AIM_S = 5;

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function play(players: number, seed: number) {
  const rng = seeded(seed);
  let g: GameState = newGame(Array.from({ length: players }, (_, i) => `p${i}`), rng);
  let shots = 0;
  let fouls = 0;
  let inRing = 0;
  let bonus = 0;
  let animS = 0;
  while (g.status === 'playing' && shots < 2000) {
    const me = currentShooter(g)!;
    const m = botMove(g, rng);
    if (m.slide !== null) g = slide(g, me, m.slide) ?? g;
    const r = applyShot(g, me, { seq: g.seq, angle: m.angle, power: m.power });
    if (!r.ok) throw new Error(r.error);
    shots++;
    if (r.shot.foul) fouls++;
    if (r.shot.foul === 'in-ring') inRing++;
    if (r.shot.bonus) bonus++;
    animS += r.shot.steps * DT + ANIM_BUFFER_MS / 1000;
    g = r.state;
  }
  return { shots, fouls, inRing, bonus, minutes: (animS + shots * AIM_S) / 60, goli: g.values.length };
}

for (const players of [2, 4, 6, 10]) {
  const runs = Array.from({ length: 6 }, (_, i) => play(players, 1000 + i * 7 + players));
  const avg = (k: 'shots' | 'fouls' | 'inRing' | 'bonus' | 'minutes') => runs.reduce((t, r) => t + r[k], 0) / runs.length;
  console.log(
    `${String(players).padStart(2)} players (${runs[0].goli} goli): ${avg('shots').toFixed(0)} shots, ` +
      `${Math.round((avg('fouls') / avg('shots')) * 100)}% fouls (${Math.round((avg('inRing') / Math.max(1, avg('fouls'))) * 100)}% in-ring), ${avg('bonus').toFixed(1)} Raja bonuses, ` +
      `~${avg('minutes').toFixed(1)} min with people (bot aims better than most)`,
  );
}
