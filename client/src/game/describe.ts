import { MAX_SHOTS_PER_TURN, RAJA_POINTS, currentShooter, score, winners, type ShotResult, type TurnMsg } from '@goli/shared';

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
  if (shot.foul === 'off-board') return `Foul! ${possessive(who)} striker left the ground. No points.`;
  if (shot.foul === 'in-ring')
    return `Foul! ${possessive(who)} striker stayed in the ring.${n ? ` ${n === 1 ? 'The goli goes' : `${n} goli go`} back in.` : ''}`;
  if (next.status === 'over') return n ? `${who} knocked out the last one (+${shot.points})!` : 'Ring is empty!';
  if (n === 0) return `${who} missed.`;
  if (shot.bonus) return `${who} got the Raja! +${shot.points} and one more shot.`;
  if (currentShooter(next) === shot.shooterId)
    return `${who} knocked out ${n} (+${shot.points})! ${you ? 'Shoot' : 'Shoots'} again${shotCounter(next.shotInTurn)}.`;
  return `${who} knocked out ${n} (+${shot.points})!`;
}

export function describeTurn(t: TurnMsg, name: Namer): string {
  const who = name(t.skippedId);
  if (t.reason === 'timeout') return `Time's up! ${possessive(who)} turn was skipped.`;
  if (t.reason === 'away') return `${who} ${who === 'You' ? 'are' : 'is'} away, turn skipped.`;
  return `${who} left the game.`;
}

/** Toast-worthy moments: the Raja, big hauls, the win. */
export function bigMoment(shot: ShotResult, name: Namer): string | null {
  const g = shot.after;
  if (g.status === 'over') {
    const top = winners(g);
    const best = score(g, top[0]);
    if (top.length > 1) return `It's a tie at ${best} points! 🏆`;
    const who = name(top[0]);
    return `${who} ${who === 'You' ? 'win' : 'wins'} with ${best} points! 🏆`;
  }
  if (shot.bonus) return `🔴 ${name(shot.shooterId)} got the Raja! +${RAJA_POINTS}, one more shot`;
  if (shot.points >= 4) return `${name(shot.shooterId)} +${shot.points}! 🔥`;
  return null;
}
