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
  writeFileSync(
    join(dir, 'index.html'),
    '<title>{{OG_TITLE}}</title><meta property="og:url" content="{{OG_URL}}"><meta property="og:image" content="{{OG_IMAGE}}"><meta name="d" content="{{OG_DESC}}">',
  );
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log("goli")'.repeat(50));
  writeFileSync(join(dir, 'og.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  app = createApp({ staticDir: dir, publicUrl: 'https://goli.example.com/' });
  base = `http://localhost:${await app.listen(0)}`;
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('static client + Open Graph', () => {
  it('serves the SPA shell for app routes, with absolute OG URLs', async () => {
    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get('cache-control')).toBe('no-cache');
    expect(home.headers.get('content-security-policy')).toContain("default-src 'self'");
    const html = await home.text();
    expect(html).toContain('<title>Goli: marbles with friends</title>');
    expect(html).toContain('content="https://goli.example.com/og.png"');

    const room = await (await fetch(`${base}/r/abcd`)).text();
    expect(room).toContain('Come play Goli with me!');
    expect(room).toContain('content="https://goli.example.com/r/ABCD"');
    expect(room).toContain('join game ABCD');

    expect((await fetch(`${base}/practice`)).status).toBe(200);
  });

  it('serves hashed assets immutable and gzipped', async () => {
    const r = await fetch(`${base}/assets/app-abc123.js`, { headers: { 'accept-encoding': 'gzip' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/javascript');
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect(await r.text()).toContain('console.log("goli")');
    expect(r.headers.get('content-encoding')).toBe('gzip');
    expect((await fetch(`${base}/og.png`)).headers.get('content-type')).toBe('image/png');
  });

  it('404s missing files and never reads outside the build', async () => {
    expect((await fetch(`${base}/assets/nope.js`)).status).toBe(404);
    expect((await fetch(`${base}/missing.png`)).status).toBe(404);
    expect((await fetch(`${base}/..%2F..%2Fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/api/whatever`)).status).toBe(404);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });
});
