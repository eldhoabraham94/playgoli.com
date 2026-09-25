# Goli — notes for Claude Code sessions

Multiplayer browser marbles game (Indian "goli"). Up to 10 players join by link, no sign-in, one ring, mobile-first.
Built in phases; the user tests and approves after each phase. **Stop at the end of every phase.**

Status: all 5 phases done (v1). Deploy target: Render (render.yaml, Dockerfile). See README.md for user-facing docs.

## Layout (npm workspaces)
- `shared/` pure TS, **no DOM, no Node APIs**. Imported as `@goli/shared` (points at `src/index.ts`, no build step).
  - `constants.ts` all tunables (board, physics, rules, colours, reactions)
  - `physics.ts` deterministic sim — **only + - * / and Math.sqrt** (test-enforced). bodies[0] = striker.
  - `rules.ts` pure reducer: `newGame`, `slide`, `applyShot`, `skipTurn`, `winners`. Trig lives here (outside the sim) and outputs are quantized with `q()` to 1/1000.
  - `layout.ts` starting cross of goli; `names.ts` fun nicknames; `nickname.ts` sanitize + profanity; `code.ts` room codes; `messages.ts` zod schemas for client→server messages.
- `client/` Vite + React. `game/render.ts` (canvas art, sprite caches), `game/Board.tsx` (rAF loop, input, shot animation), `screens/*`, `ui/*`.
- `server/` Node + Socket.IO, all state in memory. `app.ts` (createApp, used by tests), `http.ts` (POST /api/rooms, GET /api/rooms/:code, /healthz), `sockets.ts` (validates every message, per-socket token bucket), `rooms.ts` (Room/RoomStore: seats, host, timers), `rateLimit.ts`, `config.ts`.
- `server/src/static.ts` serves client/dist from memory (gzip, immutable /assets, SPA fallback) and fills the `{{OG_*}}` placeholders in index.html per request (room links get an invite preview). Security headers + CSP live there too.
- `server/src/swarm.ts` bot swarm (used by `npm run bots` via `bots.ts` and by `swarm.test.ts`); `bot.ts` is the aiming brain.
- `server/build.mjs` esbuild-bundles the server + shared + deps into `server/dist/index.js` (runtime image has no node_modules).
- `scripts/dev.mjs` runs server (:3000) + Vite (:5173, strictPort, proxies /api and /socket.io). `scripts/make-og.mjs` paints og.png/favicon/icon with no deps (keep og.png < 300 KB for WhatsApp).

## Commands (run from repo root)
- `npm install`
- `npm test` — Vitest (shared + server tests)
- `npm run typecheck`
- `npm run dev` — server :3000 + Vite :5173 on the LAN; open http://<LAN-IP>:5173 on a phone
- `npm run bots` — 10 bots + 3 spectators, 2 games, mid-game reconnect, against :3000 (`--self` starts its own server, `--realtime` for human pacing)
- `npm run build` then `npm start` — production bundle on PORT
- `npm run og` — regenerate client/public/og.png + icons
- Docker: `docker build -t goli . && docker run -p 3000:3000 goli` (build runs the tests)

## Game rules (source of truth: shared/src/rules.ts)
- Board 1000×1000, centre 500, ring r=285, throw line r=408. Goli r=22, striker r=28, mass=r².
- Each player adds 2 goli; laid out as a non-overlapping cross inside the ring.
- Turn order shuffled at start, then around the table. Each player's in-hand striker starts at their seat angle.
- In hand: drag the ground to slide along the throw line; press the striker, pull back, release (power = pull distance, max pull 230 units).
- Knock goli out (centre beyond r=285 at rest, or off the board) → keep them, shoot again from where the striker stopped (not in hand).
- Max 3 shots per turn. A miss ends the turn. Striker leaving the board = foul, ends the turn (goli knocked out on that shot are kept).
- 15 s shot clock; timeout skips the turn.
- Game over when the ring is empty. Most goli wins; ties share.
- `seq` increments on every shot and turn change; a shot must quote the current seq.

## Physics (must stay deterministic)
dt = 1/240; each step: integrate → mark off-board bodies → pairwise collisions in index order (impulse, e=0.9, positional correction) → friction `speed -= (300 + 0.9*speed)*dt`, stop below 3. Max shot speed 1650. Hard cap 4800 steps then freeze.

## Rooms & identity
- Room code: 4 letters, no I/O. Rooms live in memory; deleted 30 min after nobody is connected.
- localStorage: `goli.playerId` (UUID, a SECRET used only to reclaim a seat), `goli.nickname`, `goli.lastRoom` (reopening that room skips the join screen).
- Server assigns each member a short public `id`; snapshots, game order and kick use it. The secret is never broadcast.
- Up to 10 players (lobby only), then up to 20 spectators. Mid-game joiners spectate. A freed lobby seat goes to the first spectator.
- Disconnect keeps the seat 60 s. A disconnected host hands over after 10 s (to the next connected player in join order); leaving hands over at once.
- The same playerId in a new tab takes over the seat; the old tab gets `opened-elsewhere`.
- Client sends `join` on every socket connect (so reconnects are automatic). Server replies with a per-recipient `room` snapshot (includes `you`).
- Limits: 10 room creations / 10 min / IP (TRUST_PROXY=1 uses X-Forwarded-For); 30-message burst, 15 msg/s per socket; 10 KB max message.

## Online play (server is the referee)
- Client → server: `slide {angle}` (client throttles to 10/s, and always flushes the last slide before shooting), `shoot {seq, angle, power}`, `playAgain` (host), `start` (host).
- Server validates (zod, then `applyShot`: shooter, seq, ranges) and runs the shared physics to rest.
- Server → client: `shot` = ShotResult + `clockMs` (next shot clock = animation time (steps*dt) + 500 ms + 15 s); `slide` to everyone but the shooter; `turn` when play passes without a shot (reason timeout | away | left); `gameOver`; `room` snapshot on joins and changes (includes `game` and `clockMs`).
- Clients set `game = shot.after` at once and animate `shot` by re-running the shared sim from `before/start/velocity`. The end frame equals `after` bit-for-bit (integration test checks this).
- Prediction: the shooter's client runs `applyShot` locally and starts animating immediately. When the server's shot arrives with the same seq, start and velocity, the animation keeps going; otherwise it switches to the server's. On stale-seq/not-your-turn/bad-shot the client re-joins to get a fresh snapshot.
- Shot clock lives on the server. A disconnected shooter gets 4 s (AWAY_TURN_MS), not 15.
- A player gone for 60 s is removed (`removePlayer`): their pouch goes back into the ring (`placeGoli`), the turn index is fixed up, and a game with fewer than 2 players left ends.
- Game over → phase 'over' (results). Host's playAgain seats spectators (up to 10) and starts a new game with the connected players, or goes back to the lobby if fewer than 2.
- `server/src/bot.ts` `botMove()` is a simple aiming bot used by tests (and the Phase 4 bot script).

## Phase 4 features
- Kick (host only, lobby ✕ tap-twice or tap a chip in-game): drops the socket with `kicked`, removes the member, bans their secret for that room.
- Reactions 😂 🔥 😱 👏 🙏: `react {emoji}` → server drops >1/s per member → `react {from, emoji}` to all; float up over the board.
- Toasts for ≥2 goli in one shot and for the win (`bigMoment` in client/src/game/describe.ts).
- Results: ranking with pouches, medals (ties share a place), Share result (navigator.share, else clipboard).

## Deploy notes
- Exactly ONE instance (in-memory rooms). Redeploy = games in progress are lost.
- Env: PORT, PUBLIC_URL (absolute OG URLs), TRUST_PROXY=1 behind Render's proxy (set in Dockerfile), STATIC_DIR.
- Limits: 10 rooms/10 min/IP, 30 burst + 15 msg/s per socket, 60 sockets/IP, 10 KB messages, 1 reaction/s.

## Conventions
- TypeScript strict everywhere, minimal dependencies.
- Nicknames are only ever rendered as React text (auto-escaped) and are sanitized on the server.
- Don't write literal `\u` escapes for invisible characters in regexes (tooling can turn them into raw characters); use code-point checks like `nickname.ts`.
