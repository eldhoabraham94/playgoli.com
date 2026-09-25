import { randomUUID } from 'node:crypto';
import {
  DT,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  NICK_MAX,
  PLAYER_COLORS,
  applyShot,
  currentShooter,
  makeRoomCode,
  newGame,
  removePlayer,
  sanitizeNickname,
  skipTurn,
  slide,
  winners,
  type ErrorCode,
  type GameOverMsg,
  type GameState,
  type PublicMember,
  type Reaction,
  type ReactMsg,
  type RoomInfo,
  type RoomPhase,
  type RoomSnapshot,
  type ShotInput,
  type ShotMsg,
  type SlideMsg,
  type TurnMsg,
  type TurnReason,
} from '@goli/shared';

export const SPECTATOR_COLOR = '#b9a48f';

export interface Member {
  /** Client-held secret (localStorage playerId). Never sent to other clients. */
  secret: string;
  /** Public id used in snapshots and game state. */
  id: string;
  name: string;
  color: string;
  role: 'player' | 'spectator';
  socketId: string | null;
  removeTimer: ReturnType<typeof setTimeout> | null;
}

/** How a room talks to sockets (socket.io in production, a fake in tests). */
export interface RoomIO {
  send(socketId: string, event: string, payload: unknown): void;
  /** Tell a socket why, then disconnect it. */
  drop(socketId: string, code: ErrorCode): void;
}

export interface RoomTimings {
  disconnectGraceMs: number;
  hostGraceMs: number;
  emptyRoomTtlMs: number;
  shotClockMs: number;
  awayTurnMs: number;
  animBufferMs: number;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

export class Room {
  members: Member[] = [];
  hostId: string | null = null;
  phase: RoomPhase = 'lobby';
  game: GameState | null = null;
  private hostTimer: ReturnType<typeof setTimeout> | null = null;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;
  private clock: ReturnType<typeof setTimeout> | null = null;
  private deadline = 0;
  /** Secrets of kicked members: they can't come back into this room. */
  private banned = new Set<string>();
  private lastReact = new Map<string, number>();

  constructor(
    readonly code: string,
    private io: RoomIO,
    private t: RoomTimings,
    private onExpire: (room: Room) => void,
  ) {
    this.checkEmpty();
  }

  get players(): Member[] {
    return this.members.filter((m) => m.role === 'player');
  }
  get spectators(): Member[] {
    return this.members.filter((m) => m.role === 'spectator');
  }
  byId(id: string) {
    return this.members.find((m) => m.id === id);
  }
  bySocket(socketId: string) {
    return this.members.find((m) => m.socketId === socketId);
  }

  // ---------------------------------------------------------------- membership

  join(secret: string, rawNickname: string, socketId: string): Result<{ member: Member }> {
    if (this.banned.has(secret)) return { ok: false, error: 'kicked' };
    let m = this.members.find((x) => x.secret === secret);
    if (!m) {
      const name = sanitizeNickname(rawNickname);
      if (!name) return { ok: false, error: 'bad-nickname' };
      // Mid-game joiners watch; they get a seat at the next game.
      const seat = this.phase !== 'playing' && this.players.length < MAX_PLAYERS;
      if (!seat && this.spectators.length >= MAX_SPECTATORS) return { ok: false, error: 'room-full' };
      m = {
        secret,
        id: randomUUID().slice(0, 8),
        name: this.uniqueName(name),
        color: seat ? this.freeColor() : SPECTATOR_COLOR,
        role: seat ? 'player' : 'spectator',
        socketId: null,
        removeTimer: null,
      };
      this.members.push(m);
    }
    this.attach(m, socketId);
    this.ensureHost();
    this.broadcast();
    return { ok: true, member: m };
  }

  private attach(m: Member, socketId: string) {
    if (m.socketId && m.socketId !== socketId) this.io.drop(m.socketId, 'opened-elsewhere');
    m.socketId = socketId;
    if (m.removeTimer) clearTimeout(m.removeTimer);
    m.removeTimer = null;
    this.checkEmpty();
  }

  /** The socket went away; the seat is kept for disconnectGraceMs. */
  disconnect(socketId: string) {
    const m = this.bySocket(socketId);
    if (!m) return;
    m.socketId = null;
    m.removeTimer = setTimeout(() => this.remove(m), this.t.disconnectGraceMs);
    if (m.id === this.hostId) {
      if (this.hostTimer) clearTimeout(this.hostTimer);
      this.hostTimer = setTimeout(() => {
        this.hostTimer = null;
        const host = this.hostId ? this.byId(this.hostId) : undefined;
        if (!host?.socketId) {
          this.handOverHost();
          this.broadcast();
        }
      }, this.t.hostGraceMs);
    }
    // An away shooter doesn't hold everyone up for the full clock.
    if (this.game?.status === 'playing' && currentShooter(this.game) === m.id && this.clock) {
      this.setClock(Math.min(this.clockLeft() ?? 0, this.t.awayTurnMs));
    }
    this.checkEmpty();
    this.broadcast();
  }

  /** Leave on purpose: the seat is freed right away. */
  leave(socketId: string) {
    const m = this.bySocket(socketId);
    if (m) this.remove(m);
  }

  /** Host removes someone (player or spectator) for good. */
  kick(socketId: string, targetId: string): ErrorCode | null {
    const m = this.bySocket(socketId);
    if (!m) return 'not-joined';
    if (m.id !== this.hostId) return 'not-host';
    const target = this.byId(targetId);
    if (!target || target === m) return 'bad-message';
    this.banned.add(target.secret);
    if (target.socketId) this.io.drop(target.socketId, 'kicked');
    target.socketId = null;
    this.remove(target);
    return null;
  }

  /** Emoji reaction, at most one per second per member (extra ones are dropped). */
  react(socketId: string, emoji: Reaction) {
    const m = this.bySocket(socketId);
    if (!m) return;
    const now = Date.now();
    if (now - (this.lastReact.get(m.id) ?? -Infinity) < 1000) return;
    this.lastReact.set(m.id, now);
    const msg: ReactMsg = { from: m.id, emoji };
    this.sendAll('react', msg);
  }

  private remove(m: Member) {
    if (m.removeTimer) clearTimeout(m.removeTimer);
    this.lastReact.delete(m.id);
    this.members = this.members.filter((x) => x !== m);
    if (m.role === 'player' && this.phase === 'lobby') this.fillSeats();
    if (this.hostId === m.id) this.handOverHost();
    if (this.phase === 'playing' && this.game?.order.includes(m.id)) {
      const wasShooter = currentShooter(this.game) === m.id;
      this.game = removePlayer(this.game, m.id);
      if (this.game.order.length < 2) this.finish();
      else if (wasShooter) {
        this.startTurnClock(0);
        this.sendTurn('left', m.id);
      }
    }
    this.checkEmpty();
    this.broadcast();
  }

  /** Next player in join order becomes host, preferring someone connected. */
  private handOverHost() {
    const others = this.players.filter((p) => p.id !== this.hostId);
    const next = others.find((p) => p.socketId) ?? others[0];
    if (next) this.hostId = next.id;
    else if (!this.hostId || !this.byId(this.hostId)) this.hostId = null;
  }

  private ensureHost() {
    const host = this.hostId ? this.byId(this.hostId) : undefined;
    if (!host || host.role !== 'player') {
      this.hostId = null;
      this.handOverHost();
    }
  }

  /** Seat spectators (in join order) while there is room. */
  private fillSeats() {
    for (const s of this.spectators) {
      if (this.players.length >= MAX_PLAYERS) break;
      s.role = 'player';
      s.color = this.freeColor();
    }
    this.ensureHost();
  }

  // ---------------------------------------------------------------- game

  start(socketId: string): ErrorCode | null {
    const m = this.bySocket(socketId);
    if (!m) return 'not-joined';
    if (m.id !== this.hostId) return 'not-host';
    if (this.phase === 'playing') return 'already-started';
    const ready = this.players.filter((p) => p.socketId);
    if (ready.length < 2) return 'need-players';
    this.beginGame(ready);
    return null;
  }

  playAgain(socketId: string): ErrorCode | null {
    const m = this.bySocket(socketId);
    if (!m) return 'not-joined';
    if (m.id !== this.hostId) return 'not-host';
    if (this.phase !== 'over') return 'not-over';
    this.fillSeats();
    const ready = this.players.filter((p) => p.socketId);
    if (ready.length < 2) {
      this.phase = 'lobby';
      this.game = null;
      this.broadcast();
    } else this.beginGame(ready);
    return null;
  }

  private beginGame(players: Member[]) {
    this.phase = 'playing';
    this.game = newGame(players.map((p) => p.id));
    this.startTurnClock(0);
    this.broadcast();
  }

  slide(socketId: string, angle: number) {
    const m = this.bySocket(socketId);
    if (!m || this.phase !== 'playing' || !this.game) return;
    const next = slide(this.game, m.id, angle);
    if (!next) return;
    this.game = next;
    const msg: SlideMsg = { seq: next.seq, angle, x: next.striker.x, y: next.striker.y };
    this.sendAll('slide', msg, socketId);
  }

  shoot(socketId: string, input: ShotInput): ErrorCode | null {
    const m = this.bySocket(socketId);
    if (!m) return 'not-joined';
    if (this.phase !== 'playing' || !this.game) return 'not-playing';
    const r = applyShot(this.game, m.id, input);
    if (!r.ok) return r.error as ErrorCode;
    this.game = r.state;
    if (r.state.status === 'over') {
      this.stopClock();
      this.sendAll('shot', { ...r.shot, clockMs: null } satisfies ShotMsg);
      this.finish();
      this.broadcast();
    } else {
      // Everyone watches the shot roll before the next clock starts.
      const animMs = Math.ceil(r.shot.steps * DT * 1000) + this.t.animBufferMs;
      this.startTurnClock(animMs);
      this.sendAll('shot', { ...r.shot, clockMs: this.clockLeft() } satisfies ShotMsg);
    }
    return null;
  }

  private finish() {
    if (!this.game) return;
    this.stopClock();
    if (this.game.status !== 'over') this.game = { ...this.game, status: 'over', seq: this.game.seq + 1 };
    this.phase = 'over';
    const msg: GameOverMsg = { winners: winners(this.game), pouches: this.game.pouches };
    this.sendAll('gameOver', msg);
  }

  private startTurnClock(delayMs: number) {
    const g = this.game;
    if (!g || g.status !== 'playing') return this.stopClock();
    const shooter = this.byId(currentShooter(g) ?? '');
    this.setClock(delayMs + (shooter?.socketId ? this.t.shotClockMs : this.t.awayTurnMs));
  }

  private setClock(ms: number) {
    this.stopClock();
    this.deadline = Date.now() + ms;
    this.clock = setTimeout(() => this.onClockExpired(), ms);
  }

  private stopClock() {
    if (this.clock) clearTimeout(this.clock);
    this.clock = null;
  }

  clockLeft(): number | null {
    return this.clock ? Math.max(0, this.deadline - Date.now()) : null;
  }

  private onClockExpired() {
    this.clock = null;
    const g = this.game;
    if (!g || g.status !== 'playing') return;
    const skipped = currentShooter(g)!;
    const away = !this.byId(skipped)?.socketId;
    this.game = skipTurn(g);
    this.startTurnClock(0);
    this.sendTurn(away ? 'away' : 'timeout', skipped);
  }

  private sendTurn(reason: TurnReason, skippedId: string) {
    if (!this.game) return;
    const msg: TurnMsg = { game: this.game, clockMs: this.clockLeft(), reason, skippedId };
    this.sendAll('turn', msg);
  }

  // ---------------------------------------------------------------- helpers

  private freeColor(): string {
    const used = new Set(this.players.map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? SPECTATOR_COLOR;
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.members.map((m) => m.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`;
      const candidate = Array.from(name).slice(0, NICK_MAX - suffix.length).join('').trimEnd() + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  private checkEmpty() {
    const anyone = this.members.some((m) => m.socketId);
    if (anyone) {
      if (this.emptyTimer) clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    } else if (!this.emptyTimer) {
      this.emptyTimer = setTimeout(() => this.onExpire(this), this.t.emptyRoomTtlMs);
    }
  }

  private pub(m: Member): PublicMember {
    return { id: m.id, name: m.name, color: m.color, connected: m.socketId !== null };
  }

  snapshot(you: string): RoomSnapshot {
    return {
      code: this.code,
      you,
      hostId: this.hostId,
      phase: this.phase,
      players: this.players.map((m) => this.pub(m)),
      spectators: this.spectators.map((m) => this.pub(m)),
      game: this.game,
      clockMs: this.clockLeft(),
    };
  }

  info(): RoomInfo {
    return {
      code: this.code,
      phase: this.phase,
      players: this.players.length,
      spectators: this.spectators.length,
      maxPlayers: MAX_PLAYERS,
    };
  }

  /** Full per-recipient snapshot to everyone connected. */
  broadcast() {
    for (const m of this.members) if (m.socketId) this.io.send(m.socketId, 'room', this.snapshot(m.id));
  }

  private sendAll(event: string, payload: unknown, exceptSocket?: string) {
    for (const m of this.members) if (m.socketId && m.socketId !== exceptSocket) this.io.send(m.socketId, event, payload);
  }

  dispose() {
    this.stopClock();
    if (this.hostTimer) clearTimeout(this.hostTimer);
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    for (const m of this.members) if (m.removeTimer) clearTimeout(m.removeTimer);
  }
}

export class RoomStore {
  readonly rooms = new Map<string, Room>();

  constructor(
    private io: RoomIO,
    private t: RoomTimings,
    private maxRooms: number,
  ) {}

  create(): Room | null {
    if (this.rooms.size >= this.maxRooms) return null;
    for (let i = 0; i < 50; i++) {
      const code = makeRoomCode();
      if (this.rooms.has(code)) continue;
      const room = new Room(code, this.io, this.t, (r) => this.delete(r.code));
      this.rooms.set(code, room);
      return room;
    }
    return null;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  delete(code: string) {
    this.rooms.get(code)?.dispose();
    this.rooms.delete(code);
  }

  dispose() {
    for (const code of [...this.rooms.keys()]) this.delete(code);
  }
}
