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
| 2 — Extension (Track A, YouTube) | 🚧 core done + robustness pass; testing | ⬜ pending user's final test |
| 3 — Own-files P2P (Track B) | ⬜ | ⬜ |
| 4 — DRM adapters | ⬜ | ⬜ |
| 5 — Together layer (cam/chat) | ⬜ | ⬜ |
| 6 — Polish + deploy | ⬜ | ⬜ |
| 7 — Monetization (see docs/MONETIZATION.md) | ⬜ future | ⬜ |
| 8 — Native apps / store distribution | ⬜ far future (tracked only) | ⬜ |

## Current position

- **Sync VERIFIED in Chrome** (both windows synced on same video ✅). Then this follow-up pass (UNTESTED — user testing next):
  - **Presence bug FIXED**: joiner now learns the host is already there (server sends `partnerHere` + `partnerName` in the ROOM reply). Was one-way before.
  - **Usernames**: lobby has a name field; name rides create/join/presence; popup shows "<name> is watching with you".
  - **Share/invite LINK**: Create → "COPY INVITE LINK" copies `youtube.com/watch?v=…#pawse=CODE`; partner pastes it → content script auto-joins (`AUTOJOIN`) + follows the video. One click.
  - **UI redesign**: lobby↔room views cleanly toggle (create/join hidden in room); hand-built **SVG pixel cat** (blinks + bobs) replacing emoji; better copy; name field; hint text.
- **Bugs found & fixed this pass:**
  1. `.hidden` lost to `#room {display:flex}` (ID > class specificity) → LEAVE showed in lobby. Fixed with `display:none !important` + explicit `setView(false)` on open.
  2. `REQUEST_SYNC` replied when not yet in a room → transient seek-to-0 on share-link tabs. Now guarded by `state.room`.
  3. Incognito default "spanning" would SHARE one background/state between normal+incognito windows (breaks 2-peer test + privacy). Added `"incognito": "split"`.
- **Known non-bugs to expect in test:** (a) browser autoplay policy may keep the partner's video paused until they click it once; (b) verify YouTube doesn't strip the `#pawse=` hash on load.
- **▶ NEXT STEP:** RESTART server (or confirm --watch reloaded), **REMOVE + re-add the extension** (incognito change needs full reload, and enable "Allow in incognito"), refresh both YT tabs, test. Then commit.
- **What Phase 2 now includes:**
  - Play/pause/seek sync (echo-suppressed) ✅ tested
  - **Video-follow**: room tracks `videoId`; host switches video → partner auto-navigates & re-syncs (media cache + `REQUEST_SYNC` on every load; self-heals nav/refresh)
  - **Buffer-aware sync**: `waiting`/`playing` → partner auto-pauses, both resume together
  - **Robustness pass**: persist room to `chrome.storage` + auto-rejoin on worker restart; reconnect-with-backoff; **server grace window (2 min)**; **Leave Room** button; **partner presence** in popup; `safeSend()` orphan hardening
  - **Pixel-cat UI "Cream & Ginger"**: cream/charcoal/ginger (purple removed), CRT scanlines, depress buttons, bundled Press Start 2P, overflow fixed
- **▶ NEXT STEP:** user reloads extension + refreshes both YT tabs, tests: (a) join auto-navigates partner to host's video, (b) host switching video pulls partner along, (c) buffering wait, (d) refresh keeps room, (e) Leave button, (f) UI look. Then **commit + push Phase 2**.
- **⚠️ TEST RULE:** after every extension reload → refresh YT tabs → re-create room.
- **Deferred to later phases:** ad-pause handling (YouTube ads desync), clock-sync ping/pong, drift correction (playbackRate nudge), share-link auto-join (`#pawse=CODE`), free-tier deploy + cold-start UX.

**Working style:** user writes code himself one file at a time (I explain + provide content) — EXCEPT he asked me to write Phase 2 files directly. Every function gets a JSDoc comment. Keep this tracker + memory updated. Auto-push each phase.

---

## Repo structure & status

```
pawse/
├── README.md                    ✅ product overview, two modes, quality/buffer guarantees
├── ROADMAP.md                   ✅ phases 0–8 (incl. monetization), tasks, status
├── FILE-TRACKER.md              ✅ this file — the resume anchor
├── docs/
│   ├── WORKFLOW-TREE.md         ✅ horizontal feature tree + workflows
│   ├── FLOW-DIAGRAM.md          ✅ sequence/flow diagrams (join, sync loop, P2P)
│   ├── STATE-DIAGRAM.md         ✅ state machines (room, player, socket, webrtc)
│   ├── DESIGN.md                ✅ pixel-cat theme (Cream & Ginger), mascots, Meow Feed
│   └── MONETIZATION.md          ✅ tiers, pricing, conversion tactics (Phase 7, future)
│
├── server/                      ✅ Phase 1 — sync relay (Node + ws, no DB) — VERIFIED
│   ├── package.json             ✅ deps (ws), scripts (start/dev)
│   ├── .gitignore               ✅
│   ├── src/
│   │   ├── protocol.js          ✅ MSG + ACTION constants (incl. VIDEO, BUFFER, LEAVE)
│   │   ├── rooms.js             ✅ in-memory rooms, codes, host migration, GRACE WINDOW
│   │   └── index.js             ✅ /health + WS server + routing + heartbeat + leave
│   └── scripts/
│       └── test-client.js       ✅ CLI client to test create/join/broadcast
│
├── extension/                   🚧 Phase 2 — Track A (MV3, YouTube) — code done, testing
│   ├── manifest.json            ✅ MV3 blueprint; content_scripts=[config.js, content.js]
│   ├── config.js                ✅ central config — RELAY_WS/RELAY_HTTP in ONE place
│   ├── background.js            ✅ SW brain: WS + media cache + persist/reconnect/leave
│   ├── content/
│   │   └── content.js           ✅ owns <video>; echo-suppress; buffer + video-follow; safeSend
│   └── popup/
│       ├── popup.html           ✅ pixel UI: create/join/leave, room box, partner box
│       ├── popup.js             ✅ create/join/leave wiring, presence + lobby/room views
│       ├── popup.css            ✅ "Cream & Ginger" pixel theme, overflow-safe
│       └── fonts/
│           └── PressStart2P.ttf ✅ bundled 8-bit font (OFL)
├── player/                      ⬜ Phase 3 — Track B (own-files P2P player)
└── shared/                      ⬜ later — theme tokens + protocol shared across clients
```

---

## File notes (what each does / gotchas)

| File | Purpose | Notes |
|---|---|---|
| `server/src/protocol.js` | Message vocab (`MSG`, `ACTION`) | Shared strings. `MSG`: hello/room/presence/error, create/join/leave, control/video/buffer/chat |
| `server/src/rooms.js` | Room lifecycle | In-memory `Map`; 6-char codes; host migration; **2-min grace window** before destroying empty rooms |
| `server/src/index.js` | Server entry | WS server, routes by type, relays to the *other* peer, 30s heartbeat, leave handler |
| `extension/config.js` | One place for the relay URL | Change here after deploy; loaded into all 3 extension worlds |
| `extension/background.js` | The "brain" (service worker) | Owns WS; **media cache** {videoId, mediaTime, paused}; persists room to storage; auto-rejoin on restart; reconnect backoff |
| `extension/content/content.js` | Owns the `<video>` | Echo suppression (`suppress`); buffer-aware (`waiting`/`playing`); video-follow (`getVideoId`/`navigateTo`); `safeSend` orphan guard |
| `extension/popup/*` | Toolbar UI | Lobby (create/join) ↔ room view (code/partner/leave); pixel Cream & Ginger theme |

---

## Decisions locked (so we don't re-litigate)

- **No DB until Phase 7 (monetization).** Rooms are ephemeral in memory; 2 users. DB (Postgres/Mongo) enters only for accounts/subscriptions/entitlements.
- **Node + `ws`**, ES modules. **All files `.js`** (not `.mjs`) — `"type": "module"` covers it.
- **Two modes:** A = DRM sync (both accounts), B = non-DRM P2P (one host). See README.
- **Quality:** Mode B transfers original file bytes (never re-encoded); pre-load = zero buffering.
- **No DRM circumvention** — permanently out of scope.
- **Monetization from day one (design-aware):** free plan (room of 2) free forever; gate groups/4K/cosmetics. Gate on **entitlement flags**, not plan names. See MONETIZATION.md.
- **Internal vs wire messages:** UPPERCASE `cmd` = inside the extension; lowercase `type` = on the WebSocket wire.
- **Mermaid rule:** no raw `"` `()` `{}` `|` inside node labels (breaks the parser).
- **Testing rule:** reload extension → refresh YT tabs → re-create room (orphaned content scripts otherwise).
