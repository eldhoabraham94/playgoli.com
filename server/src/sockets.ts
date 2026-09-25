import { isC2SEvent, parseC2S, type C2SEvent, type C2SPayload, type ErrorCode } from '@goli/shared';
import type { Server, Socket } from 'socket.io';
import type { Config } from './config';
import { TokenBucket } from './rateLimit';
import type { Room, RoomStore } from './rooms';

export function attachSockets(io: Server, store: RoomStore, cfg: Config) {
  io.on('connection', (socket: Socket) => {
    const bucket = new TokenBucket(cfg.socketRate.burst, cfg.socketRate.perSec);
    let room: Room | null = null;

    const fail = (code: ErrorCode) => socket.emit('error', { code });

    function on<E extends C2SEvent>(event: E, fn: (data: C2SPayload<E>) => void) {
      socket.on(event as string, (payload: unknown): void => {
        if (!bucket.take()) {
          fail('rate-limited');
          return;
        }
        const data = parseC2S(event, payload);
        if (!data) {
          fail('bad-message');
          return;
        }
        try {
          fn(data);
        } catch (e) {
          console.error(`[${event}]`, e);
          fail('server-error');
        }
      });
    }

    // Unknown events still cost tokens, so junk can't be spammed for free.
    socket.onAny((event: string) => {
      if (!isC2SEvent(event) && !bucket.take()) socket.disconnect(true);
    });

    const current = () => (room && store.get(room.code) === room ? room : null);

    on('join', (d) => {
      const target = store.get(d.code);
      if (!target) return fail('room-not-found');
      const prev = current();
      if (prev && prev !== target) prev.disconnect(socket.id);
      const r = target.join(d.playerId, d.nickname, socket.id);
      if (!r.ok) return fail(r.error);
      room = target;
    });

    on('start', () => {
      const r = current();
      if (!r) return fail('not-joined');
      const err = r.start(socket.id);
      if (err) fail(err);
    });

    on('slide', (d) => current()?.slide(socket.id, d.angle));

    on('shoot', (d) => {
      const r = current();
      if (!r) return fail('not-joined');
      const err = r.shoot(socket.id, d);
      if (err) fail(err);
    });

    on('playAgain', () => {
      const r = current();
      if (!r) return fail('not-joined');
      const err = r.playAgain(socket.id);
      if (err) fail(err);
    });

    on('kick', (d) => {
      const r = current();
      if (!r) return fail('not-joined');
      const err = r.kick(socket.id, d.playerId);
      if (err) fail(err);
    });

    on('react', (d) => current()?.react(socket.id, d.emoji));

    on('leave', () => {
      current()?.leave(socket.id);
      room = null;
    });

    socket.on('disconnect', () => current()?.disconnect(socket.id));
  });
}
