import { MAX_PLAYERS, type RoomSnapshot } from '@goli/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomStore, type RoomIO } from './rooms';

const T = {
  disconnectGraceMs: 60_000,
  hostGraceMs: 10_000,
  emptyRoomTtlMs: 30 * 60_000,
  shotClockMs: 15_000,
  awayTurnMs: 4_000,
  animBufferMs: 500,
};
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function setup() {
  const sent: { socketId: string; event: string; payload: unknown }[] = [];
  const dropped: string[] = [];
  const io: RoomIO = {
    send: (socketId, event, payload) => sent.push({ socketId, event, payload }),
    drop: (socketId) => dropped.push(socketId),
  };
  const store = new RoomStore(io, T, 100);
  const room = store.create()!;
  const lastSnap = (socketId: string) =>
    sent.filter((s) => s.socketId === socketId && s.event === 'room').at(-1)?.payload as RoomSnapshot;
  return { store, room, sent, dropped, lastSnap };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Room', () => {
  it('first player becomes host; each player gets a distinct colour and a public id', () => {
    const { room, lastSnap } = setup();
    const a = room.join(uuid(1), 'Kochu Rajan', 's1');
    const b = room.join(uuid(2), 'Goli Master', 's2');
    expect(a.ok && b.ok).toBe(true);
    const snap = lastSnap('s2');
    expect(snap.players.map((p) => p.name)).toEqual(['Kochu Rajan', 'Goli Master']);
    expect(snap.hostId).toBe(snap.players[0].id);
    expect(snap.you).toBe(snap.players[1].id);
    expect(new Set(snap.players.map((p) => p.color)).size).toBe(2);
    // The secret never leaks into snapshots.
    expect(JSON.stringify(snap)).not.toContain(uuid(1));
  });

  it('sanitizes names, rejects profane ones and de-duplicates', () => {
    const { room } = setup();
    expect(room.join(uuid(1), 'fuck', 's1')).toEqual({ ok: false, error: 'bad-nickname' });
    room.join(uuid(1), '  Goli   Master ', 's1');
    room.join(uuid(2), 'goli master', 's2');
    expect(room.players.map((p) => p.name)).toEqual(['Goli Master', 'goli master 2']);
  });

  it('rejoining with the same playerId reclaims the same seat and drops the old socket', () => {
    const { room, dropped } = setup();
    room.join(uuid(1), 'A', 's1');
    const id = room.players[0].id;
    room.join(uuid(1), 'A', 's1b');
    expect(room.players).toHaveLength(1);
    expect(room.players[0].id).toBe(id);
    expect(room.players[0].socketId).toBe('s1b');
    expect(dropped).toEqual(['s1']);
  });

  it(`seats ${MAX_PLAYERS} players, then spectators; a freed lobby seat goes to the first spectator`, () => {
    const { room } = setup();
    for (let i = 0; i < MAX_PLAYERS + 2; i++) room.join(uuid(i), `P${i}`, `s${i}`);
    expect(room.players).toHaveLength(MAX_PLAYERS);
    expect(room.spectators.map((s) => s.name)).toEqual(['P10', 'P11']);
    room.leave('s3');
    expect(room.players).toHaveLength(MAX_PLAYERS);
    expect(room.spectators.map((s) => s.name)).toEqual(['P11']);
    expect(new Set(room.players.map((p) => p.color)).size).toBe(MAX_PLAYERS);
  });

  it('mid-game joiners become spectators', () => {
    const { room } = setup();
    room.join(uuid(1), 'A', 's1');
    room.join(uuid(2), 'B', 's2');
    expect(room.start('s1')).toBeNull();
    room.join(uuid(3), 'C', 's3');
    expect(room.spectators.map((s) => s.name)).toEqual(['C']);
  });

  it('keeps a disconnected seat for 60 s, then removes it', () => {
    const { room } = setup();
    room.join(uuid(1), 'A', 's1');
    room.join(uuid(2), 'B', 's2');
    room.disconnect('s2');
    vi.advanceTimersByTime(59_000);
    expect(room.players).toHaveLength(2);
    room.join(uuid(2), 'B', 's2b'); // back in time
    vi.advanceTimersByTime(5_000);
    expect(room.players).toHaveLength(2);
    room.disconnect('s2b');
    vi.advanceTimersByTime(60_001);
    expect(room.players.map((p) => p.name)).toEqual(['A']);
  });

  it('hands host over when the host leaves, or after 10 s disconnected', () => {
    const { room } = setup();
    room.join(uuid(1), 'A', 's1');
    room.join(uuid(2), 'B', 's2');
    room.join(uuid(3), 'C', 's3');
    const [a, b, c] = room.players;
    room.leave('s1');
    expect(room.hostId).toBe(b.id);

    room.disconnect('s2');
    vi.advanceTimersByTime(9_000);
    expect(room.hostId).toBe(b.id); // a quick refresh keeps host
    vi.advanceTimersByTime(2_000);
    expect(room.hostId).toBe(c.id);
    room.join(uuid(2), 'B', 's2c');
    expect(room.hostId).toBe(c.id); // does not snap back
    expect(a).toBeDefined();
  });

  it('start: host only, needs 2 connected players', () => {
    const { room } = setup();
    room.join(uuid(1), 'A', 's1');
    expect(room.start('s1')).toBe('need-players');
    room.join(uuid(2), 'B', 's2');
    expect(room.start('s2')).toBe('not-host');
    expect(room.start('nobody')).toBe('not-joined');
    expect(room.start('s1')).toBeNull();
    expect(room.phase).toBe('playing');
    expect(room.game?.goli).toHaveLength(4);
    expect(room.start('s1')).toBe('already-started');
  });

  it('deletes a room 30 minutes after it becomes empty', () => {
    const { store, room } = setup();
    room.join(uuid(1), 'A', 's1');
    room.disconnect('s1');
    vi.advanceTimersByTime(29 * 60_000);
    expect(store.get(room.code)).toBe(room);
    vi.advanceTimersByTime(60_001);
    expect(store.get(room.code)).toBeUndefined();
  });

  it('an unused new room also expires', () => {
    const { store, room } = setup();
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(store.get(room.code)).toBeUndefined();
  });
});
