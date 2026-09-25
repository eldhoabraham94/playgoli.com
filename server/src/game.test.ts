import { DT, currentShooter, score, type ShotMsg, type SlideMsg, type TurnMsg } from '@goli/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { botMove } from './bot';
import { RoomStore, type Room, type RoomIO } from './rooms';

const T = {
  disconnectGraceMs: 60_000,
  hostGraceMs: 10_000,
  emptyRoomTtlMs: 30 * 60_000,
  shotClockMs: 15_000,
  awayTurnMs: 4_000,
  animBufferMs: 500,
};
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function setup(nPlayers = 2) {
  const sent: { socketId: string; event: string; payload: unknown }[] = [];
  const io: RoomIO = {
    send: (socketId, event, payload) => sent.push({ socketId, event, payload }),
    drop: () => {},
  };
  const store = new RoomStore(io, T, 10);
  const room = store.create()!;
  for (let i = 0; i < nPlayers; i++) room.join(uuid(i), `P${i}`, `s${i}`);
  const socketOf = (id: string) => room.byId(id)!.socketId!;
  const events = <P>(event: string, socketId?: string) =>
    sent.filter((s) => s.event === event && (!socketId || s.socketId === socketId)).map((s) => s.payload as P);
  return { room, sent, socketOf, events };
}

/** Current shooter plays one bot move (slide, then shoot). */
function botTurn(room: Room, socketOf: (id: string) => string, rng: () => number) {
  const g = room.game!;
  const shooter = currentShooter(g)!;
  const move = botMove(g, rng);
  if (move.slide !== null) room.slide(socketOf(shooter), move.slide);
  return room.shoot(socketOf(shooter), { seq: room.game!.seq, angle: move.angle, power: move.power });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('online game (server referee)', () => {
  it('plays a full 2-player game to the end; everyone gets every shot', () => {
    const { room, socketOf, events } = setup(2);
    expect(room.start('s0')).toBeNull();
    const rng = seeded(5);
    let shots = 0;
    while (room.phase === 'playing' && shots < 500) {
      expect(botTurn(room, socketOf, rng)).toBeNull();
      shots++;
    }
    expect(room.phase).toBe('over');
    expect(room.game!.goli).toHaveLength(0);
    const total = room.game!.order.reduce((n, id) => n + score(room.game!, id), 0);
    expect(total).toBe(4);

    const a = events<ShotMsg>('shot', 's0');
    const b = events<ShotMsg>('shot', 's1');
    expect(a).toHaveLength(shots);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.at(-1)!.clockMs).toBeNull();
    expect(events('gameOver', 's0')).toHaveLength(1);
    expect(events('gameOver', 's1')).toHaveLength(1);
  });

  it('only the shooter can shoot, and only with the current seq', () => {
    const { room, socketOf } = setup(2);
    room.start('s0');
    const g = room.game!;
    const shooter = currentShooter(g)!;
    const other = g.order.find((id) => id !== shooter)!;
    expect(room.shoot(socketOf(other), { seq: g.seq, angle: 0, power: 0.5 })).toBe('not-your-turn');
    expect(room.shoot(socketOf(shooter), { seq: g.seq + 1, angle: 0, power: 0.5 })).toBe('stale-seq');
    expect(room.shoot(socketOf(shooter), { seq: g.seq, angle: 0, power: 0.5 })).toBeNull();
    // Same seq again is now stale (no double shots).
    expect(room.shoot(socketOf(shooter), { seq: g.seq, angle: 0, power: 0.5 })).not.toBeNull();
  });

  it('slides are applied and relayed to everyone except the shooter; the shot starts there', () => {
    const { room, socketOf, events } = setup(3);
    room.start('s0');
    const shooter = currentShooter(room.game!)!;
    const sock = socketOf(shooter);
    room.slide(sock, 0);
    expect(room.game!.striker).toMatchObject({ x: 908, y: 500, inHand: true });
    const others = ['s0', 's1', 's2'].filter((s) => s !== sock);
    for (const s of others) expect(events<SlideMsg>('slide', s).at(-1)).toMatchObject({ x: 908, y: 500 });
    expect(events('slide', sock)).toHaveLength(0);
    // A non-shooter's slide is ignored.
    room.slide(others[0], Math.PI);
    expect(room.game!.striker.x).toBe(908);

    room.shoot(sock, { seq: room.game!.seq, angle: Math.PI, power: 0.3 });
    expect(events<ShotMsg>('shot', others[0])[0].start).toEqual({ x: 908, y: 500 });
  });

  it('shot clock: a timeout skips the turn; after a shot the clock waits for the animation', () => {
    const { room, socketOf, events } = setup(2);
    room.start('s0');
    const first = currentShooter(room.game!)!;
    expect(room.clockLeft()).toBe(15_000);
    vi.advanceTimersByTime(15_001);
    const turn = events<TurnMsg>('turn', 's0').at(-1)!;
    expect(turn.reason).toBe('timeout');
    expect(turn.skippedId).toBe(first);
    expect(currentShooter(turn.game)).not.toBe(first);

    const shooter = currentShooter(room.game!)!;
    room.shoot(socketOf(shooter), { seq: room.game!.seq, angle: 0, power: 0.2 });
    const shot = events<ShotMsg>('shot', 's0').at(-1)!;
    const animMs = Math.ceil(shot.steps * DT * 1000) + T.animBufferMs;
    expect(shot.clockMs).toBe(animMs + 15_000);
  });

  it('a disconnected shooter is skipped quickly', () => {
    const { room, socketOf, events } = setup(2);
    room.start('s0');
    const shooter = currentShooter(room.game!)!;
    room.disconnect(socketOf(shooter));
    vi.advanceTimersByTime(4_000);
    expect(events<TurnMsg>('turn').at(-1)).toMatchObject({ reason: 'away', skippedId: shooter });
    // Their next turn comes round with only the short clock while they're away.
    expect(room.clockLeft()).toBe(15_000);
    vi.advanceTimersByTime(15_000);
    expect(currentShooter(room.game!)).toBe(shooter);
    expect(room.clockLeft()).toBe(4_000);
  });

  it('a player gone for 60 s is removed; their pouch goes back into the ring', () => {
    const { room, socketOf } = setup(3);
    room.start('s0');
    const g = room.game!;
    const leaver = g.order.find((id) => id !== currentShooter(g))!;
    room.game = { ...g, pouches: { ...g.pouches, [leaver]: [100, 101] } };
    room.disconnect(socketOf(leaver));
    vi.advanceTimersByTime(60_001);
    expect(room.game!.order).not.toContain(leaver);
    expect(room.game!.goli.map((x) => x.id)).toEqual(expect.arrayContaining([100, 101]));
    expect(room.phase).toBe('playing');
  });

  it('a 2-player game ends when one player is gone for good', () => {
    const { room, events } = setup(2);
    room.start('s0');
    room.disconnect('s1');
    vi.advanceTimersByTime(60_001);
    expect(room.phase).toBe('over');
    expect(events('gameOver', 's0')).toHaveLength(1);
  });

  it('play again: host only, same room, spectators get a seat', () => {
    const { room, socketOf } = setup(2);
    room.start('s0');
    room.join(uuid(9), 'Late Comer', 's9');
    expect(room.byId(room.members.at(-1)!.id)!.role).toBe('spectator');
    const rng = seeded(1);
    while (room.phase === 'playing') botTurn(room, socketOf, rng);

    expect(room.playAgain('s1')).toBe('not-host');
    expect(room.playAgain('s0')).toBeNull();
    expect(room.phase).toBe('playing');
    expect(room.game!.order).toHaveLength(3);
    expect(room.game!.goli).toHaveLength(6);
    expect(room.spectators).toHaveLength(0);
    expect(room.playAgain('s0')).toBe('not-over');
  });
});

describe('kick and reactions', () => {
  it('host can kick a player mid-game; they are dropped and cannot rejoin', () => {
    const sent: { socketId: string; event: string; payload: unknown }[] = [];
    const dropped: { socketId: string; code: string }[] = [];
    const io: RoomIO = {
      send: (socketId, event, payload) => sent.push({ socketId, event, payload }),
      drop: (socketId, code) => dropped.push({ socketId, code }),
    };
    const room = new RoomStore(io, T, 10).create()!;
    for (let i = 0; i < 3; i++) room.join(uuid(i), `P${i}`, `s${i}`);
    room.start('s0');
    const target = room.players[2];
    expect(room.kick('s1', target.id)).toBe('not-host');
    expect(room.kick('s0', room.players[0].id)).toBe('bad-message'); // not yourself
    expect(room.kick('s0', target.id)).toBeNull();
    expect(dropped).toEqual([{ socketId: 's2', code: 'kicked' }]);
    expect(room.byId(target.id)).toBeUndefined();
    expect(room.game!.order).not.toContain(target.id);
    expect(room.join(uuid(2), 'P2', 's2b')).toEqual({ ok: false, error: 'kicked' });
  });

  it('reactions reach everyone, at most one per second per member', () => {
    const { room, events } = setup(2);
    room.react('s0', '🔥');
    room.react('s0', '😂'); // too soon, dropped
    room.react('s1', '👏');
    vi.advanceTimersByTime(1000);
    room.react('s0', '🙏');
    expect(events('react', 's1')).toEqual([
      { from: room.players[0].id, emoji: '🔥' },
      { from: room.players[1].id, emoji: '👏' },
      { from: room.players[0].id, emoji: '🙏' },
    ]);
  });
});
