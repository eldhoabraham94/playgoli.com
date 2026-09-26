import { MAX_SHOTS_PER_TURN, currentShooter, winners, type ShotResult, type TurnMsg } from '@goli/shared';

/** `name(id)` returns "You" for this device's player, which switches the grammar. */
type Namer = (id: string) => string;

const possessive = (who: string) => (who === 'You' ? 'Your' : `${who}'s`);

/** " (2/3)" style counter, or nothing when every turn is a single shot. */
export function shotCounter(shotInTurn: number): string {
  return MAX_SHOTS_PER_TURN > 1 ? ` (${shotInTurn + 1}/${MAX_SHOTS_PER_TURN})` : '';
}

/** One line about how a shot went, for the status bar. */
export function describeShot(shot: ShotResult, name: Namer): string {
  const who = name(shot.shooterId);
  const you = who === 'You';
  const n = shot.knockedOut.length;
  const next = shot.after;
  if (next.status === 'over') return n ? `${who} knocked out the last ${n === 1 ? 'goli' : n}!` : 'Ring is empty!';
  if (shot.foul) return `Foul! ${possessive(who)} striker left the ground.${n ? ` ${you ? 'Keep' : 'Keeps'} ${n}.` : ''}`;
  if (n === 0) return `${who} missed.`;
  if (currentShooter(next) === shot.shooterId)
    return `${who} knocked out ${n}! ${you ? 'Shoot' : 'Shoots'} again${shotCounter(next.shotInTurn)}.`;
  return MAX_SHOTS_PER_TURN > 1
    ? `${who} knocked out ${n}! That's ${MAX_SHOTS_PER_TURN} shots, next player.`
    : `${who} knocked out ${n}!`;
}

export function describeTurn(t: TurnMsg, name: Namer): string {
  const who = name(t.skippedId);
  if (t.reason === 'timeout') return `Time's up! ${possessive(who)} turn was skipped.`;
  if (t.reason === 'away') return `${who} ${who === 'You' ? 'are' : 'is'} away, turn skipped.`;
  return `${who} left the game.`;
}

/** Toast-worthy moments: multi-goli shots and the win. */
export function bigMoment(shot: ShotResult, name: Namer): string | null {
  const g = shot.after;
  if (g.status === 'over') {
    const top = winners(g);
    const best = g.pouches[top[0]]?.length ?? 0;
    if (top.length > 1) return `It's a tie at ${best} goli! 🏆`;
    const who = name(top[0]);
    return `${who} ${who === 'You' ? 'win' : 'wins'} with ${best} goli! 🏆`;
  }
  const n = shot.knockedOut.length;
  if (n >= 2) return `${name(shot.shooterId)} knocked out ${n}!${n >= 3 ? ' 🔥' : ''}`;
  return null;
}
