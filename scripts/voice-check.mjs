// End-to-end voice check in real headless Chrome with its built-in fake microphone
// (a test tone). Two players join one room with voice on; we check that only the
// shooter is heard, that the shooter never hears themselves, and that the roles swap
// when the turn passes. Needs `npm run dev`. Usage: npm run voicecheck
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const WebSocket = require('ws');
const URL_BASE = process.env.GOLI_URL ?? 'http://localhost:5173'; // localhost counts as secure: mic allowed

const chromePath = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));
if (!chromePath) throw new Error('Chrome not found; set CHROME=/path/to/chrome');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'goli-voice-'))}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const die = (msg) => {
  console.error(`FAIL: ${msg}`);
  chrome.kill();
  process.exit(1);
};

async function attach(wsUrl) {
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
  const waitFor = async (expr, ms = 10000) => {
    for (let t = 0; t < ms; t += 100) {
      if (await js(expr)) return;
      await sleep(100);
    }
    const page = await js(`location.pathname + ' :: ' + document.body.innerText.slice(0, 160).replace(/\\s+/g, ' ')`);
    die(`timed out waiting for: ${expr}\n  page: ${page}`);
  };
  const click = (text) =>
    js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return !!b; })()`);
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 384, height: 824, deviceScaleFactor: 2, mobile: true });
  // Both players must keep animating (rAF) even though only one tab is in front.
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Page.setWebLifecycleState', { state: 'active' });
  return { cdp, js, waitFor, click, close: () => ws.close() };
}

async function newPage() {
  for (let i = 0; i < 50; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      return attach(t.webSocketDebuggerUrl);
    } catch {
      await sleep(200);
    }
  }
  die('could not reach headless Chrome');
}

const go = async (p, url) => {
  await p.cdp('Page.navigate', { url });
  await p.waitFor(`document.readyState === 'complete' && !!document.querySelector('#root > *') && !document.getElementById('splash')`);
};
const rx = async (p) => {
  const v = await p.js(`document.body.dataset.voiceRx ?? '0/0'`);
  const [received, decoded] = v.split('/').map(Number);
  return { received, decoded };
};
const isShooter = (p) => p.js(`(document.querySelector('.turn-line')?.textContent ?? '').startsWith('Your turn')`);

// Two players, both with voice on.
const a = await newPage();
const b = await newPage();
await go(a, URL_BASE + '/');
await a.click('Create game');
await a.waitFor(`!!document.querySelector('#nick')`);
const roomUrl = await a.js('location.href');
await a.click('Join');
await a.waitFor(`!!document.querySelector('.lobby')`);
// Same browser profile, so the second player uses 127.0.0.1 instead of localhost: a different
// origin gets its own localStorage (its own player id); both count as secure for the mic.
await go(b, roomUrl.replace('//localhost', '//127.0.0.1'));
await b.waitFor(`!!document.querySelector('#nick')`);
await b.click('Join');
await b.waitFor(`!!document.querySelector('.lobby')`);
for (const p of [a, b]) {
  await p.click('🎙 Turn on voice');
  await p.waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Voice on'))`);
}
console.log(`Room ${roomUrl.split('/r/')[1]}: both players have voice on`);

await a.waitFor(`document.querySelectorAll('.players li:not(.empty)').length === 2`);
await a.click('Start');
await a.waitFor(`!!document.querySelector('canvas.board')`);
await b.waitFor(`!!document.querySelector('canvas.board')`);
await sleep(500);

const [talker, listener] = (await isShooter(a)) ? [a, b] : [b, a];
if (!(await isShooter(talker))) die('nobody has the turn');
const live = await talker.js(`document.querySelector('.live-pill')?.textContent ?? ''`);
if (!live.includes("You're live")) die(`shooter has no live pill (got "${live}")`);

// Turn 1: talker speaks for a few seconds.
await sleep(4500);
let lt = await rx(listener);
let tt = await rx(talker);
console.log(`Turn 1  listener heard ${lt.decoded}/${lt.received} clips, shooter heard ${tt.received}`);
if (lt.decoded < 2) die('listener did not hear the shooter');
if (tt.received !== 0) die('shooter heard their own voice');
const talkingShown = await listener.js(`!!document.querySelector('.chip.talking .bars')`);
console.log(`        listener sees the talking bars on the shooter's chip: ${talkingShown ? 'yes' : 'no'}`);

// Let the shot clock run out; the other player becomes the shooter.
console.log('Waiting for the shot clock to pass the turn…');
await listener.waitFor(`(document.querySelector('.turn-line')?.textContent ?? '').startsWith('Your turn')`, 20000);
await sleep(4500 + 500); // past the previous shooter's grace
const before = await rx(talker);
await sleep(3000);
const after = await rx(talker);
const oldListenerBefore = await rx(listener);
await sleep(2500);
const oldListenerAfter = await rx(listener);
console.log(`Turn 2  new listener heard ${after.decoded} clips (was ${before.decoded}); new shooter's received count ${oldListenerBefore.received} → ${oldListenerAfter.received}`);
if (after.decoded <= before.decoded) die('roles did not swap: the new shooter is not heard');
if (oldListenerAfter.received !== oldListenerBefore.received) die('the previous shooter is still being relayed after their grace period');

console.log('\nPASS: only the shooter is heard, never by themselves, and it follows the turn');
a.close();
b.close();
chrome.kill();
process.exit(0);
