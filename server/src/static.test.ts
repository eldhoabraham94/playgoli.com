import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';

let dir: string;
let app: ReturnType<typeof createApp>;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'goli-static-'));
  mkdirSync(join(dir, 'assets'));
  // A minimal version of client/index.html with every placeholder the server fills.
  writeFileSync(
    join(dir, 'index.html'),
    '<title>{{TITLE}}</title><meta name="description" content="{{OG_DESC}}"><meta name="robots" content="{{ROBOTS}}">' +
      '<link rel="canonical" href="{{CANONICAL}}"><meta property="og:title" content="{{OG_TITLE}}">' +
      '<meta property="og:url" content="{{OG_URL}}"><meta property="og:image" content="{{OG_IMAGE}}">{{JSONLD}}' +
      '<div id="root">{{SEO_BODY}}</div>',
  );
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log("goli")'.repeat(50));
  writeFileSync(join(dir, 'og.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"Goli"}');
  app = createApp({ staticDir: dir, publicUrl: 'https://www.playgoli.com/' });
  base = `http://localhost:${await app.listen(0)}`;
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const ld = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as { '@type': string });

describe('pages for people and search engines', () => {
  it('home: keyword title, canonical, indexable, crawlable text and structured data', async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    const html = await r.text();
    expect(html).toMatch(/<title>Goli – Free Online Multiplayer Marbles Game[^<]*<\/title>/);
    expect(html).toContain('<link rel="canonical" href="https://www.playgoli.com/">');
    expect(html).toContain('content="index, follow');
    expect(html).toContain('content="https://www.playgoli.com/og.png"');
    expect(html).toContain('<h1>Goli: the free online multiplayer marbles game</h1>');
    expect(html).toContain('How many players can play?');
    const types = ld(html).map((o) => o['@type']);
    expect(types).toEqual(['WebSite', 'VideoGame', 'FAQPage']);
  });

  it('how-to-play: its own page, rules text, article data', async () => {
    const r = await fetch(`${base}/how-to-play`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('<title>How to Play Goli (Marbles)');
    expect(html).toContain('<link rel="canonical" href="https://www.playgoli.com/how-to-play">');
    expect(html).toContain('<h2>Points</h2>');
    expect(ld(html).map((o) => o['@type'])).toEqual(['Article', 'BreadcrumbList']);
  });

  it('game rooms get an invite preview but are kept out of search results', async () => {
    const html = await (await fetch(`${base}/r/abcd`)).text();
    expect(html).toContain('content="Come play Goli with me!"');
    expect(html).toContain('content="https://www.playgoli.com/r/ABCD"');
    expect(html).toContain('join game ABCD');
    expect(html).toContain('content="noindex, follow"');
    expect(ld(html)).toEqual([]);
  });

  it('unknown pages are a real 404 (still the app, so people land somewhere)', async () => {
    const r = await fetch(`${base}/no-such-page`);
    expect(r.status).toBe(404);
    expect(await r.text()).toContain('content="noindex, follow"');
    expect((await fetch(`${base}/practice`)).status).toBe(200);
  });

  it('robots.txt and sitemap.xml', async () => {
    const robots = await (await fetch(`${base}/robots.txt`)).text();
    expect(robots).toContain('Disallow: /r/');
    expect(robots).toContain('Sitemap: https://www.playgoli.com/sitemap.xml');
    const r = await fetch(`${base}/sitemap.xml`);
    expect(r.headers.get('content-type')).toContain('application/xml');
    const xml = await r.text();
    for (const p of ['/', '/how-to-play', '/practice']) expect(xml).toContain(`<loc>https://www.playgoli.com${p}</loc>`);
    expect(xml).not.toContain('/r/');
  });
});

describe('static files', () => {
  it('serves hashed assets immutable and gzipped, and the manifest', async () => {
    const r = await fetch(`${base}/assets/app-abc123.js`, { headers: { 'accept-encoding': 'gzip' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/javascript');
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect(await r.text()).toContain('console.log("goli")');
    expect(r.headers.get('content-encoding')).toBe('gzip');
    expect((await fetch(`${base}/og.png`)).headers.get('content-type')).toBe('image/png');
    expect((await fetch(`${base}/manifest.webmanifest`)).headers.get('content-type')).toBe('application/manifest+json');
  });

  it('404s missing files and never reads outside the build', async () => {
    expect((await fetch(`${base}/assets/nope.js`)).status).toBe(404);
    expect((await fetch(`${base}/missing.png`)).status).toBe(404);
    expect((await fetch(`${base}/..%2F..%2Fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/api/whatever`)).status).toBe(404);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });
});
