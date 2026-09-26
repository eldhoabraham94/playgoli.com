import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { config as defaults, type Config } from './config';
import { clientIp, makeHttpHandler } from './http';
import { RoomStore, type RoomIO } from './rooms';
import { attachSockets } from './sockets';
import { loadSite } from './static';

export function createApp(overrides: Partial<Config> = {}) {
  const cfg: Config = { ...defaults, ...overrides };
  const site = loadSite(cfg.staticDir);

  // The HTTP handler must be registered before socket.io wraps the server,
  // so it is bound late (it needs the store, which needs io).
  let handle: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => res.end();
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, {
    serveClient: false,
    // Room for one voice clip (VOICE_MAX_BYTES) plus framing.
    maxHttpBufferSize: 40_000,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  // Cap open sockets per IP.
  const perIp = new Map<string, number>();
  io.use((socket, next) => {
    const ip = clientIp(socket.request, cfg.trustProxy);
    const n = perIp.get(ip) ?? 0;
    if (n >= cfg.maxSocketsPerIp) return next(new Error('too-many-connections'));
    perIp.set(ip, n + 1);
    socket.on('disconnect', () => {
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left > 0) perIp.set(ip, left);
      else perIp.delete(ip);
    });
    next();
  });

  const roomIO: RoomIO = {
    send: (socketId, event, payload) => io.to(socketId).emit(event, payload),
    drop: (socketId, code) => {
      const s = io.sockets.sockets.get(socketId);
      if (!s) return;
      s.emit('error', { code });
      s.disconnect(true);
    },
  };
  const store = new RoomStore(roomIO, cfg, cfg.maxRooms);
  handle = makeHttpHandler(store, cfg, site);
  attachSockets(io, store, cfg);

  return {
    cfg,
    io,
    store,
    httpServer,
    servesClient: site !== null,
    listen(port = cfg.port): Promise<number> {
      return new Promise((resolve) => {
        httpServer.listen(port, () => resolve((httpServer.address() as AddressInfo).port));
      });
    },
    async close() {
      store.dispose();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
