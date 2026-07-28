# 🐾 Pawse — File Tracker

> **Purpose:** the single map of what exists, what doesn't, and where we are — so work can resume cleanly even after Claude's context resets. **Update this every time a file is created, renamed, or its purpose changes.**

> **GitHub:** https://github.com/pradumya004/pawse (private). Commit author: `pradumya.official@gmail.com`. Account: `pradumya004`.
>
> **DEPLOY (v1) — LIVE ✅:**
> - **App (player):** https://pawsetv.vercel.app (Vercel, public, `VITE_RELAY_WS=wss://pawse-relay.onrender.com`)
> - **Relay:** `wss://pawse-relay.onrender.com` (Render Singapore free, svc `srv-d9ji3p1l565s73fubkd0`) — verified end-to-end (created room over wss)
> - **Keep-alive:** UptimeRobot monitor #803599828 → pings /health
> - **Extension (Track A):** ✅ now points at cloud relay (`extension/config.js` = wss://pawse-relay.onrender.com; manifest host_permissions include it, localhost kept for dev). Reload the unpacked extension to apply. For Kitty: send her the `extension/` folder to load unpacked (Web Store listing = later).
>
> **⚙️ AUTO-PUSH RULE (standing authorization):** at the end of every phase, automatically `git add . && git commit && git push` — no need to ask. Commit message format: `Phase N: <summary>`.

**Legend:** ✅ done · 🚧 in progress · ⬜ planned (not created yet)

---

## Timeline

| Phase | Status | Committed & pushed |
|---|---|---|
| 0 — Foundations / docs | ✅ done | ✅ |
| 1 — Sync relay server | ✅ **COMPLETE & VERIFIED** | ✅ `Phase 1: sync relay server + project docs` |
| 2 — Extension (Track A, YouTube) | ✅ working (user-confirmed) | ✅ `Phase 2 polish...` |
| 3 — Own-files P2P (Track B) | ✅ B1 file transfer + Meow Feed; edge bugs fixed & verified | ✅ `Phase 3 fixes...` (pending user's real-file playback test) |
| 4 — DRM adapters | ⬜ | ⬜ |
| 5 — Together layer (cam/chat) | 🚧 voice/video call + text chat built (player) | ⬜ testing |
| 6 — Polish + **DEPLOY** | ✅ **LIVE** (player Vercel + relay Render + UptimeRobot) | ✅ `v1 deployed...` |
| 7 — Monetization (see docs/MONETIZATION.md) | ⬜ future | ⬜ |
| 8 — Store distribution (Chrome Web Store) | 🚧 listing prepped; awaiting user's $5 + submit | ⬜ |

## Current position

- **v1 LIVE:** app https://pawsetv.vercel.app · relay wss://pawse-relay.onrender.com · both tracks on cloud.
- **Chrome Web Store listing PREPPED:** pixel-cat icons wired into manifest; extension packaged to `build/pawse-extension-v0.1.0.zip` (valid, forward slashes); privacy policy → https://pawsetv.vercel.app/privacy.html; listing copy in `docs/STORE-LISTING.md`. **▶ user: pay $5 dev fee → upload zip → paste copy → screenshots → submit.**
- **UI overhaul (done):** responsive full-width two-column layout (lobby: card+meowfeed; room: video+sidebar), paw-print bg, cuter typography/taglines. MeowFeed now pulls from 8 cat subreddits (Catmemes/funnycats/sillycats/CatReacts/WhatsWrongWithYourCat/WhyCatHowCat/cats/catpics) and supports images + GIFs + videos.
- **✅ REAL-SESSION BUGS FIXED (from gf test):**
  1. **No video across networks → added TURN** in `player/src/config.js` ICE_SERVERS (openrelay.metered.ca, STUN+TURN). STUN-only failed cross-ISP/mobile NAT. THE critical fix for long-distance P2P.
  2. **"waiting for partner" (her WS dropped when tab backgrounded) → visibilitychange reconnect** in `player/src/lib/PawseClient.js` constructor (reconnects + auto-rejoins when tab refocuses). Presence code itself was already correct (verified live).
- **Phase 5 (Together Layer) — IN PROGRESS in player:**
  - **Voice/video call** ✅ built: `getUserMedia` cam/mic on a SEPARATE call peer connection (`callPc`) using the **perfect-negotiation** pattern (either side toggles camera anytime, no offer glare). Signals tagged `ch:"call"` vs the file P2P. Local (mirrored) + remote cam bubbles in the room sidebar + camera toggle.
  - **Text chat** ✅ built: over the relay's existing `chat` message type; chat log + input in sidebar.
  - Reuses Phase 3 WebRTC groundwork (signaling, STUN/TURN).
  - **Layout fixed:** movie is now the hero (fills height; `.stage` was centering, now stretches); bigger cam bubbles; slim sidebar.
  - **Subtitles:** external `.srt`/`.vtt` supported (SRT auto-converted to WebVTT), per-side, via "ADD SUBTITLES" button. Embedded MKV subs NOT possible in browser.
  - **TODO:** test call+chat with Kitty (needs 2 cameras); reactions (5.3); scheduled dates (5.5); cam bubble in extension (Track A) later.
- **⚠️ CODEC LIMITATION (not a bug — document/guide users):** "no sound + dead volume" = the file's audio is **AC3/E-AC3/DTS (Dolby/DTS)**, which browsers CANNOT decode (they only do AAC/MP3/Opus/Vorbis/FLAC). Common in dual-audio movie MKVs. Fix: use MP4 (H.264 + AAC) or `ffmpeg -i in.mkv -c:v copy -c:a aac out.mp4`. Added a host hint in the UI. Multi-audio-track switching also not feasible in-browser.
- **Quality (answered):** Track B sends ORIGINAL file bytes → 1080p/1440p identical both sides, no re-encode. Caveat: partner must decode the codec (H.264 universal; HEVC/H.265 spotty in browsers).
- **Bug fixes (this round):**
  - Chat/page scroll: `#root` height:100vh + overflow hidden; stage overflow-y auto; chatlog min-height:0 → chat scrolls internally, page no longer grows.
  - A/V call not connecting: **queue call ICE candidates arriving before remote desc** (were dropped → ICE never completed). Added `play()` on stream assign + `[Pawse] call ...` console logs for debugging.
- **Format note (support/docs):** MKV files with AC3/DTS/Dolby audio play silent in browsers (no decodable audio track). Guide users to MP4 (H.264 + AAC), or `ffmpeg -i in.mkv -c:v copy -c:a aac out.mp4`.
- **Host-role-on-refresh fix:** host was keyed to the ephemeral WS connection id → refresh demoted host to follower (movie picker vanished). Fixed with a stable per-browser `uid` (localStorage) sent on create/join; server tracks `hostUid` and no longer migrates host on disconnect. Touches server + player (both redeploy). NOTE: extension (Track A) has the same latent issue (no stable uid yet) — apply the same fix there if it surfaces.
- **"Seeing yourself as partner" fix:** on refresh the old socket lingered → room briefly had two of the same uid → self leaked into partner slot. Server `dropStaleUid()` terminates any other connection with the same uid on join (keeps newest). Client clears partnerName/partnerCam on partner leave; remote cam bubble shows "waiting for partner" (no ghost name).
- **TURN (cross-network P2P):** `player/src/config.js` ICE_SERVERS = Google STUN + **ExpressTURN** (free, no card, ~1TB/mo, port 3478 UDP/TCP — primary) + **metered 443/TLS** (small-quota punch-through fallback for nets that block 3478). Movie failing cross-network = P2P not connecting = needed real TURN. If ExpressTURN 3478 is blocked on the user's nets, escalate to **Cloudflare TURN** (443/TLS + ~1TB, no card). Diagnostic: `[Pawse] call conn:` in console (connected vs failed).
- **Pending:** test call+chat after hard-refresh (both START CAMERA); if call still fails, grab console `[Pawse] call` logs. Store screenshots. openrelay TURN → get free metered.ca key if flaky.
- **Rebuild:** icons `cd extension && node scripts/make-icons.js`; zip `node scripts/package-extension.cjs` (build/ is gitignored).

<details><summary>— earlier history —</summary>

- **Player = Vite + React app.** Logic in `PawseClient` (plain class); React only renders.
- **QUALITY FIX DONE (B1):** replaced laggy captureStream with **P2P file-byte transfer** — host sends the original file over a WebRTC DataChannel (16KB chunks, backpressure); partner reassembles a Blob and plays the NATIVE file locally. Both play local copies → native quality, seekable, sync via control events. Progress bar shows transfer %. Tradeoff: partner downloads before watching (pre-load model).
- **Meow Feed added:** rotating cat memes (meme-api.com → Reddit, CORS-ok) in lobby + while waiting/transferring. Graceful fallback if API down. Files: `src/MeowFeed.jsx`.
- **UI made cuter/funkier:** wiggling paws, playful copy, 😻/😿 partner states, striped progress bar.
- **▶ DEV WORKFLOW:** backend `cd server && npm run dev`; frontend `cd player && npm run dev` → http://localhost:5173. Two windows to test.
- **Edge bugs fixed + verified in-browser (Claude-in-Chrome, 0 console errors):**
  1. Host's "waiting for partner" hint stuck after join → central `_updateHint()`; now flips to "pick a movie file"/partner name.
  2. Partner refresh logged out of room → player now persists room+name to localStorage + reconnects/rejoins (verified: refreshed partner stayed in room).
  3. Host didn't re-send file after partner rejoin → teardown stale peer on presence, re-offer.
  4. Partner missed host's position after transfer → `resync` request on assemble.
  5. Name UX unclear → lobby now ①name ②pick-one with hints for both paths.
- **Known limitation:** HOST refresh loses the File (can't persist a File object) + role may migrate; host should re-create if they refresh. Documented, not fixed for v1.
- **Next Track B:** B0 shared-file detection, subtitles, MSE play-while-downloading for huge files.

</details>

**Stack decision (locked):** extension = vanilla HTML/CSS/JS (loads unpacked). player = Vite + React (real web app; where React earns its keep). server = Node. Future paid dashboard would also be React.

---
### (previous) Phase 2 history
- **Sync VERIFIED in Chrome** (both windows synced on same video ✅). Then follow-up pass:
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
├── extension/                   ✅ Track A (MV3, YouTube) — on cloud relay + Web-Store-ready
│   ├── manifest.json            ✅ MV3; icons; cloud relay host_perms; incognito split
│   ├── config.js                ✅ central config — points at cloud relay (wss://…onrender.com)
│   ├── background.js            ✅ SW brain: WS + media cache + persist/reconnect/leave
│   ├── content/
│   │   └── content.js           ✅ owns <video>; echo-suppress; buffer + video-follow; safeSend
│   ├── icons/                   ✅ icon16/48/128.png (pixel cat, generated)
│   │   └── icon{16,48,128}.png
│   ├── scripts/
│   │   └── make-icons.js        ✅ pure-Node PNG icon generator (no deps)
│   └── popup/
│       ├── popup.html/js/css    ✅ pixel UI (create/join/leave, presence)
│       └── fonts/PressStart2P.ttf ✅ bundled 8-bit font (OFL)
├── player/                      🚧 Phase 3 — Track B (own-files P2P player) — VITE + REACT
│   ├── package.json             ✅ scripts: dev / build / preview; deps react + vite
│   ├── vite.config.js           ✅ React plugin, dev server port 5173
│   ├── index.html               ✅ Vite entry → /src/main.jsx
│   ├── .gitignore               ✅ node_modules, dist
│   ├── public/
│   │   └── PressStart2P.ttf      ✅ bundled pixel font (served at /PressStart2P.ttf)
│   └── src/
│       ├── main.jsx             ✅ React root
│       ├── App.jsx              ✅ UI (lobby/room) + progress bar + Meow Feed
│       ├── Cat.jsx              ✅ pixel-cat SVG component
│       ├── MeowFeed.jsx         ✅ rotating cat memes (meme-api.com)
│       ├── config.js            ✅ relay URL + STUN servers
│       ├── styles.css           ✅ Cream & Ginger pixel theme + cute bits
│       └── lib/
│           └── PawseClient.js   ✅ WS + WebRTC DataChannel FILE TRANSFER (B1) + sync
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
