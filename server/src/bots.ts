/**
 * npm run bots [-- --url http://localhost:3000 --players 10 --spectators 3 --games 2 --realtime --self]
 *
 * Plays full games with bot clients against a running Goli server (or, with
 * --self, an in-process one) and prints a report. Exit code 1 on any problem.
 */
import { parseArgs } from 'node:util';
import { createApp } from './app';
import { runSwarm } from './swarm';

const { values: a } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    players: { type: 'string', default: '10' },
    spectators: { type: 'string', default: '3' },
    games: { type: 'string', default: '2' },
    realtime: { type: 'boolean', default: false },
    self: { type: 'boolean', default: false },
  },
});

let url = a.url!;
let app: ReturnType<typeof createApp> | null = null;
if (a.self) {
  app = createApp();
  url = `http://localhost:${await app.listen(0)}`;
  console.log(`Started an in-process server at ${url}`);
} else {
  try {
    await fetch(`${url}/healthz`);
  } catch {
    console.error(`No Goli server at ${url}. Start one with "npm run dev" first, or pass --self.`);
    process.exit(1);
  }
}

const report = await runSwarm({
  url,
  players: Number(a.players),
  spectators: Number(a.spectators),
  games: Number(a.games),
  realtime: a.realtime,
  timeoutMs: a.realtime ? 30 * 60_000 : 120_000,
  log: (line) => console.log(`  ${line}`),
});

console.log('');
console.log(`Shots replayed by every client: ${report.mismatches === 0 ? 'all identical ✔' : `${report.mismatches} MISMATCHES ✘`}`);
console.log(`Client states in sync:          ${report.desyncs === 0 ? 'yes ✔' : `${report.desyncs} desyncs ✘`}`);
console.log(`Reconnect kept the seat:        ${report.reconnectOk === null ? 'not tested' : report.reconnectOk ? 'yes ✔' : 'NO ✘'}`);
console.log(`Shot round trip (ms):           avg ${report.rttMs.avg}, p95 ${report.rttMs.p95}, max ${report.rttMs.max}`);
console.log(`Reactions delivered:            ${report.reactions}`);
if (report.errors.length) console.log(`Errors:\n  ${report.errors.join('\n  ')}`);
console.log(report.ok ? '\nPASS' : '\nFAIL');

await app?.close();
process.exit(report.ok ? 0 : 1);
