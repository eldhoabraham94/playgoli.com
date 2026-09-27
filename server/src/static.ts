/**
 * Serves the built client (client/dist) in production: everything is loaded
 * into memory at startup (it is small), gzipped once, and looked up by exact
 * path, so request paths never touch the filesystem (no traversal possible).
 *
 * Each app route gets its own title, description, canonical URL, robots rule,
 * structured data and crawlable text (see shared/src/seo.ts).
 */
import {
  HOME_META,
  HOW_TO_META,
  PRACTICE_META,
  homeJsonLd,
  homeSeoHtml,
  howToJsonLd,
  howToSeoHtml,
  type PageMeta,
} from '@goli/shared';
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
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

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
    "manifest-src 'self'",
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
  /** When the client was built (sitemap lastmod). */
  builtAt: Date;
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
  return { assets, template: readFileSync(indexPath, 'utf8'), builtAt: statSync(indexPath).mtime };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Public origin for absolute URLs: PUBLIC_URL if set, else from the request. */
export function originOf(req: IncomingMessage, publicUrl: string | undefined, trustProxy: boolean): string {
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  const fwdProto = trustProxy ? String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() : '';
  const proto = fwdProto === 'https' ? 'https' : 'http';
  const host = String(req.headers.host ?? 'localhost').replace(/[^A-Za-z0-9.:-]/g, '');
  return `${proto}://${host}`;
}

/** Pages we want in search results (for the sitemap). */
export const INDEXED_PATHS = ['/', '/how-to-play', '/practice'];

/** Structured data as <script type="application/ld+json">, safe against "</script>". */
const jsonLd = (items: object[]) =>
  items.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('');

export interface Rendered {
  html: string;
  status: number;
}

/**
 * Fill the page for one route: title, description, canonical URL, robots rule,
 * link-preview tags, structured data, and real text for crawlers. React replaces
 * #root's content once it starts, with the same copy (shared/src/seo.ts).
 */
export function renderIndex(template: string, origin: string, path: string): Rendered {
  const clean = path.replace(/\/+$/, '') || '/';
  const room = /^\/r\/([A-Za-z]{4})$/.exec(clean)?.[1]?.toUpperCase();
  let meta: PageMeta;
  let status = 200;
  let robots = 'index, follow, max-image-preview:large';
  let canonical = `${origin}${clean}`;
  if (clean === '/') canonical = `${origin}/`;
  let body = '';
  let ld: object[] = [];

  if (clean === '/') {
    meta = HOME_META;
    body = homeSeoHtml();
    ld = homeJsonLd(origin);
  } else if (clean === '/how-to-play') {
    meta = HOW_TO_META;
    body = howToSeoHtml();
    ld = howToJsonLd(origin);
  } else if (clean === '/practice') {
    meta = PRACTICE_META;
  } else if (room) {
    // Game rooms come and go: great for link previews, not for search results.
    meta = {
      title: `Join game ${room} | Goli`,
      description: `Tap to join game ${room}. The marbles game from the school ground. Up to 10 friends, no sign-up.`,
      ogTitle: 'Come play Goli with me!',
    };
    robots = 'noindex, follow';
    canonical = `${origin}/r/${room}`;
  } else {
    meta = { title: 'Page not found | Goli', description: HOME_META.description, ogTitle: HOME_META.ogTitle };
    robots = 'noindex, follow';
    canonical = `${origin}/`;
    status = 404;
  }

  const vars: Record<string, string> = {
    TITLE: esc(meta.title),
    OG_TITLE: esc(meta.ogTitle),
    OG_DESC: esc(meta.description),
    OG_URL: esc(canonical),
    OG_IMAGE: esc(`${origin}/og.png`),
    CANONICAL: esc(canonical),
    ROBOTS: esc(robots),
    JSONLD: jsonLd(ld),
    SEO_BODY: body,
  };
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
  return { html, status };
}

export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /r/\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(origin: string, lastmod: string): string {
  const urls = INDEXED_PATHS.map(
    (p) =>
      `  <url><loc>${origin}${p}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>${p === '/' ? '1.0' : '0.7'}</priority></url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
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

const text = (body: string, type: string) => {
  const b = Buffer.from(body);
  return { body: b, gz: gzipSync(b), type, cache: 'public, max-age=3600' };
};

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
  const origin = originOf(req, opts.publicUrl, opts.trustProxy);
  if (path === '/robots.txt') {
    send(req, res, 200, text(robotsTxt(origin), TYPES['.txt']));
    return true;
  }
  if (path === '/sitemap.xml') {
    send(req, res, 200, text(sitemapXml(origin, site.builtAt.toISOString().slice(0, 10)), TYPES['.xml']));
    return true;
  }
  // A missing file (anything with an extension, or under /assets) is a real 404.
  if (path.startsWith('/assets/') || extname(path)) return false;
  // Everything else gets the app shell; unknown pages say so with a 404 (and noindex).
  const page = renderIndex(site.template, origin, path);
  const html = Buffer.from(page.html);
  send(req, res, page.status, { body: html, gz: gzipSync(html), type: TYPES['.html'], cache: 'no-cache' });
  return true;
}
