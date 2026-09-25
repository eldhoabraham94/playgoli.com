import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from './config';
import { WindowLimiter } from './rateLimit';
import type { RoomStore } from './rooms';
import { SECURITY_HEADERS, serveStatic, type Site } from './static';

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function makeHttpHandler(store: RoomStore, cfg: Config, site: Site | null) {
  const createLimiter = new WindowLimiter(cfg.createLimit.max, cfg.createLimit.windowMs);
  setInterval(() => createLimiter.sweep(), 60_000).unref();

  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname;

    if (path === '/healthz') return json(res, 200, { ok: true, rooms: store.rooms.size });

    if (path === '/api/rooms' && req.method === 'POST') {
      if (!createLimiter.hit(clientIp(req, cfg.trustProxy))) return json(res, 429, { error: 'rate-limited' });
      const room = store.create();
      if (!room) return json(res, 503, { error: 'busy' });
      return json(res, 201, { code: room.code });
    }

    const m = /^\/api\/rooms\/([A-Za-z]{4})$/.exec(path);
    if (m && req.method === 'GET') {
      const room = store.get(m[1].toUpperCase());
      return room ? json(res, 200, room.info()) : json(res, 404, { error: 'room-not-found' });
    }

    if (path.startsWith('/api/')) return json(res, 404, { error: 'not-found' });

    if (site && serveStatic(site, req, res, path, { publicUrl: cfg.publicUrl, trustProxy: cfg.trustProxy })) return;

    res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain' });
    res.end(site ? 'Not found' : 'Not found (no client build: run "npm run build", or use Vite on :5173 in dev)');
  };
}
