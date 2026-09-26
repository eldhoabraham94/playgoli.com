import {
  type C2SEvent,
  type C2SPayload,
  type ErrorCode,
  type GameOverMsg,
  type GameState,
  type ReactMsg,
  type RoomSnapshot,
  type ServerError,
  type ShotMsg,
  type ShotResult,
  type SlideMsg,
  type TurnMsg,
  type VoiceMime,
  type VoiceMsg,
} from '@goli/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getListenPref, getPlayerId, getVoicePref, setListenPref, setVoicePref } from './identity';
import { setSoundOn } from './audio';
import { VoicePlayer } from './voice';

/** Errors that end the session (no auto-reconnect). */
const FATAL: ErrorCode[] = ['room-not-found', 'room-full', 'bad-nickname', 'opened-elsewhere', 'kicked'];
/** Our view of the game is out of date: ask for a fresh snapshot. */
const RESYNC: ErrorCode[] = ['stale-seq', 'not-your-turn', 'bad-shot', 'not-playing'];

export interface RoomConnection {
  room: RoomSnapshot | null;
  connected: boolean;
  /** Session-ending error, if any. */
  fatal: ErrorCode | null;
  /** Latest non-fatal error (e.g. not-host), cleared by the UI. */
  notice: ErrorCode | null;
  clearNotice: () => void;
  send: <E extends C2SEvent>(event: E, payload?: C2SPayload<E>) => void;
  /** Reconnect after a fatal error such as opened-elsewhere. */
  retry: () => void;

  /** Authoritative game state (already the post-shot state while a shot animates). */
  game: GameState | null;
  /** Shot being animated, if any. */
  anim: ShotMsg | null;
  /** Date.now() ms when the shot clock runs out. */
  deadline: number | null;
  lastTurn: TurnMsg | null;
  gameOver: GameOverMsg | null;
  animDone: () => void;
  /** Update our own view (e.g. sliding our striker) without waiting for the server. */
  setGame: (fn: (g: GameState) => GameState) => void;
  /** Start animating our own shot right away; the server's result confirms it. */
  predict: (shot: ShotResult) => void;
  /** Recent emoji reactions (each lives ~2.6 s). */
  reactions: FloatingReaction[];

  /** Who is talking right now (their clips are playing), if anyone. */
  talkingId: string | null;
  sendVoice: (mime: VoiceMime, data: ArrayBuffer) => void;
  /** I want my mic on during my turns (permission already granted). */
  voiceOn: boolean;
  setVoiceOn: (on: boolean) => void;
  /** I want to hear the shooter. */
  listen: boolean;
  setListen: (on: boolean) => void;
}

export interface FloatingReaction extends ReactMsg {
  key: number;
}

function sameShot(a: ShotResult, b: ShotResult) {
  return (
    a.seq === b.seq &&
    a.start.x === b.start.x &&
    a.start.y === b.start.y &&
    a.velocity.vx === b.velocity.vx &&
    a.velocity.vy === b.velocity.vy
  );
}

export function useRoom(code: string, nickname: string): RoomConnection {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [fatal, setFatal] = useState<ErrorCode | null>(null);
  const [notice, setNotice] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [game, setGameState] = useState<GameState | null>(null);
  const [anim, setAnimState] = useState<ShotMsg | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [lastTurn, setLastTurn] = useState<TurnMsg | null>(null);
  const [gameOver, setGameOver] = useState<GameOverMsg | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [talkingId, setTalkingId] = useState<string | null>(null);
  const [voiceOn, setVoiceOnState] = useState(getVoicePref);
  const [listen, setListenState] = useState(getListenPref);
  const playerRef = useRef<VoicePlayer | null>(null);
  playerRef.current ??= new VoicePlayer();
  const sockRef = useRef<Socket | null>(null);
  const animRef = useRef<ShotMsg | null>(null);
  const predicted = useRef<ShotMsg | null>(null);

  const setAnim = (a: ShotMsg | null) => {
    animRef.current = a;
    setAnimState(a);
  };
  const clockFrom = (ms: number | null) => setDeadline(ms === null ? null : Date.now() + ms);

  useEffect(() => {
    setFatal(null);
    const s = io({ transports: ['websocket'], reconnectionDelayMax: 3000 });
    sockRef.current = s;
    const join = () => s.emit('join', { code, playerId: getPlayerId(), nickname });

    // (Re)join on every connect: the server reattaches us to our seat and sends a snapshot.
    s.on('connect', () => {
      setConnected(true);
      join();
    });
    s.on('disconnect', () => setConnected(false));

    s.on('room', (snap: RoomSnapshot) => {
      setRoom(snap);
      setGameState(snap.game);
      clockFrom(snap.clockMs);
      if (snap.phase === 'playing') setGameOver(null);
    });
    s.on('turn', (t: TurnMsg) => {
      setGameState(t.game);
      clockFrom(t.clockMs);
      setLastTurn(t);
    });
    s.on('slide', (m: SlideMsg) => {
      setGameState((g) =>
        g && g.seq === m.seq && g.striker.inHand ? { ...g, striker: { ...g.striker, x: m.x, y: m.y, angle: m.angle } } : g,
      );
    });
    s.on('shot', (shot: ShotMsg) => {
      const p = predicted.current;
      predicted.current = null;
      setGameState(shot.after);
      clockFrom(shot.clockMs);
      // Our own prediction matched: keep the animation that's already rolling.
      if (p && sameShot(p, shot)) {
        if (animRef.current === p) animRef.current = shot;
      } else setAnim(shot);
    });
    s.on('gameOver', (m: GameOverMsg) => setGameOver(m));
    const player = playerRef.current!;
    player.onTalking = setTalkingId;
    s.on('voice', (m: VoiceMsg) => player.play(m));
    let reactKey = 0;
    s.on('react', (m: ReactMsg) => {
      const r = { ...m, key: ++reactKey };
      setReactions((list) => [...list.slice(-19), r]);
      setTimeout(() => setReactions((list) => list.filter((x) => x !== r)), 2600);
    });
    s.on('error', (e: ServerError) => {
      if (FATAL.includes(e.code)) {
        setFatal(e.code);
        s.disconnect();
        return;
      }
      if (RESYNC.includes(e.code)) {
        predicted.current = null;
        setAnim(null);
        join();
      }
      setNotice(e.code);
    });
    return () => {
      s.removeAllListeners();
      s.disconnect();
      sockRef.current = null;
    };
  }, [code, nickname, attempt]);

  const send = useCallback(<E extends C2SEvent>(event: E, payload?: C2SPayload<E>) => {
    sockRef.current?.emit(event, payload ?? {});
  }, []);

  const animDone = useCallback(() => {
    const a = animRef.current;
    // Our prediction finished before the server answered: show its result meanwhile.
    if (a && a === predicted.current) setGameState(a.after);
    setAnim(null);
  }, []);

  const predict = useCallback((shot: ShotResult) => {
    const msg: ShotMsg = { ...shot, clockMs: null };
    predicted.current = msg;
    setAnim(msg);
  }, []);

  // Browsers allow sound only after a tap: unlock on every tap (cheap), e.g. Join / Start.
  useEffect(() => {
    const player = playerRef.current!;
    const unlock = () => player.unlock();
    addEventListener('pointerdown', unlock, { passive: true });
    return () => {
      removeEventListener('pointerdown', unlock);
      player.close();
    };
  }, []);
  useEffect(() => {
    playerRef.current!.setMuted(!listen);
    setSoundOn(listen);
  }, [listen]);

  const sendVoice = useCallback((mime: VoiceMime, data: ArrayBuffer) => {
    sockRef.current?.emit('voice', { mime, data });
  }, []);

  const setGame = useCallback((fn: (g: GameState) => GameState) => setGameState((g) => (g ? fn(g) : g)), []);

  return {
    room,
    connected,
    fatal,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    send,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    game,
    anim,
    deadline,
    lastTurn,
    gameOver,
    animDone,
    setGame,
    predict,
    reactions,
    talkingId,
    sendVoice,
    voiceOn,
    setVoiceOn: useCallback((on: boolean) => {
      setVoicePref(on);
      setVoiceOnState(on);
    }, []),
    listen,
    setListen: useCallback((on: boolean) => {
      setListenPref(on);
      setListenState(on);
    }, []),
  };
}
