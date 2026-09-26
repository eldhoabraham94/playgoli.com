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
- Knock goli out (centre beyond r=285 at rest, or off the board) → keep them.
- ONE shot per turn (MAX_SHOTS_PER_TURN = 1, user's choice): capture or miss, play passes. (The rules still support N>1: a capture then shoots again from where the striker stopped, not in hand.) Striker leaving the board = foul, ends the turn (goli knocked out on that shot are kept).
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

## 3D board + mobile layout
- The board is a CSS 3D stage (`.board-stage`): `translateY(shift) perspective(3×size) rotateX(24°)` plus a `.slab-front` earth edge. Constants TILT/PERSP/SLAB live in client/src/game/Board.tsx.
- Size comes from the container only (`.board-wrap` has min-width/min-height 0): never let the canvas size feed back into layout (that bug cut the board off on phones).
- Touch input is inverse-projected in `toLogical` (Board.tsx). `npm run shots` verifies it in real Chrome (expects "worst error 0") and does a real touch shot.
- Marbles are drawn lifted by r·tan(tilt) and stretched 1/cos(tilt) so they look round; order: ground marks (shadow, contact, caustic, clock ring, aim) → spheres sorted far-to-near.
- `.game` is a grid: top bar (strip + leave) / board / fixed-height status. In landscape (≤560 px tall) the board goes left and the panel right.
- `.screen` pages scroll when content doesn't fit (auto margins, not justify-content:center, so the top is never clipped).
- Wake lock during games (`useWakeLock`), vibrate on release / full power / your turn.
- `npm run shots [-- --landscape]` needs `npm run dev`; writes PNGs to ./shots (gitignored) at 384×824 (S23 Ultra). `--splash` captures loading-scene frames.

## Loading scene (splash)
- One CSS-only scene: client/src/splash/splash.css + markup.ts (tilted ground that sways, ring drawing itself, striker knocks a goli out on a 2.8 s loop, title drop + glint, dust, bouncing dots).
- The `goli-inline-splash` Vite plugin inlines the CSS + markup into index.html (so it paints before JS). main.tsx fades it after fonts are ready; the first load per session stays up ≥1.3 s so the shot is seen. `?splash` keeps it up for previewing.
- `<Splash text/>` (client/src/ui/Splash.tsx) reuses the same markup inside the app (joining a room).
- Static screens (client/src/ui/Scene.tsx): `<Ambient/>` (drifting bokeh marbles + dust + glow) is mounted once in App and hidden via `body.in-game` (`useInGame()` in game screens). `<Hero size title/>` = the splash stage (Home lg with title; Join/Practice/errors sm). Lobby: `<Track/>` knock animation, rows `.anim-in`, Start `.pulse`, `<Hop/>` dots. Results: `<Rain/>` + staggered rows/pouch goli.
- Scene CSS is scoped to `.splash-stage` (not `.splash`) and the glass marble `.sp` is global, so they work anywhere. Upright marbles use billboards (`.bb` counter-rotates the ground's sway); never put opacity on a preserve-3d element (it flattens), fade the leaves instead.

## Voice (only the shooter talks)
- Transport: ~1 s self-contained Opus clips (MediaRecorder stopped/restarted per clip) sent as binary `voice {mime, data}` over the game socket; the server relays them untouched. No WebRTC/TURN. One talker at a time → no echo, ~1 s latency is fine.
- Server rules (`Room.voice`): only the current shooter, or the previous shooter for VOICE_GRACE_MS (4 s) after play passes (their cheer during their own shot). `parseVoice` guard (mime allowlist, ≤ 24 KB), own TokenBucket (6 burst, 4/s), relayed to everyone but the sender. maxHttpBufferSize 40 KB.
- Client: client/src/net/voice.ts (`VoiceSender` with level meter + silence skip, `VoicePlayer` decode-and-queue, unlocked on any tap). Prefs in localStorage `goli.voice` (mic opt-in, set only after permission) and `goli.listen`. Mic opens for my whole turn incl. my shot's animation; "You're live" pill with Mute; sound bars on the talker's chip.
- Mic needs https (or localhost). On the LAN dev URL (http) phones can listen but not talk.
- `npm run voicecheck` (needs `npm run dev`): two headless Chrome players with Chrome's fake mic; asserts only the shooter is heard, never by themselves, and it follows the turn.

## Conventions
- TypeScript strict everywhere, minimal dependencies.
- Nicknames are only ever rendered as React text (auto-escaped) and are sanitized on the server.
- Don't write literal `\u` escapes for invisible characters in regexes (tooling can turn them into raw characters); use code-point checks like `nickname.ts`.
