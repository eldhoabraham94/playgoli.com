/**
 * Wire protocol. Client -> server payloads are runtime-validated with zod
 * (never trust clients). Server -> client payloads are plain typed objects.
 *
 * Identity: the client's `playerId` (localStorage UUID) is a SECRET used only
 * to reclaim a seat. Everything public (snapshots, game order, kick) uses the
 * short `id` the server assigns to each member.
 */
import { z } from 'zod';
import { CODE_ALPHABET, CODE_LENGTH } from './code';
import { REACTIONS, type Reaction } from './constants';
import type { GameState, ShotResult } from './rules';

const angle = z.number().finite().min(-100).max(100);
const code = z.string().regex(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`));
const playerId = z.string().uuid();
const publicId = z.string().min(1).max(32);

export const C2S = {
  join: z.object({ code, playerId, nickname: z.string().max(64) }),
  start: z.object({}),
  slide: z.object({ angle }),
  shoot: z.object({ seq: z.number().int().min(0), angle, power: z.number().finite().gt(0).max(1) }),
  react: z.object({ emoji: z.enum(REACTIONS) }),
  kick: z.object({ playerId: publicId }),
  playAgain: z.object({}),
  leave: z.object({}),
} as const;

export type C2SEvent = keyof typeof C2S;
export type C2SPayload<E extends C2SEvent> = z.infer<(typeof C2S)[E]>;

export function isC2SEvent(e: string): e is C2SEvent {
  return Object.prototype.hasOwnProperty.call(C2S, e);
}

export function parseC2S<E extends C2SEvent>(event: E, payload: unknown): C2SPayload<E> | null {
  const r = C2S[event].safeParse(payload ?? {});
  return r.success ? (r.data as C2SPayload<E>) : null;
}

// ---- Server -> client ----

export type RoomPhase = 'lobby' | 'playing' | 'over';

export interface PublicMember {
  id: string;
  name: string;
  color: string;
  connected: boolean;
}

export interface RoomSnapshot {
  code: string;
  /** The receiving member's public id. */
  you: string;
  hostId: string | null;
  phase: RoomPhase;
  players: PublicMember[];
  spectators: PublicMember[];
  game: GameState | null;
  /** Milliseconds left on the shot clock when this snapshot was sent. */
  clockMs: number | null;
}

/** Play passed without a shot. */
export type TurnReason = 'timeout' | 'away' | 'left';

export interface TurnMsg {
  game: GameState;
  /** Shot clock for the new turn, in ms from now. */
  clockMs: number | null;
  reason: TurnReason;
  /** Whose turn was skipped / who left. */
  skippedId: string;
}

/** The shooter lining up (relayed to everyone else). */
export interface SlideMsg {
  seq: number;
  angle: number;
  x: number;
  y: number;
}

/** A resolved shot. Clients animate it, then show shot.after. */
export interface ShotMsg extends ShotResult {
  /** Next shot clock in ms from now, including the time the animation takes; null when the game ended. */
  clockMs: number | null;
}

export interface ReactMsg {
  from: string;
  emoji: Reaction;
}

export interface GameOverMsg {
  winners: string[];
  pouches: Record<string, number[]>;
}

/** GET /api/rooms/:code — what the join screen shows before joining. */
export interface RoomInfo {
  code: string;
  phase: RoomPhase;
  players: number;
  spectators: number;
  maxPlayers: number;
}

export type ErrorCode =
  | 'room-not-found'
  | 'room-full'
  | 'bad-nickname'
  | 'bad-message'
  | 'rate-limited'
  | 'not-joined'
  | 'not-host'
  | 'need-players'
  | 'already-started'
  | 'opened-elsewhere'
  | 'kicked'
  | 'not-playing'
  | 'not-your-turn'
  | 'stale-seq'
  | 'bad-shot'
  | 'not-over'
  | 'server-error';

export interface ServerError {
  code: ErrorCode;
}

export const ERROR_TEXT: Record<ErrorCode, string> = {
  'room-not-found': "That game doesn't exist any more.",
  'room-full': 'This game is full.',
  'bad-nickname': 'Please pick a different name.',
  'bad-message': 'Something went wrong. Try again.',
  'rate-limited': 'Slow down a little!',
  'not-joined': 'You are not in this game.',
  'not-host': 'Only the host can do that.',
  'need-players': 'Need at least 2 players to start.',
  'already-started': 'The game has already started.',
  'opened-elsewhere': 'You opened this game in another tab.',
  kicked: 'The host removed you from this game.',
  'not-playing': 'No game is running.',
  'not-your-turn': "It's not your turn.",
  'stale-seq': 'That shot was too late.',
  'bad-shot': 'That shot was not allowed.',
  'not-over': 'The game is still going.',
  'server-error': 'Server hiccup. Try again.',
};
