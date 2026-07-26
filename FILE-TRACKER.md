# 🐾 Pawse — File Tracker

> **Purpose:** the single map of what exists, what doesn't, and where we are — so work can resume cleanly even after Claude's context resets. **Update this every time a file is created, renamed, or its purpose changes.**

> **GitHub:** https://github.com/pradumya004/pawse (private). Commit author: `pradumya.official@gmail.com`. Account: `pradumya004`.
>
> **⚙️ AUTO-PUSH RULE (standing authorization):** at the end of every phase, automatically `git add . && git commit && git push` — no need to ask. Commit message format: `Phase N: <summary>`.

**Legend:** ✅ done · 🚧 in progress · ⬜ planned (not created yet)

---

## Timeline

| Phase | Status | Committed & pushed |
|---|---|---|
| 0 — Foundations / docs | ✅ done | ✅ |
| 1 — Sync relay server | ✅ **COMPLETE & VERIFIED** | ✅ `Phase 1: sync relay server + project docs` |
| 2 — Extension (Track A, YouTube) | 🚧 starting | ⬜ |
| 3 — Own-files P2P (Track B) | ⬜ | ⬜ |
| 4 — DRM adapters | ⬜ | ⬜ |
| 5 — Together layer (cam/chat) | ⬜ | ⬜ |
| 6 — Polish | ⬜ | ⬜ |

## Current position

- **Phase 1 verified:** two-terminal test passed — a `play` from the host relayed to the follower only, tagged `from` host id.
- **▶ NEXT FILE:** `extension/background.js` (the WebSocket brain). Then `content/content.js`, then popup files. Develop against `ws://localhost:8080`.
- **Deferred (add when needed):** clock-sync ping/pong (1.5), rejoin grace window, free-tier deploy of the relay (needed before a real test with a remote partner).

**Working style:** user writes all code himself, one file at a time; I explain + provide content, he creates it. Every function gets a JSDoc comment.

---

## Repo structure & status

```
pawse/
├── README.md                    ✅ product overview, two modes, quality/buffer guarantees
├── ROADMAP.md                   ✅ phases 0–6, tasks, exit criteria
├── FILE-TRACKER.md              ✅ this file
├── docs/
│   ├── WORKFLOW-TREE.md         ✅ horizontal feature tree + workflows
│   ├── FLOW-DIAGRAM.md          ✅ sequence/flow diagrams (join, sync loop, P2P)
│   ├── STATE-DIAGRAM.md         ✅ state machines (room, player, socket, webrtc)
│   └── DESIGN.md                ✅ pixel-cat theme, palette, mascots, Meow Feed
│
├── server/                      ✅ Phase 1 — sync relay (Node + ws, no DB) — VERIFIED
│   ├── package.json             ✅ deps (ws), scripts (start/dev)
│   ├── .gitignore               ✅
│   ├── src/
│   │   ├── protocol.js          ✅ MSG + ACTION constants (shared message vocab)
│   │   ├── rooms.js             ✅ in-memory room registry, codes, host migration
│   │   └── index.js             ✅ http /health + WebSocketServer + message routing + heartbeat
│   └── scripts/
│       └── test-client.js      ✅ CLI client to test create/join/broadcast without a browser
│
├── extension/                   ⬜ Phase 2 — Track A (MV3, YouTube first)
├── player/                      ⬜ Phase 3 — Track B (own-files P2P player)
└── shared/                      ⬜ later — theme tokens + protocol shared across clients
```

---

## File notes (what each does / gotchas)

| File | Purpose | Notes |
|---|---|---|
| `server/src/protocol.js` | Message-type constants (`MSG`, `ACTION`) | The shared vocabulary; every client must use these exact strings |
| `server/src/rooms.js` | Room lifecycle | In-memory `Map`; 6-char codes (no confusing chars); host migration + auto-destroy on empty |
| `server/src/index.js` | Server entry | Owns the WS server, routes messages by type, relays control/chat to the *other* peer, heartbeat to drop dead sockets |

---

## Decisions locked (so we don't re-litigate)

- **No DB for Phase 1.** Rooms live in memory; 2 users only. MongoDB/MERN enters only if/when we add accounts or watch-history.
- **Node + `ws`**, ES modules (`"type": "module"`). **All files use `.js`** (not `.mjs`) for consistency — `"type": "module"` already makes every `.js` an ES module.
- **Two modes:** A = DRM sync (both accounts), B = non-DRM P2P (one host). See README table.
- **Quality:** Mode B transfers original file bytes (never re-encoded); pre-load for planned dates = zero buffering.
- **No DRM circumvention** — out of scope permanently.
- **Mermaid rule:** no raw `"` `()` `{}` `|` inside node labels (breaks the parser).
