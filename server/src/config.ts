import { ANIM_BUFFER_MS, AWAY_TURN_MS, SHOT_CLOCK_MS } from '@goli/shared';
import { fileURLToPath } from 'node:url';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /** Public origin, e.g. https://goli.onrender.com (for absolute Open Graph URLs). */
  publicUrl: process.env.PUBLIC_URL || undefined,
  /** Behind Render/Fly's proxy, trust X-Forwarded-For / -Proto. */
  trustProxy: process.env.TRUST_PROXY === '1',
  /** Built client to serve. Same relative path from server/src (tsx) and server/dist (bundle). */
  staticDir: process.env.STATIC_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url)),
  /** Seat is kept this long after a disconnect. */
  disconnectGraceMs: 60_000,
  /** A disconnected host hands over after this long. */
  hostGraceMs: 10_000,
  shotClockMs: SHOT_CLOCK_MS,
  awayTurnMs: AWAY_TURN_MS,
  animBufferMs: ANIM_BUFFER_MS,
  /** Rooms with nobody connected are deleted after this. */
  emptyRoomTtlMs: 30 * 60_000,
  /** Room creation per IP. */
  createLimit: { max: 10, windowMs: 10 * 60_000 },
  /** Messages per socket (token bucket). */
  socketRate: { burst: 30, perSec: 15 },
  /** Voice clips per socket (one a second, a little slack). */
  voiceRate: { burst: 6, perSec: 4 },
  /** Open sockets per IP (a whole school on one Wi-Fi still fits). */
  maxSocketsPerIp: 60,
  maxRooms: 5000,
};

export type Config = typeof config;
