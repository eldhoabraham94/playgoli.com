/**
 * A swarm of bot clients that play full games against a Goli server over real
 * sockets, exactly like browsers do. Used by `npm run bots` and by a test.
 *
 * Every bot (players and spectators) re-simulates every shot with the shared
 * physics and checks it lands on the server's result; at each game over all
 * bots' final states must be identical.
 */
import {
  ANIM_BUFFER_MS,
  DT,
  FUN_NAMES,
  REACTIONS,
  createSim,
  currentShooter,
  runToRest,
  type GameOverMsg,
  type GameState,
  type RoomSnapshot,
  type ServerError,
  type ShotMsg,
  type TurnMsg,
} from '@goli/shared';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { botMove } from './bot';

export interface SwarmOptions {
  url: string;
  players?: number;
  spectators?: number;
  games?: number;
  /** Wait for animations and "think" like a person (slow, realistic timing). */
  realtime?: boolean;
  /** One bot drops its connection mid-game and comes back. */
  reconnect?: boolean;
  timeoutMs?: number;
  log?: (line: string) => void;
}

export interface GameStats {
  shots: number;
  skipped: number;
  winners: string[];
  /** Wall-clock time of this run. */
  durationMs: number;
  /** Estimated length with humans: every shot's animation + ~4 s to aim. */
  estMinutesWithHumans: number;
}

export interface SwarmReport {
  ok: boolean;
  code: string;
  games: GameStats[];
  mismatches: number;
  desyncs: number;
  rttMs: { avg: number; p95: number; max: number };
  reactions: number;
  reconnectOk: boolean | null;
  errors: string[];
}

interface Bot {
  index: number;
  name: string;
  secret: string;
  socket: Socket;
  spectator: boolean;
  you: string;
  game: GameState | null;
  actedSeq: number;
  sentAt: Map<number, number>;
  /** Final state JSON per game, keyed by that game's turn order (unique per game). */
  finals: Map<string, string>;
  expectYou: string | null;
}

const HUMAN_AIM_MS = 4000;

export async function runSwarm(opts: SwarmOptions): Promise<SwarmReport> {
  const o = {
    players: 10,
    spectators: 3,
    games: 2,
    realtime: false,
    reconnect: true,
    timeoutMs: 120_000,
    log: () => {},
    ...opts,
  };
  const res = await fetch(`${o.url}/api/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`could not create a room: HTTP ${res.status}`);
  const { code } = (await res.json()) as { code: string };
  o.log(`Room ${code}: ${o.players} players, ${o.spectators} spectators, ${o.games} game(s)`);

  const report: SwarmReport = {
    ok: false,
    code,
    games: [],
    mismatches: 0,
    desyncs: 0,
    rttMs: { avg: 0, p95: 0, max: 0 },
    reactions: 0,
    reconnectOk: null,
    errors: [],
  };
  const rtts: number[] = [];
  const bots: Bot[] = [];
  const newGameStats = () => ({ shots: 0, skipped: 0, animMs: 0, start: Date.now() });
  let current = newGameStats();
  let started = false;
  let spectatorsSpawned = false;
  let reconnectDone = !o.reconnect || o.players < 4;

  return new Promise<SwarmReport>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      for (const b of bots) b.socket.disconnect();
      const sorted = [...rtts].sort((a, b) => a - b);
      report.rttMs = {
        avg: Math.round(sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length)),
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        max: sorted.at(-1) ?? 0,
      };
      report.ok =
        report.errors.length === 0 &&
        report.mismatches === 0 &&
        report.desyncs === 0 &&
        report.games.length === o.games &&
        report.reconnectOk !== false;
      resolve(report);
    };
    const timer = setTimeout(() => {
      report.errors.push(`timed out after ${o.timeoutMs} ms`);
      finish();
    }, o.timeoutMs);

    const act = (bot: Bot, seq: number) => {
      const g = bot.game;
      if (finished || !g || g.seq !== seq || currentShooter(g) !== bot.you || !bot.socket.connected) return;
      const move = botMove(g);
      if (move.slide !== null) bot.socket.emit('slide', { angle: move.slide });
      bot.sentAt.set(seq, Date.now());
      bot.socket.emit('shoot', { seq, angle: move.angle, power: move.power });
      if (Math.random() < 0.15) bot.socket.emit('react', { emoji: REACTIONS[Math.floor(Math.random() * REACTIONS.length)] });
    };

    const onGame = (bot: Bot, g: GameState | null, shot?: ShotMsg) => {
      bot.game = g;
      if (!g || g.status !== 'playing' || bot.spectator) return;
      if (currentShooter(g) !== bot.you || bot.actedSeq === g.seq) return;
      bot.actedSeq = g.seq;
      const anim = shot ? shot.steps * DT * 1000 + ANIM_BUFFER_MS : 0;
      const delay = o.realtime ? anim + 800 + Math.random() * 2500 : 5 + Math.random() * 20;
      setTimeout(() => act(bot, g.seq), delay);
    };

    const verify = (bot: Bot, s: ShotMsg) => {
      // The state this bot had must be what the shot started from...
      if (bot.game && JSON.stringify(bot.game.goli) !== JSON.stringify(s.before)) report.desyncs++;
      // ...and replaying it must land exactly on the server's result.
      const sim = runToRest(createSim(s.start, s.velocity, s.before));
      // Goli that went back in after a foul are placed by the rules, not the physics.
      const out = new Set(s.knockedOut);
      const replay = s.before
        .map((g, j) => ({ id: g.id, x: sim.bodies[j + 1].x, y: sim.bodies[j + 1].y }))
        .filter((g) => !out.has(g.id));
      const kept = s.after.goli.filter((g) => !out.has(g.id));
      if (JSON.stringify(replay) !== JSON.stringify(kept)) report.mismatches++;
      if (sim.bodies[0].x !== s.strikerEnd.x || sim.bodies[0].y !== s.strikerEnd.y) report.mismatches++;
    };

    const onGameOver = (m: GameOverMsg) => {
      const host = bots[0];
      const name = (id: string) => bots.find((b) => b.you === id)?.name ?? id;
      const stats: GameStats = {
        shots: current.shots,
        skipped: current.skipped,
        winners: m.winners.map(name),
        durationMs: Date.now() - current.start,
        estMinutesWithHumans: Math.round(((current.animMs + current.shots * HUMAN_AIM_MS) / 60_000) * 10) / 10,
      };
      report.games.push(stats);
      o.log(
        `Game ${report.games.length}: ${stats.shots} shots, ${stats.skipped} skipped, won by ${stats.winners.join(' & ')} ` +
          `(${(stats.durationMs / 1000).toFixed(1)} s here, ~${stats.estMinutesWithHumans} min with humans)`,
      );
      // Give every bot a moment to receive gameOver, then compare final states.
      setTimeout(() => {
        // Compare everyone who saw this game end (a bot that was offline may have missed it).
        const key = host.game?.order.join() ?? '';
        const finals = bots.map((b) => b.finals.get(key)).filter((f): f is string => f !== undefined);
        if (finals.length < bots.length - 1 || finals.some((f) => f !== finals[0])) {
          report.desyncs++;
          report.errors.push(`final states differ after game ${report.games.length}`);
        }
        if (report.games.length >= o.games) finish();
        else {
          current = newGameStats();
          host.socket.emit('playAgain');
        }
      }, 300);
    };

    const makeBot = (index: number, spectator: boolean): Bot => {
      const socket = io(o.url, { transports: ['websocket'], forceNew: true, reconnection: false });
      const bot: Bot = {
        index,
        name: FUN_NAMES[index % FUN_NAMES.length],
        secret: randomUUID(),
        socket,
        spectator,
        you: '',
        game: null,
        actedSeq: -1,
        sentAt: new Map(),
        finals: new Map(),
        expectYou: null,
      };
      socket.on('connect', () => socket.emit('join', { code, playerId: bot.secret, nickname: bot.name }));
      socket.on('room', (r: RoomSnapshot) => {
        bot.you = r.you;
        if (bot.expectYou) {
          report.reconnectOk = r.you === bot.expectYou && r.players.some((p) => p.id === r.you);
          o.log(`${bot.name} reconnected: ${report.reconnectOk ? 'same seat' : 'LOST SEAT'}`);
          bot.expectYou = null;
        }
        if (index === 0) {
          const ready = r.players.filter((p) => p.connected).length;
          if (r.phase === 'lobby' && !started && ready === o.players) {
            started = true;
            socket.emit('start');
          }
          if (r.phase === 'playing' && !spectatorsSpawned) {
            spectatorsSpawned = true;
            for (let i = 0; i < o.spectators; i++) bots.push(makeBot(o.players + i, true));
          }
        }
        onGame(bot, r.game);
      });
      socket.on('turn', (t: TurnMsg) => {
        if (index === 0) current.skipped++;
        onGame(bot, t.game);
      });
      socket.on('shot', (s: ShotMsg) => {
        verify(bot, s);
        if (index === 0) {
          current.shots++;
          current.animMs += s.steps * DT * 1000 + ANIM_BUFFER_MS;
          if (!reconnectDone && current.shots === 2) {
            reconnectDone = true;
            const victim = bots[3];
            victim.expectYou = victim.you;
            o.log(`${victim.name} drops the connection…`);
            victim.socket.disconnect();
            setTimeout(() => victim.socket.connect(), 150);
          }
        }
        const sent = bot.sentAt.get(s.seq);
        if (sent !== undefined && s.shooterId === bot.you) {
          rtts.push(Date.now() - sent);
          bot.sentAt.delete(s.seq);
        }
        onGame(bot, s.after, s);
      });
      socket.on('gameOver', (m: GameOverMsg) => {
        if (bot.game) bot.finals.set(bot.game.order.join(), JSON.stringify(bot.game));
        bot.actedSeq = -1; // seq restarts in the next game
        if (index === 0) onGameOver(m);
      });
      socket.on('react', () => {
        if (index === 0) report.reactions++;
      });
      socket.on('error', (e: ServerError) => report.errors.push(`${bot.name}: ${e.code}`));
      return bot;
    };

    for (let i = 0; i < o.players; i++) bots.push(makeBot(i, false));
  });
}
