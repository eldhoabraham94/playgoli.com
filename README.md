# Goli

The Indian childhood marbles game, in the browser. Up to 10 friends join by link, with no sign-up, and play in one ring. Built mobile-first.

- **Create game** gives you a link like `/r/KMPT`. Share it on WhatsApp or show the QR code.
- Everyone picks a name (a fun one is pre-filled) and taps **Join**.
- The host taps **Start**. Knock goli out of the ring to keep them. Most goli wins.

## How to play

- Each player puts 2 goli into the ring. Turn order is random, then goes around the table.
- **Striker in hand:** drag anywhere on the ground to slide it along the dashed throw line. Then press on the striker, pull back like a catapult and let go. The further you pull, the harder it goes.
- Knock one or more goli out of the ring: keep them and shoot again from where your striker stopped (up to 3 shots in a row).
- A miss ends your turn. If your striker rolls off the ground it's a foul, and that also ends your turn.
- You have 15 seconds per shot. The game ends when the ring is empty.
- While you wait, send 😂 🔥 😱 👏 🙏. Late arrivals watch and get a seat next game.

## Run it locally

Needs Node.js 20+.

```bash
npm install
npm run dev          # server on :3000 + Vite on :5173
```

- Laptop: http://localhost:5173
- Phone on the same Wi-Fi: `http://<your-laptop-IP>:5173` (on Windows, find the IP with `ipconfig`). The lobby QR code already points at this address.
- If the phone can't connect, allow Node.js through the firewall.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload (server + client) |
| `npm test` | All tests (Vitest): physics determinism, rules, rooms, sockets, a 10-bot game |
| `npm run typecheck` | TypeScript across all packages |
| `npm run bots` | 10 bots + 3 spectators play 2 full games against `http://localhost:3000` (run `npm run dev` first). Options: `--url`, `--players`, `--spectators`, `--games`, `--realtime` (human-like pacing), `--self` (starts its own server) |
| `npm run build` | Production build: `client/dist` + a single-file server `server/dist/index.js` |
| `npm start` | Runs the production build on `PORT` (default 3000) |
| `npm run og` | Regenerates the link-preview image and icons in `client/public` |

## Deploy to Render

The whole game is **one service**: the server also serves the built client.

1. Push this folder to a GitHub repo:
   ```bash
   git init && git add . && git commit -m "Goli"
   git branch -M main
   git remote add origin https://github.com/<you>/goli.git
   git push -u origin main
   ```
2. Go to [render.com](https://render.com) and sign in with GitHub, then **New → Blueprint** and pick the repo. Render reads [`render.yaml`](render.yaml): a Docker web service in Singapore with 1 instance and a `/healthz` health check.
3. When asked for `PUBLIC_URL`, leave it empty for now and click **Apply**. The first build takes a few minutes, because it also runs the tests.
4. Open the URL Render gives you (e.g. `https://goli-xxxx.onrender.com`). Then set **Environment → `PUBLIC_URL`** to exactly that URL, which makes WhatsApp previews use it.
5. Test it: create a game on your phone and paste the link into a WhatsApp chat. You should see the marble preview card.

Every `git push` to `main` redeploys automatically.

**Plans:** `free` is fine for trying it out, but it sleeps after about 15 idle minutes, so the next visitor waits around 30–50 s. For real play, switch to `starter`, either in `render.yaml` or in the dashboard.

**Custom domain (optional):** Settings → Custom Domains → add `goli.yourdomain.com` → create the CNAME record Render shows you at your domain registrar. HTTPS is automatic. Then update `PUBLIC_URL`.

### Things to know

- **Keep exactly one instance.** Rooms live in the server's memory, so scaling to 2+ instances would split players across them.
- **Redeploying ends games in progress.** Push when nobody is playing.
- Rooms are deleted 30 minutes after everyone has left.

### Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on (Render sets it) |
| `PUBLIC_URL` | (request host) | Public origin for absolute link-preview URLs |
| `TRUST_PROXY` | unset (`1` in the Docker image) | Use `X-Forwarded-For` / `-Proto` from the platform's proxy for per-IP limits |
| `STATIC_DIR` | `client/dist` | Where the built client lives |

## Run the production image locally

With Docker Desktop running:

```bash
docker build -t goli .
docker run --rm -p 3000:3000 goli
# open http://localhost:3000, and in another terminal:
npm run bots
```

## How it works

```
shared/   Pure TypeScript used by both sides: deterministic physics, game rules, message schemas
server/   Node + Socket.IO. Holds every room in memory and is the referee.
client/   Vite + React. Game drawn on a <canvas>.
```

- **Deterministic physics.** The simulation uses only `+ − × ÷` and `Math.sqrt`, at a fixed 1/240 s step. Every browser and the server compute bit-identical results, and a test enforces it.
- **Server is the referee.** A phone only sends `slide {angle}` and `shoot {seq, angle, power}`. The server checks it's that player's turn and the values are sane, runs the physics, and broadcasts the result. Every screen replays the shot with the same physics and ends in exactly the same state.
- **Feels instant.** The shooter's phone starts animating the moment they let go, and the server's matching result confirms it.
- **Robust.**
  - A dropped connection keeps your seat for 60 s, and refreshing puts you straight back in.
  - If the host leaves, the next player becomes host.
  - The host can kick.
  - Limits: 10 new rooms / 10 min per IP, 15 messages/s per connection, 60 connections per IP, 1 reaction/s.
- **No accounts, no database.** Your identity is a random ID plus a nickname, kept in your browser's localStorage.

Architecture details and the full rules for contributors are in [CLAUDE.md](CLAUDE.md).
