# 🐾 Pawse — Deploy Guide (v1)

> **✅ STATUS: DEPLOYED & LIVE**
> - **App (player):** https://pawsetv.vercel.app (Vercel, public)
> - **Relay (backend):** `wss://pawse-relay.onrender.com` (Render Singapore, free) — svc `srv-d9ji3p1l565s73fubkd0`
> - **Keep-alive:** UptimeRobot monitor #803599828 pinging `/health`
> - **Still TODO:** point the extension (Track A) at the cloud relay — see Part 3.
>
> The guide below is the reproducible how-to (and how to redeploy / upgrade).

Goal: get Pawse off `localhost` and onto the internet, **free**, so you and Kitty
can use it across the distance. Two things to deploy:

- **Relay** (WebSocket server, `server/`) → **Render** (free) + UptimeRobot keep-alive
- **Player** (Vite app, `player/`) → **Vercel** (free)

All URLs are read from config/env, so there is **no code editing** to deploy.

---

## Part 1 — Relay on Render (do this first, we need its URL)

1. Go to **render.com** → sign up with GitHub.
2. **New +** → **Blueprint** → pick the `pradumya004/pawse` repo. Render reads
   `render.yaml` and sets up a service called **pawse-relay** (free plan, root
   `server/`, start `npm start`, health check `/health`).
3. Click **Apply** / **Create**. Wait for the first deploy (~2–3 min).
4. You'll get a URL like `https://pawse-relay.onrender.com`.
5. **Test it:** open `https://pawse-relay.onrender.com/health` in a browser →
   should show `{"ok":true,...}`.
6. **Your WebSocket URL** is the same host with `wss://`:
   `wss://pawse-relay.onrender.com`  ← save this, we need it for the player.

### Keep it awake (free tier sleeps after ~15 min idle)

1. Go to **uptimerobot.com** → free account.
2. **Add New Monitor** → type **HTTP(s)** → URL `https://pawse-relay.onrender.com/health`
   → interval **5 minutes**. Save.
3. This pings the server so it never cold-starts. Effectively always-on, $0.

---

## Part 2 — Player on Vercel

1. Go to **vercel.com** → sign up with GitHub.
2. **Add New… → Project** → import `pradumya004/pawse`.
3. Vercel auto-detects Vite. Set:
   - **Root Directory:** `player`
   - **Framework Preset:** Vite (auto)
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default)
4. **Environment Variables** → add:
   - Name: `VITE_RELAY_WS`
   - Value: `wss://pawse-relay.onrender.com`  (your relay from Part 1)
5. **Deploy**. You'll get a URL like `https://pawse.vercel.app`.
6. Open it in two windows → create/join → it now talks to the cloud relay. 🎉

> Changed the relay URL later? Update `VITE_RELAY_WS` in Vercel → redeploy.

---

## Part 3 — Extension (point it at the cloud relay)

The extension is loaded unpacked (not deployed). To use the cloud relay:

1. Edit `extension/config.js` → set `RELAY_WS: "wss://pawse-relay.onrender.com"`.
2. Edit `extension/manifest.json` → add the relay to `host_permissions`:
   `"wss://pawse-relay.onrender.com/*"`.
3. `chrome://extensions` → reload Pawse. (For Kitty: send her the `extension/`
   folder, she loads it unpacked too — Chrome Web Store listing is a later step.)

---

## Notes / gotchas

- **wss:// is mandatory** on the https player (browsers block ws:// from https).
  Render gives wss:// automatically.
- **First hit after idle** (if UptimeRobot lapses) may take ~30s to wake — the
  keep-alive prevents this.
- **TURN (later):** if the P2P video ever fails to connect on a strict network,
  we add a free TURN server (metered.ca Open Relay). STUN handles most cases.
- **Upgrade path (when revenue):** same code → Render paid ($7/mo, no ping) or
  Fly.io Mumbai (lowest India latency). Just change the host + `VITE_RELAY_WS`.
- **Custom domain (optional):** point `pawse.tv` (or similar) at Vercel for the
  player; add a subdomain for the relay.
