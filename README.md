# 🐾 Pawse

**Watch together, purr-fectly in sync.**

> **🟢 v1 is LIVE:** **https://pawsetv.vercel.app** — open it in two windows (or send it to your person), pick a movie file, watch together. Backend relay: `wss://pawse-relay.onrender.com`.

Pawse is a free, self-hosted watch-together system for two people in a long-distance relationship (or any two humans + cats). It syncs playback — play, pause, seek — across YouTube, Netflix, Prime Video, JioHotstar, any site with a `<video>` tag, **and your own local movie files**, with voice/camera and chat layered on top.

*Paws* + *pause*: the whole product is a play/pause sync engine. The name is the feature.

## The two modes (this is the whole product)

Pawse does **both** DRM and non-DRM content. Which mode fires depends only on whether the source is protected:

| | **Mode A — Sync (DRM platforms)** | **Mode B — P2P Stream (non-DRM)** |
|---|---|---|
| **Platforms** | Netflix, Prime Video, JioHotstar, Hulu | Your own movie files, YouTube, any free/non-DRM video |
| **Accounts needed** | **Both** partners, each on their own login (plans can differ — 4K vs 480p is fine) | **One** host is enough. Partner joins with *no account* |
| **What travels between you** | Nothing but control events (`play`/`pause`/`seek`) — each side plays its own stream | The actual video, streamed host → partner over WebRTC P2P |
| **Why this split** | DRM (Widevine + HDCP) makes re-streaming physically impossible — black screen. So both log in and we sync the *timeline* | No DRM = the host can legitimately stream their own file/tab to the partner |
| **Quality** | Each side = its own account's quality (independent; plans differ) | **Identical & native on both sides** — we transfer the *original file bytes*, never a re-encoded stream. Under load it buffers, it never downgrades |
| **Cost** | ₹0 (both already have their subs) | ₹0 (P2P, no cloud video server) |

Both modes share **one sync engine, one relay server, one protocol.** The only difference is whether video rides between you (Mode B) or each side supplies its own (Mode A).

## How the sync works, in one paragraph

Pawse relays tiny control messages (`play`, `pause`, `seek to 14:32`) over a WebSocket room, with clock-sync and drift correction keeping both players within ~0.3 s. That's why there's no lag — the sync channel carries bytes, not video. In **Mode A** each side plays its own DRM stream from its own account (no re-streaming — that's a hard no and renders black anyway). In **Mode B** the video *does* travel, host → partner, peer-to-peer over WebRTC, so only one person needs the file.

## Repo layout (planned)

```
pawse/
├── server/       # Node WS relay — rooms, broadcast, clock sync (free tier host)
├── extension/    # Chrome MV3 — Track A: platform sync (YouTube first)
├── player/       # Static web app — Track B: own-files P2P player
├── shared/       # Sync protocol types shared by all clients
└── docs/
    ├── FLOW-DIAGRAM.md    # How data moves: rooms, sync loop, P2P, failures
    ├── STATE-DIAGRAM.md   # Room / player / socket / WebRTC state machines
    └── WORKFLOW-TREE.md   # Horizontal feature tree + master workflows
```

## Docs

| Doc | What's inside |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Phases 0–8, tasks, status, build-order graph (the map) |
| [docs/PRODUCT-PLAN.md](docs/PRODUCT-PLAN.md) | P0/P1/P2 execution priority queue + locked decisions |
| [FILE-TRACKER.md](FILE-TRACKER.md) | Live map of every file + current position (the resume anchor) |
| [docs/WORKFLOW-TREE.md](docs/WORKFLOW-TREE.md) | The horizontal feature tree — every capability, branching left→right |
| [docs/FLOW-DIAGRAM.md](docs/FLOW-DIAGRAM.md) | Sequence/flow diagrams: join flow, sync loop, drift correction, P2P |
| [docs/STATE-DIAGRAM.md](docs/STATE-DIAGRAM.md) | The state machines that make sync bug-free |
| [docs/DESIGN.md](docs/DESIGN.md) | Pixel-cat design system ("Cream & Ginger"), mascots, Meow Feed |
| [docs/MONETIZATION.md](docs/MONETIZATION.md) | Tiers, pricing, conversion tactics (Phase 7 — future) |

## Principles

1. **Sync events, not video.** Bytes, not gigabytes. Lag-free by construction.
2. **Two honest modes.** DRM platforms = both accounts, sync-only (Mode A). Non-DRM = one host streams P2P, partner needs nothing (Mode B). No DRM circumvention, ever — because it doesn't work and it's not needed.
3. **₹0 infrastructure (for the free plan).** Free-tier relay, static hosting, P2P media. Paid infra (TURN, DB) only arrives with revenue.
4. **The core (room of 2) is free forever.** No scaling architecture or DB until monetization. A room is a shared secret between two people — and it always stays free.
5. **QA = movie night.** A feature ships when it survives a full movie with her.
6. **Built monetization-aware from day one.** Free-first, but every decision (feature flags, room-size limits) leaves room for paid tiers without a retrofit. See [MONETIZATION.md](docs/MONETIZATION.md).

## The plan to make it a product

Free for rooms of 2 (forever — that's the origin story), paid for **groups, 4K own-files, cosmetics (cat packs 🐱), and power features**. The adapter registry is the moat: platforms churn their players, and maintained adapters are what people pay for. Prices stay cheap and India-first. Full tiers, pricing, and (honest, legal) conversion tactics live in **[docs/MONETIZATION.md](docs/MONETIZATION.md)**. But v1 is for two specific people — we perfect the free experience first.
