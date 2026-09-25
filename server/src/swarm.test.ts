import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from './app';
import { runSwarm } from './swarm';

let app: ReturnType<typeof createApp>;
let url: string;

beforeAll(async () => {
  app = createApp();
  url = `http://localhost:${await app.listen(0)}`;
});
afterAll(() => app.close());

it('10 bots + 3 spectators play 2 full games with a mid-game reconnect, all in sync', async () => {
  const r = await runSwarm({ url, players: 10, spectators: 3, games: 2, reconnect: true, timeoutMs: 50_000 });
  expect(r.errors).toEqual([]);
  expect(r.mismatches).toBe(0);
  expect(r.desyncs).toBe(0);
  expect(r.reconnectOk).toBe(true);
  expect(r.games).toHaveLength(2);
  for (const g of r.games) expect(g.shots).toBeGreaterThan(0);
  expect(r.ok).toBe(true);
}, 60_000);
