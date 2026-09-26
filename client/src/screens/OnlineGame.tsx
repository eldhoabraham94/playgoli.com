import {
  SHOT_CLOCK_MS,
  applyShot,
  currentShooter,
  score,
  slide,
  winners,
  type RoomSnapshot,
} from '@goli/shared';
import { useEffect, useRef, useState } from 'react';
import { Board } from '../game/Board';
import { bigMoment, describeShot, describeTurn, shotCounter } from '../game/describe';
import { roomLink } from '../net/api';
import type { RoomConnection } from '../net/useRoom';
import { PlayerStrip } from '../ui/PlayerStrip';
import { FloatingReactions, ReactionBar } from '../ui/Reactions';
import { Results } from '../ui/Results';
import { Toast, useToast } from '../ui/Toast';
import { useWakeLock } from '../ui/useWakeLock';
import { useInGame } from '../ui/Scene';
import { VoiceButtons } from '../ui/VoiceControls';
import { Legend } from '../ui/Legend';
import { VoiceSender } from '../net/voice';

/** Slides go to the server at most this often (everyone else sees them). */
const SLIDE_EVERY_MS = 100;

export function OnlineGame({ conn, room, onLeave }: { conn: RoomConnection; room: RoomSnapshot; onLeave: () => void }) {
  const { game, anim, send } = conn;
  const [message, setMessage] = useState('');
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [micError, setMicError] = useState(false);
  const senderRef = useRef<VoiceSender | null>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const [toast, showToast] = useToast();
  const slideState = useRef<{ last: number; pending: number | null; timer: number }>({ last: 0, pending: null, timer: 0 });

  const members = [...room.players, ...room.spectators];
  const byId = (id: string | null | undefined) => members.find((m) => m.id === id);
  const name = (id: string) => (id === room.you ? 'You' : (byId(id)?.name ?? 'Someone'));

  useEffect(() => {
    if (conn.lastTurn) setMessage(describeTurn(conn.lastTurn, name));
  }, [conn.lastTurn]);

  useEffect(() => () => clearTimeout(slideState.current.timer), []);

  const myTurnNow = !!game && !anim && game.status === 'playing' && currentShooter(game) === room.you;
  useWakeLock(room.phase === 'playing');
  useInGame();
  // A short buzz when it becomes your turn (phones that support it).
  useEffect(() => {
    if (myTurnNow) navigator.vibrate?.([25, 40, 25]);
  }, [myTurnNow, game?.seq]);

  // Voice: my mic is open for my whole turn, including while my shot rolls.
  const myVoiceTurn =
    !!game && conn.connected && ((game.status === 'playing' && currentShooter(game) === room.you) || anim?.shooterId === room.you);
  const micLive = myVoiceTurn && conn.voiceOn && !micMuted && !micError;
  const { sendVoice } = conn;
  useEffect(() => {
    if (!micLive) return;
    const sender = new VoiceSender(sendVoice);
    senderRef.current = sender;
    let cancelled = false;
    // A start that was cancelled (turn ended while the mic was opening) is not an error.
    void sender.start().then((ok) => !ok && !cancelled && setMicError(true));
    let raf = 0;
    const meter = () => {
      meterRef.current?.style.setProperty('--lvl', String(Math.min(1, sender.level() * 2.2)));
      raf = requestAnimationFrame(meter);
    };
    raf = requestAnimationFrame(meter);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      sender.stop();
      senderRef.current = null;
    };
  }, [micLive, sendVoice]);
  useEffect(() => {
    if (conn.voiceOn) setMicError(false);
  }, [conn.voiceOn]);

  if (!game) return null;

  const you = room.you;
  const isHost = room.hostId === you;
  const shooterId = currentShooter(game);
  const shownShooter = anim ? anim.shooterId : shooterId;
  const myTurn = !anim && game.status === 'playing' && shooterId === you && conn.connected;
  const playing = game.order.includes(you);

  const flushSlide = () => {
    const s = slideState.current;
    clearTimeout(s.timer);
    s.timer = 0;
    if (s.pending === null) return;
    send('slide', { angle: s.pending });
    s.pending = null;
    s.last = performance.now();
  };

  const onSlide = (angle: number) => {
    conn.setGame((g) => slide(g, you, angle) ?? g);
    const s = slideState.current;
    s.pending = angle;
    const wait = SLIDE_EVERY_MS - (performance.now() - s.last);
    if (wait <= 0) flushSlide();
    else if (!s.timer) s.timer = window.setTimeout(flushSlide, wait);
  };

  const onShoot = (angle: number, power: number) => {
    if (!myTurn) return;
    const input = { seq: game.seq, angle, power };
    const local = applyShot(game, you, input);
    if (!local.ok) return;
    flushSlide(); // the server must know exactly where we shot from
    send('shoot', input);
    conn.predict(local.shot);
  };

  const onAnimDone = () => {
    if (anim) {
      setMessage(describeShot(anim, name));
      const big = bigMoment(anim, name);
      if (big) showToast(big);
    }
    conn.animDone();
  };

  const strip = game.order.map((id) => {
    const m = byId(id);
    return {
      id,
      name: m?.name ?? 'Left',
      color: m?.color ?? '#777',
      count: score(game, id),
      away: !m?.connected,
      you: id === you,
    };
  });

  let turnLine: string;
  if (game.status !== 'playing') turnLine = 'Game over';
  else if (anim) turnLine = `${name(anim.shooterId)} ${anim.shooterId === you ? 'shoot' : 'shoots'}…`;
  else if (myTurn) turnLine = `Your turn!${shotCounter(game.shotInTurn)}`;
  else turnLine = `${name(shooterId ?? '')} is lining up…${shotCounter(game.shotInTurn)}`;

  const hint = myTurn
    ? game.striker.inHand
      ? 'Drag the ground to slide · pull back the striker to shoot'
      : 'Pull back to shoot from where your striker stopped'
    : !playing
      ? "You're watching. You'll get a seat next game."
      : '';

  const showResults = room.phase === 'over' && !anim;
  const winnerIds = winners(game);
  const watching = room.spectators.length;
  const kickName = kickTarget ? byId(kickTarget)?.name : null;

  return (
    <div className="game">
      <div className="game-top">
        <PlayerStrip
          players={strip}
          currentId={game.status === 'playing' ? shownShooter : null}
          talkingId={conn.talkingId}
          onPick={isHost ? setKickTarget : undefined}
        />
        <VoiceButtons conn={conn} />
        <button className="leave-btn" onClick={onLeave} aria-label="Leave game">
          ✕
        </button>
      </div>
      <div className="board-area">
        <Board
          goli={game.goli}
          values={game.values}
          gameKey={game.order.join()}
          buzz={anim?.shooterId === you}
          striker={game.status === 'playing' || anim ? game.striker : null}
          strikerColor={byId(shownShooter)?.color ?? '#ffffff'}
          canAim={myTurn}
          deadline={game.status === 'playing' ? conn.deadline : null}
          clockMs={SHOT_CLOCK_MS}
          anim={anim}
          onAnimDone={onAnimDone}
          onSlide={onSlide}
          onShoot={onShoot}
        />
        <FloatingReactions items={conn.reactions} who={byId} />
        <Toast toast={toast} />
        {myVoiceTurn && conn.voiceOn && (
          <div className={`live-pill${micLive ? ' on' : ''}`}>
            {micError ? (
              <span>🎙 Mic unavailable</span>
            ) : micLive ? (
              <>
                <span className="rec-dot" />
                <span>You're live</span>
                <span className="meter" ref={meterRef} />
              </>
            ) : (
              <span>🎙 Muted</span>
            )}
            {!micError && (
              <button className="pill-btn" onClick={() => setMicMuted((m) => !m)}>
                {micMuted ? 'Unmute' : 'Mute'}
              </button>
            )}
          </div>
        )}
        {watching > 0 && <div className="watching">👀 {watching}</div>}
      </div>
      <div className="status">
        <div className={`turn-line${myTurn ? ' mine' : ''}`}>{turnLine}</div>
        <div className="msg">{!conn.connected ? 'Reconnecting…' : [message, hint].filter(Boolean).join(' · ')}</div>
        <Legend compact />
        <ReactionBar onReact={(emoji) => send('react', { emoji })} />
      </div>

      {kickName && kickTarget && (
        <div className="confirm-bar">
          <span>
            Remove <b>{kickName}</b> from the game?
          </span>
          <button
            className="btn small danger"
            onClick={() => {
              send('kick', { playerId: kickTarget });
              setKickTarget(null);
            }}
          >
            Kick
          </button>
          <button className="btn small ghost" onClick={() => setKickTarget(null)}>
            Cancel
          </button>
        </div>
      )}

      {showResults && (
        <Results
          link={roomLink(room.code)}
          values={game.values}
          rows={game.order.map((id) => ({
            id,
            name: byId(id)?.name ?? 'Left',
            color: byId(id)?.color ?? '#777',
            pouch: game.pouches[id] ?? [],
            points: score(game, id),
            winner: winnerIds.includes(id),
            you: id === you,
          }))}
        >
          <div className="row">
            {isHost ? (
              <button className="btn" onClick={() => send('playAgain')}>
                Play again
              </button>
            ) : (
              <p>Waiting for the host to play again…</p>
            )}
            <button className="btn ghost" onClick={onLeave}>
              Leave
            </button>
          </div>
        </Results>
      )}
    </div>
  );
}
