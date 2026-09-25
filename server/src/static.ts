/**
 * Serves the built client (client/dist) in production: everything is loaded
 * into memory at startup (it is small), gzipped once, and looked up by exact
 * path, so request paths never touch the filesystem (no traversal possible).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);

export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; '),
};

interface Asset {
  body: Buffer;
  gz: Buffer | null;
  type: string;
  cache: string;
}

export interface Site {
  assets: Map<string, Asset>;
  template: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function loadSite(dir: string): Site | null {
  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) return null;
  const assets = new Map<string, Asset>();
  for (const file of walk(dir)) {
    const url = '/' + relative(dir, file).split(sep).join('/');
    if (url === '/index.html') continue;
    const ext = extname(file).toLowerCase();
    const body = readFileSync(file);
    assets.set(url, {
      body,
      gz: COMPRESSIBLE.has(ext) ? gzipSync(body) : null,
      type: TYPES[ext] ?? 'application/octet-stream',
      // Vite puts content-hashed files in /assets: cache them forever.
      cache: url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    });
  }
  return { assets, template: readFileSync(indexPath, 'utf8') };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Public origin for absolute OG URLs: PUBLIC_URL if set, else from the request. */
export function originOf(req: IncomingMessage, publicUrl: string | undefined, trustProxy: boolean): string {
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  const fwdProto = trustProxy ? String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() : '';
  const proto = fwdProto === 'https' ? 'https' : 'http';
  const host = String(req.headers.host ?? 'localhost').replace(/[^A-Za-z0-9.:-]/g, '');
  return `${proto}://${host}`;
}

/** Fill the Open Graph placeholders; room links get an invitation preview. */
export function renderIndex(template: string, origin: string, path: string): string {
  const room = /^\/r\/([A-Za-z]{4})\/?$/.exec(path)?.[1]?.toUpperCase();
  const vars: Record<string, string> = room
    ? {
        OG_TITLE: 'Come play Goli with me!',
        OG_DESC: `Tap to join game ${room}. The marbles game from the school ground. Up to 10 friends, no sign-up.`,
        OG_URL: `${origin}/r/${room}`,
      }
    : {
        OG_TITLE: 'Goli: marbles with friends',
        OG_DESC: 'The Indian childhood marbles game. One ring, up to 10 friends, no sign-up. Plays great on your phone.',
        OG_URL: `${origin}/`,
      };
  vars.OG_IMAGE = `${origin}/og.png`;
  return template.replace(/\{\{(OG_[A-Z]+)\}\}/g, (m, k: string) => (k in vars ? esc(vars[k]) : m));
}

function send(req: IncomingMessage, res: ServerResponse, status: number, a: Omit<Asset, 'gz'> & { gz?: Buffer | null }) {
  const gzip = a.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  const body = gzip ? a.gz! : a.body;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': a.type,
    'cache-control': a.cache,
    'content-length': body.length,
    vary: 'accept-encoding',
    ...(gzip ? { 'content-encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/** Returns true if it handled the request. */
export function serveStatic(
  site: Site,
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  opts: { publicUrl?: string; trustProxy: boolean },
): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const asset = site.assets.get(path);
  if (asset) {
    send(req, res, 200, asset);
    return true;
  }
  // A missing file (anything with an extension, or under /assets) is a real 404.
  if (path.startsWith('/assets/') || extname(path)) return false;
  // Everything else is an app route (/, /r/CODE, /practice): the SPA shell.
  const html = Buffer.from(renderIndex(site.template, originOf(req, opts.publicUrl, opts.trustProxy), path));
  send(req, res, 200, { body: html, gz: gzipSync(html), type: TYPES['.html'], cache: 'no-cache' });
  return true;
}
