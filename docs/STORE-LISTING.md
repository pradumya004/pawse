# 🐾 Pawse — Chrome Web Store Listing (copy-paste ready)

Everything to fill into the Web Store submission form. Draft; tweak the voice as you like.

---

## Basics

- **Name** (max 45): `Pawse — Watch Together`
- **Summary** (max 132): `Watch YouTube together in perfect sync with your partner. Play, pause & seek as one — purr-fectly synced. Made for long distance. 🐾`
- **Category:** `Social & Communication`
- **Language:** English

## Detailed description

```
Pawse lets you and your partner watch YouTube together, perfectly in sync — even across the world.

One of you starts a room, shares a link, and you both watch the same video at the same moment. Press play, pause, or skip ahead — it happens on both screens instantly. No more "3… 2… 1… play!" over the phone.

Made for long-distance couples (and any two people who want to watch together).

✨ FEATURES
• Perfect play / pause / seek sync on YouTube
• One-click invite link — your partner just clicks and they're in
• Follows you as you switch videos — no need to send new links
• Buffer-aware: if one side lags, the other waits, then you resume together
• See when your partner joins
• Cozy pixel-cat design 🐱

🔒 PRIVATE BY DESIGN
• No account, no email, no password
• No ads, no tracking, no analytics
• Rooms are just between the two of you

Want to watch your OWN movie files together too (not just YouTube)? Try the companion web app at https://pawsetv.vercel.app — one of you picks a file, the other watches it streamed peer-to-peer. No uploads, no accounts.

Free. Made with 🐾 & love.
```

## Privacy

- **Privacy policy URL:** `https://pawsetv.vercel.app/privacy.html`
- **Single purpose:** `Pawse synchronizes YouTube video playback between two people so they can watch together in real time.`

## Permission justifications (Web Store asks for each)

- **storage:** `Remembers the user's display name and current room code locally so they don't re-enter them.`
- **tabs:** `Identifies which browser tab holds the video the user wants to sync, so playback commands go to the right tab.`
- **host permission (youtube.com):** `Reads and controls the YouTube video player (play/pause/seek/current video) to keep both viewers in sync.`
- **host permission (pawse-relay.onrender.com):** `Opens the WebSocket connection to Pawse's own relay server that forwards play/pause events between the two viewers.`
- **Remote code:** `No` — all code is bundled in the package; nothing is loaded remotely.

## Assets needed

- **Store icon:** `extension/icons/icon128.png` ✅ (128×128)
- **Screenshots (1280×800 or 640×400, at least 1):** capture the popup + a synced YouTube session. (Can generate from the running extension.)
- **Small promo tile (440×280, optional):** nice-to-have, not required.

## Submission checklist

1. Package: `build/pawse-extension-v0.1.0.zip` (built by `npm`-free zip; see below).
2. developer.chrome.com/webstore → pay one-time **$5** dev fee → verify account.
3. **New Item** → upload the zip.
4. Fill in the fields above; upload icon + screenshots; set privacy policy URL.
5. Submit for review (takes a few days to ~2 weeks for a first listing).
6. Once approved: share the Web Store link with Kitty — she installs in one click.

## Rebuilding the package later

From `extension/`: regenerate icons with `node scripts/make-icons.js`, bump `version` in
`manifest.json`, then re-zip the folder (excluding `scripts/`).
