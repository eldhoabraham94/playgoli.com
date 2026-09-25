import {
  createSim,
  currentShooter,
  runToRest,
  type GameState,
  type RoomSnapshot,
  type ServerError,
  type ShotMsg,
  type TurnMsg,
} from '@goli/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { botMove } from './bot';

let app: ReturnType<typeof createApp>;
let base: string;
const clients: Socket[] = [];

beforeEach(async () => {
  app = createApp({ createLimit: { max: 3, windowMs: 60_000 } });
  const port = await app.listen(0);
  base = `http://localhost:${port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await app.close();
});

function client(): Socket {
  const c = connect(base, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(c);
  return c;
}

function next<T>(c: Socket, event: string, pred: (x: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 3000);
    const h = (x: T) => {
      if (!pred(x)) return;
      clearTimeout(timer);
      c.off(event, h);
      resolve(x);
    };
    c.on(event, h);
  });
}

async function createRoom(): Promise<string> {
  const r = await fetch(`${base}/api/rooms`, { method: 'POST' });
  expect(r.status).toBe(201);
  return ((await r.json()) as { code: string }).code;
}

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

describe('server over real sockets', () => {
  it('creates a room, two players join, and both see the lobby', async () => {
    const code = await createRoom();
    const info = await (await fetch(`${base}/api/rooms/${code}`)).json();
    expect(info).toMatchObject({ code, phase: 'lobby', players: 0 });

    const a = client();
    a.emit('join', { code, playerId: ID_A, nickname: 'Kochu Rajan' });
    await next<RoomSnapshot>(a, 'room');

    const b = client();
    const aSees = next<RoomSnapshot>(a, 'room', (s) => s.players.length === 2);
    b.emit('join', { code, playerId: ID_B, nickname: 'Goli Master' });
    const bSnap = await next<RoomSnapshot>(b, 'room');
    const aSnap = await aSees;
    expect(bSnap.players.map((p) => p.name)).toEqual(['Kochu Rajan', 'Goli Master']);
    expect(aSnap.hostId).toBe(aSnap.you);
    expect(bSnap.hostId).not.toBe(bSnap.you);
  });

  it('a reconnect with the same playerId gets the same seat back', async () => {
    const code = await createRoom();
    const a = client();
    a.emit('join', { code, playerId: ID_A, nickname: 'A' });
    const first = await next<RoomSnapshot>(a, 'room');
    a.disconnect();

    const a2 = client();
    a2.emit('join', { code, playerId: ID_A, nickname: 'ignored' });
    const again = await next<RoomSnapshot>(a2, 'room');
    expect(again.you).toBe(first.you);
    expect(again.players).toHaveLength(1);
    expect(again.players[0]).toMatchObject({ name: 'A', connected: true });
    expect(again.hostId).toBe(first.you);
  });

  it('rejects unknown rooms and malformed messages', async () => {
    const a = client();
    a.emit('join', { code: 'ZZZZ', playerId: ID_A, nickname: 'A' });
    expect(await next<ServerError>(a, 'error')).toEqual({ code: 'room-not-found' });
    a.emit('join', { code: 'ZZZZ', playerId: 'not-a-uuid', nickname: 'A' });
    expect(await next<ServerError>(a, 'error')).toEqual({ code: 'bad-message' });
    a.emit('start');
    expect(await next<ServerError>(a, 'error')).toEqual({ code: 'not-joined' });
  });

  it('rate-limits room creation per IP', async () => {
    for (let i = 0; i < 3; i++) await createRoom();
    const r = await fetch(`${base}/api/rooms`, { method: 'POST' });
    expect(r.status).toBe(429);
  });

  it('rate-limits message floods per socket', async () => {
    const a = client();
    await new Promise<void>((r) => a.on('connect', () => r()));
    const limited = next<ServerError>(a, 'error', (e) => e.code === 'rate-limited');
    for (let i = 0; i < 60; i++) a.emit('start');
    expect(await limited).toEqual({ code: 'rate-limited' });
  });

  it('two clients play a full game; every client re-simulates each shot to the exact server result', async () => {
    const code = await createRoom();
    const ids = [ID_A, ID_B];
    const players = ids.map((playerId, i) => {
      const c = client();
      const p = { c, you: '', game: null as GameState | null, shots: [] as ShotMsg[], mismatches: 0 };
      const maybeShoot = () => {
        const g = p.game;
        if (!g || g.status !== 'playing' || currentShooter(g) !== p.you) return;
        const move = botMove(g);
        if (move.slide !== null) c.emit('slide', { angle: move.slide });
        c.emit('shoot', { seq: g.seq, angle: move.angle, power: move.power });
      };
      c.on('room', (r: RoomSnapshot) => {
        p.you = r.you;
        if (r.game && (!p.game || r.game.seq !== p.game.seq)) {
          p.game = r.game;
          maybeShoot();
        }
      });
      c.on('turn', (t: TurnMsg) => {
        p.game = t.game;
        maybeShoot();
      });
      c.on('shot', (shot: ShotMsg) => {
        // What every browser does: replay the shot with the shared physics...
        const sim = runToRest(createSim(shot.start, shot.velocity, shot.before));
        const replay = shot.before
          .map((g, j) => ({ id: g.id, x: sim.bodies[j + 1].x, y: sim.bodies[j + 1].y }))
          .filter((g) => shot.after.goli.some((a) => a.id === g.id));
        // ...and it must land exactly where the server says.
        if (JSON.stringify(replay) !== JSON.stringify(shot.after.goli)) p.mismatches++;
        if (sim.bodies[0].x !== shot.strikerEnd.x || sim.bodies[0].y !== shot.strikerEnd.y) p.mismatches++;
        p.shots.push(shot);
        p.game = shot.after;
        maybeShoot();
      });
      c.emit('join', { code, playerId, nickname: `Bot ${i}` });
      return p;
    });
    await next<RoomSnapshot>(players[0].c, 'room', (r) => r.players.length === 2);
    const over = Promise.all(players.map((p) => next(p.c, 'gameOver')));
    players[0].c.emit('start');
    await over;

    const [a, b] = players;
    expect(a.shots.length).toBeGreaterThan(0);
    expect(a.mismatches + b.mismatches).toBe(0);
    expect(JSON.stringify(a.shots)).toBe(JSON.stringify(b.shots));
    expect(a.game!.status).toBe('over');
    expect(a.game!.goli).toHaveLength(0);
  }, 20_000);
});

