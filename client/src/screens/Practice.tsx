import {
  PLAYER_COLORS,
  SHOT_CLOCK_MS,
  applyShot,
  currentShooter,
  newGame,
  randomName,
  score,
  skipTurn,
  slide,
  winners,
  type GameState,
  type ShotResult,
} from '@goli/shared';
import { useEffect, useMemo, useState } from 'react';
import { Board } from '../game/Board';
import { bigMoment, describeShot, shotCounter } from '../game/describe';
import { PlayerStrip } from '../ui/PlayerStrip';
import { Results } from '../ui/Results';
import { Toast, useToast } from '../ui/Toast';
import { Hero, useInGame } from '../ui/Scene';
import { useWakeLock } from '../ui/useWakeLock';
import { marbleDot } from '../ui/marble';

interface LocalPlayer {
  id: string;
  name: string;
  color: string;
}

function pickNames(n: number): string[] {
  const names = new Set<string>();
  while (names.size < n) names.add(randomName());
  return [...names];
}

/** Local pass-the-phone game: same rules and physics as online play. */
export function Practice({ onExit }: { onExit: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  if (count === null) {
    return (
      <div className="screen">
        <Hero size="sm" />
        <h2>Practice</h2>
        <p>How many players on this phone?</p>
        <div className="row">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} className="btn square anim-in" style={{ animationDelay: `${0.15 + n * 0.08}s` }} onClick={() => setCount(n)}>
              {n}
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }
  return <LocalGame key={count} count={count} onExit={onExit} onRestart={() => setCount(null)} />;
}

function LocalGame({ count, onExit, onRestart }: { count: number; onExit: () => void; onRestart: () => void }) {
  const players = useMemo<LocalPlayer[]>(
    () => pickNames(count).map((name, i) => ({ id: `p${i}`, name, color: PLAYER_COLORS[i] })),
    [count],
  );
  const [game, setGame] = useState<GameState>(() => newGame(players.map((p) => p.id)));
  const [anim, setAnim] = useState<ShotResult | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [toast, showToast] = useToast();
  useWakeLock(true);
  useInGame();
  const [message, setMessage] = useState('Drag the ground to slide the striker. Pull back on it and let go to shoot.');

  const byId = (id: string | null) => players.find((p) => p.id === id);
  const shooterId = currentShooter(game);
  const shooter = byId(shooterId);

  // Shot clock: restarts for every new shot opportunity (seq changes).
  useEffect(() => {
    if (game.status !== 'playing' || anim) {
      setDeadline(null);
      return;
    }
    setDeadline(Date.now() + SHOT_CLOCK_MS);
    const seq = game.seq;
    const t = setTimeout(() => {
      setGame((g) => (g.seq === seq ? skipTurn(g) : g));
      setMessage("Time's up! Turn skipped.");
    }, SHOT_CLOCK_MS);
    return () => clearTimeout(t);
  }, [game.seq, game.status, anim]);

  const onShoot = (angle: number, power: number) => {
    if (!shooterId) return;
    const r = applyShot(game, shooterId, { seq: game.seq, angle, power });
    if (r.ok) setAnim(r.shot);
  };

  const onAnimDone = () => {
    if (!anim) return;
    const name = (id: string) => byId(id)?.name ?? '';
    setMessage(describeShot(anim, name));
    const big = bigMoment(anim, name);
    if (big) showToast(big);
    setGame(anim.after);
    setAnim(null);
  };

  const strip = players.map((p) => ({ ...p, count: score(game, p.id) }));
  const ordered = game.order.map((id) => strip.find((p) => p.id === id)!);

  return (
    <div className="game">
      <div className="game-top">
        <PlayerStrip players={ordered} currentId={anim ? anim.shooterId : shooterId} />
        <button className="leave-btn" onClick={onExit} aria-label="Leave practice">
          ✕
        </button>
      </div>
      <div className="board-area">
      <Board
        goli={game.goli}
        striker={game.status === 'playing' ? game.striker : null}
        strikerColor={(anim ? byId(anim.shooterId) : shooter)?.color ?? '#ffffff'}
        canAim={game.status === 'playing' && !anim}
        deadline={deadline}
        clockMs={SHOT_CLOCK_MS}
        anim={anim}
        onAnimDone={onAnimDone}
        onSlide={(a) => shooterId && setGame((g) => slide(g, shooterId, a) ?? g)}
        onShoot={onShoot}
      />
      <Toast toast={toast} />
      </div>
      <div className="status">
        {shooter && !anim && (
          <div className="turn-line">
            <span className="dot small" style={marbleDot(shooter.color)} /> <b>{shooter.name}</b>'s turn{shotCounter(game.shotInTurn)}
          </div>
        )}
        <div className="msg">{message}</div>
      </div>
      {game.status === 'over' && !anim && (
        <Results
          rows={players.map((p) => ({
            ...p,
            pouch: game.pouches[p.id] ?? [],
            winner: winners(game).includes(p.id),
          }))}
        >
          <div className="row">
            <button className="btn" onClick={onRestart}>
              Play again
            </button>
            <button className="btn ghost" onClick={onExit}>
              Home
            </button>
          </div>
        </Results>
      )}
    </div>
  );
}
