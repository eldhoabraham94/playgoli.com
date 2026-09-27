// Screenshots of every screen at phone size, via headless Chrome (DevTools protocol).
// Needs `npm run dev` running. Usage: npm run shots [-- --width 384 --height 824 --out shots]
// Set CHROME=/path/to/chrome if Chrome/Edge isn't found.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const { io } = require('socket.io-client');
const WebSocket = require('ws');

const { values: a } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5173' },
    api: { type: 'string', default: 'http://localhost:3000' },
    width: { type: 'string', default: '384' },
    height: { type: 'string', default: '824' },
    scale: { type: 'string', default: '2' },
    out: { type: 'string', default: 'shots' },
    landscape: { type: 'boolean', default: false },
    splash: { type: 'boolean', default: false },
  },
});
const W = Number(a.landscape ? a.height : a.width);
const H = Number(a.landscape ? a.width : a.height);
const OUT = a.out;
mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = CANDIDATES.find((p) => existsSync(p));
if (!chromePath) throw new Error('Chrome not found; set CHROME=/path/to/chrome');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'goli-shots-'))}`,
    '--no-first-run',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch {}
}
if (!wsUrl) throw new Error('could not reach headless Chrome');

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.on('open', r));
let id = 0;
const pending = new Map();
ws.on('message', (m) => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
const waitFor = async (expr, ms = 8000) => {
  for (let t = 0; t < ms; t += 100) {
    if (await js(expr)) return true;
    await sleep(100);
  }
  throw new Error(`timed out waiting for: ${expr}`);
};
const clickText = (text) =>
  js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return !!b; })()`);
const shot = async (name) => {
  await sleep(700);
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  // Report anything that doesn't fit on screen.
  const over = await js(`(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('.board-shadow, .ambient, .rain')) continue;
      if (el.closest('.float-layer, .strip, .lobby-body, .card, .screen')) {
        if (!el.closest('.screen') || el.closest('.lobby-body, .card, .strip')) continue;
      }
      if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1)
        out.push((el.className || el.tagName) + ' ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    return out.slice(0, 8);
  })()`);
  console.log(`${name}.png${over.length ? `  ⚠ off-screen: ${over.join(' | ')}` : '  ✓ fits'}`);
};

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: Number(a.scale), mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
console.log(`Viewport ${W}×${H} @${a.scale}x → ${OUT}/`);

const go = async (path) => {
  await cdp('Page.navigate', { url: a.url + path });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#root > *') && !document.getElementById('splash')`);
  await js('document.fonts.ready.then(() => true)');
};

// Loading scene: frames across one 2.8 s loop of the shot (kept up with ?splash).
if (a.splash) {
  await cdp('Page.navigate', { url: a.url + '/?splash' });
  const t0 = Date.now();
  for (const ms of [250, 700, 1000, 1150, 1450, 2000, 2600, 3600]) {
    await sleep(Math.max(0, ms - (Date.now() - t0)));
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `splash-${String(ms).padStart(4, '0')}ms.png`), Buffer.from(data, 'base64'));
  }
  console.log('splash frames written');
  ws.close();
  chrome.kill();
  process.exit(0);
}

// Home
await go('/');
await shot('1-home');

// Create a game → join screen → lobby
await clickText('Create game');
await waitFor(`location.pathname.startsWith('/r/')`);
await waitFor(`!!document.querySelector('#nick')`);
const code = await js('location.pathname.slice(3)');
await shot('2-join');
await clickText('Join');
await waitFor(`!!document.querySelector('.lobby')`);

// Fill the room with bots so the lobby and strip look busy.
const names = ['Goli Master', 'Last Bench Hero', 'Ammini Kutty', 'Porotta King', 'Mango Thief', 'Chaya Kada', 'Recess Raja', 'Kite Runner', 'Thumbi Rani'];
const bots = names.map((nickname, i) => {
  const s = io(a.api, { transports: ['websocket'], forceNew: true });
  s.on('connect', () => s.emit('join', { code, playerId: `00000000-0000-4000-8000-${String(900 + i).padStart(12, '0')}`, nickname }));
  return s;
});
await waitFor(`document.querySelectorAll('.players li:not(.empty)').length >= 10`);
await shot('3-lobby');

// Start → game
await clickText('Start');
await waitFor(`!!document.querySelector('canvas.board')`);
await sleep(600);
await shot('4-game');

// Results overlay (inject a finished-looking state is hard; show practice results instead)
for (const b of bots) b.disconnect();

// How to play (the SEO article)
await go('/how-to-play');
await shot('0-how-to-play');

// Practice
await go('/practice');
await clickText('2');
await waitFor(`!!document.querySelector('canvas.board')`);
await shot('5-practice');

// Touch calibration: put markers at known board points inside the tilted stage, ask the
// browser where it really draws them, and run that back through Board's inverse mapping.
const calib = await js(`(() => {
  const TILT = 24 * Math.PI / 180, PERSP = 3, SLAB = 0.12, SIN = Math.sin(TILT), COS = Math.cos(TILT);
  const proj = (y, z) => { const yr = y * COS - z * SIN, zr = y * SIN + z * COS; return yr * PERSP / (PERSP - zr); };
  const shift = -(proj(-0.5, 0) + proj(0.5, -SLAB)) / 2;
  const stage = document.querySelector('.board-stage'), box = document.querySelector('.board-wrap');
  const S = stage.offsetWidth, P = S * PERSP;
  let worst = 0;
  for (const [bx, by] of [[500,500],[908,500],[92,500],[500,92],[500,908],[50,50],[950,950],[950,50]]) {
    const m = document.createElement('div');
    m.style.cssText = 'position:absolute;width:0;height:0;left:' + bx/10 + '%;top:' + by/10 + '%';
    stage.appendChild(m);
    const r = m.getBoundingClientRect(); m.remove();
    const b = box.getBoundingClientRect();
    const X = r.left - (b.left + b.width / 2), Y = r.top - (b.top + b.height / 2 + S * shift);
    const y = Y * P / (P * COS + Y * SIN), x = X * (P - y * SIN) / P;
    const lx = (x / S + 0.5) * 1000, ly = (y / S + 0.5) * 1000;
    worst = Math.max(worst, Math.hypot(lx - bx, ly - by));
  }
  const vis = stage.getBoundingClientRect();
  return { worst: Math.round(worst * 10) / 10, boardPx: S, drawn: [Math.round(vis.left), Math.round(vis.top), Math.round(vis.right), Math.round(vis.bottom)], viewport: [innerWidth, innerHeight] };
})()`);
console.log(`touch mapping: worst error ${calib.worst} board units (of 1000); board ${calib.boardPx}px, drawn at ${calib.drawn} in ${calib.viewport}`);

// A real finger shot in practice: press on the striker (board 500,908), pull back, release.
const at = await js(`(() => {
  const stage = document.querySelector('.board-stage');
  const m = document.createElement('div');
  m.style.cssText = 'position:absolute;width:0;height:0;left:50%;top:90.8%';
  stage.appendChild(m); const r = m.getBoundingClientRect(); m.remove();
  return { x: r.left, y: r.top };
})()`);
const touch = (type, x, y) =>
  cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const before = await js(`document.querySelector('.msg')?.textContent`);
await touch('touchStart', at.x, at.y);
for (let i = 1; i <= 8; i++) {
  await touch('touchMove', at.x + i * 2, at.y + i * 14);
  await sleep(16);
}
await shot('6-aiming');
await touch('touchEnd', 0, 0);
await sleep(400);
await shot('7-rolling');
await waitFor(`document.querySelector('.msg')?.textContent !== ${JSON.stringify(before)}`, 10000);
console.log(`after the shot: "${await js(`document.querySelector('.msg')?.textContent`)}"`);

ws.close();
chrome.kill();
process.exit(0);
