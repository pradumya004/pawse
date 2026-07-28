# 🐾 Pawse — Product Plan (execution priority queue)

> This is the **prioritized "what we build/fix next"** doc. Big-picture phases/features live in [ROADMAP.md](../ROADMAP.md); live file/status lives in [FILE-TRACKER.md](../FILE-TRACKER.md). Keep statuses here current as we ship.
>
> Legend: ✅ done · 🚧 in progress · ⬜ todo · ⏸ parked

---

## Locked decisions (so we don't re-litigate)

**TURN / connectivity — Path B for now.** ExpressTURN (free, no card, port 3478 only) + Open Relay 443 fallback. Reliable 443/TLS providers (Cloudflare, metered, Twilio) all require a **card on file** (never charged under free tier, but required). Endgame: Cloudflare (card-on-file, 1 TB free) or self-hosted coturn (Oracle Always-Free / Hetzner). Always minimize relay for movies via direct-P2P + pre-load. Full comparison in chat history / to be appended here.

**No DRM / anti-screen-share — won't build.** "Black on capture" is a DRM (Widevine/HDCP) property we can't practically use (breaks our P2P/own-files model + revives copyright risk), and it's defeated by "share whole screen" / phone-filming anyway. Anti-leak strategy = value-based monetization (great paid group experience) + subtle free-tier watermark + per-account limits. Not DRM.

**Cost truth.** Calls over TURN = cheap. Movies over TURN = file-size of egress → the cost bomb. So: direct P2P first, pre-load for planned nights, gate heavy relay behind paid tiers.

---

## P0 — "a stranger can connect and it just works, and isn't confused"

| # | Item | Lens | Status |
|---|------|------|--------|
| P0-1 | Prove call + movie connect across two real networks | Dev/Customer | ⏸ pending (Path B) |
| P0-2 | Production TURN (Cloudflare / self-host) | Infra | ⏸ parked (needs card) |
| P0-3 | **Codec safety net** — detect an unplayable file (no decodable audio/video) → clear message, never a silent black screen | Customer/Dev | ✅ done — runtime detect: `error`/zero-dims → banner; `webkitAudioDecodedByteCount`==0 → dynamic "no sound" hint (replaced the old always-on one) |
| P0-4 | **Clear Create/Join chooser** — two buttons, container swaps | Design/UX | ✅ done |
| P0-5 | **Shareable room LINK** — click → lands straight in the room (`?room=CODE`) | UX/Sales | ✅ done |
| P0-6 | **Design system / single source of truth** — one tokens file both clients import | Dev/Design | ✅ done — `player/src/tokens.css` (color/type/border/shadow/spacing/z). styles.css fully swept to `var(--…)`, 0 raw hex. Extension imports same file in P1-8. |
| P0-7 | **Error / empty / loading states** everywhere | UX | ✅ done — server errors surface as friendly lobby hints (bad code / server full); CREATE/JOIN gated + "waking up the server…" note during cold-start; amber reconnect banner in-room |

## P1 — "polished, delightful product you'd show off"

| # | Item | Lens | Status |
|---|------|------|--------|
| P1-1 | Room UI redesign: compact header, collapsible room code, **3 toggles (📷/🎤/💬)**, chat on→cams 2-col + panel / off→cams stacked bigger, video-as-hero (trim padding) | Design | ✅ done — independent camera/mic toggles (true device release), 💬 hides chat + stacks cams bigger, code masked behind 👁 reveal, trimmed gaps |
| P1-2 | **The "vibe" pass** (make it genuinely look good, not just functional): | Design | ⬜ |
| P1-2a | · **Homepage/lobby glow-up** | Design | ✅ done — feature badges, ambient stickers, card entrance; more warmth lands with dark mode (P1-2e) |
| P1-2b | · **Sticker set** — pixel cats, paws, hearts, popcorn, film reel placed tastefully (not clutter) | Design | ✅ done — 5 bobbing lobby stickers, low-opacity, hidden on mobile |
| P1-2c | · **Micro-animations & effects** | Design | ✅ done — card slide-in, chooser/join fade, button hover-lift, 😻 partner-joined burst; honors reduced-motion. (reactions = P1-4) |
| P1-2d | · **Typography system** — consistent pixel type *scale* (sizes/weights/spacing as tokens), readable everywhere, Press Start 2P for accents + a readable pixel body font | Design | ⬜ |
| P1-2e | · **Overall cozy/cool vibe** — cohesive Cream & Ginger, subtle textures (scanlines/paper), dark "movie-night" mode option | Design | ⬜ |
| P1-2f | · **Favicon + tab identity** | Design/Sales | ✅ done — `public/favicon.svg` (pixel-cat on cream), title, description, theme-color, OG/Twitter tags. TODO later: dedicated 1200×630 PNG og:image |
| | *(all of P1-2 sits on top of P0-6 design tokens — do tokens first so it stays consistent & nothing breaks)* | | |
| P1-3 | Meme-feed repeat fix (bigger pool, more subreddits, de-dupe, refresh) | Dev | ⬜ |
| P1-4 | Reactions (floating emoji) + presence polish ("paused", "buffering") | Design/Customer | ⬜ |
| P1-5 | Mobile / tablet responsiveness (real device test) | Design | ⬜ |
| P1-6 | Onboarding / first-run explainer | UX/Sales | ⬜ |
| P1-7 | Reconnect resume + "both ready" gate + pre-load (zero-buffer + cuts TURN cost) | Dev/Customer | ⬜ |
| P1-8 | Extension parity (stable uid, cloud relay, design system, auto-join link) | Dev | ⬜ |
| P1-9 | Terms of Service + refreshed Privacy | Security/Sales | ⬜ |
| P1-10 | Light anti-freeload (watermark, per-account limits) | Security/Sales | ⬜ |
| P1-11 | Relay hardening (origin allow-list, join rate-limit, abuse caps) | Security | ⬜ |

## P2 — "it scales, converts, and makes money"

| # | Item | Lens | Status |
|---|------|------|--------|
| P2-1 | In-browser transcode (ffmpeg.wasm) — auto-fix AC3/DTS/MKV, no manual ffmpeg | Customer/Dev | ⬜ |
| P2-2 | Accounts + payments (Razorpay/Stripe) + tier gating | Sales | ⬜ |
| P2-3 | Landing/marketing page + SEO + viral loops (referral, "Wrapped") | Sales | ⬜ |
| P2-4 | Group rooms (the paid flagship; answers the Discord concern) | Sales/Dev | ⬜ |
| P2-5 | Relay horizontal scale (Redis for cross-instance rooms) | Infra | ⬜ |
| P2-6 | Self-hosted TURN (coturn) for cost control at volume | Infra | ⬜ |
| P2-7 | Privacy-respecting analytics (funnel + connection-failure visibility) | Dev/Sales | ⬜ |
| P2-8 | Watch history · scheduled dates · cosmetics store | Customer/Sales | ⬜ |
| P2-9 | Automated tests + CI for the sync/WebRTC core | Dev | ⬜ |
| P2-10 | Native apps (desktop/mobile) + store listings | Sales | ⬜ |

---

## Current focus
Path B TURN. **ALL P0 SHIPPED. P1-1 ✅. Vibe pass: P1-2f (favicon) ✅, P1-2a/b/c (lobby glow-up/stickers/animations) ✅.** Next in vibe pass: **P1-2e — dark "movie-night" mode + cohesion** (token swap, easy on P0-6), and P1-2d typography polish. Then P1-3 meme-feed → P1-4 reactions → onward.
