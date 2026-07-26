# 🐾 Pawse — Design System

**Theme: pixelated cat / retro 8-bit.** Everything looks like a cozy 16-bit console game about two cats watching a movie. Chunky pixels, dithered shadows, a pixel-art cat mascot, and a live stream of fresh cat memes.

---

## 1. Art direction

- **Vibe:** NES/SNES-era pixel art — low-res, crisp, no anti-aliasing. `image-rendering: pixelated` everywhere.
- **Grid:** everything snaps to an **8px base grid**. Icons are 16×16 or 32×32 sprites.
- **Corners:** hard, stepped "pixel corners" (no smooth border-radius). Use a stepped pseudo-element or `clip-path`.
- **Shadows:** dithered / offset hard shadows (`box-shadow: 4px 4px 0 #000`), never soft blur.
- **Motion:** stepped animation (`animation-timing-function: steps(n)`), like sprite frames — never smooth easing.

---

## 2. Palette — "Cream & Ginger" (current, shipped in popup)

**Decision (locked):** we went with a **light, warm "paper / sticker-book"** palette, NOT dark purple. The earlier dark-purple-with-neon look read as generic "AI SaaS" and was rejected. Cream & ginger is warm, physical, cozy, and unmistakably not-a-dashboard — the strongest anti-AI direction. Light also suits the pixel-cat sticker vibe.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#f4ecd8` | App background (warm cream / paper) |
| `--panel` | `#e7dabc` | Insets, cards, dashed boxes |
| `--ink` | `#2a2438` | Primary text + hard borders (charcoal) |
| `--ink-soft` | `#7a6f5d` | Muted labels, footers |
| `--ginger` | `#ef7d1a` | Primary accent (ginger cat) — Create btn, room code, focus |
| `--pink` | `#e85d86` | Kitty accent — partner presence, hearts, Leave btn |
| `--live` | `#3a9d4a` | Connected / "in sync" dot |
| `--off` | `#d9463f` | Offline / disconnect dot |
| pure white | `#ffffff` | Input + code field fills (pop against cream) |

Shadows are offset charcoal at low alpha (`4px 4px 0 rgba(42,36,56,.4)`), never blurred. Scanlines are subtle **dark** lines over the light bg.

**Optional dark theme later** ("movie-night mode") can invert to a warm dark (charcoal bg, cream ink) for actual dark viewing — theme-aware via `prefers-color-scheme`. Not built yet.

---

## 3. Typography

- **Display / headings:** `Press Start 2P` (classic 8-bit font) — for the logo, room codes, buttons.
- **Body / chat / subtitles:** `Silkscreen` or `VT323` (pixel but readable at small sizes). Never use Press Start 2P for paragraphs — it's unreadable in bulk.
- All bundled as local `@font-face` (no external CDN — keeps it self-contained & offline-friendly).
- Room codes rendered BIG in Press Start 2P: `A B C 1 2 3`.

---

## 4. The mascot — "Pixel & Kitty"

Two pixel cats, one per partner:
- **Pixel** (ginger, `--ginger`) = you / host.
- **Kitty** (calico-pink, `--pink`) = your girlfriend / partner.

**Currently shipped:** the popup uses a 🐱 emoji mascot with a stepped "bob" animation as a placeholder. Replacing it with a real 16×16 pixel-art cat sprite sheet is a polish TODO.

Mascot states (16×16 or 32×32 sprite sheets, `steps()` animation):

| State | Sprite behavior |
|---|---|
| Connecting | cat pawing at a ball of yarn |
| In sync / playing | two cats sitting side by side, tails swishing |
| Paused | cat with a paw raised |
| Buffering | cat chasing a loading bar / spinning yarn |
| Partner joined | cat pops up with `!` bubble |
| Partner left | cat curls up, `zzz` |
| Reaction sent | cat throws a heart / laughs |

---

## 5. Component styling

- **Buttons:** chunky, hard pixel border (`--pixel-black`), 4px offset shadow, press = shadow collapses (button moves down 4px). Ginger fill for primary.
- **Room panel:** looks like a retro game "PLAYER SELECT" screen. Big pixel room code + "COPY LINK" cartridge button.
- **Video frame:** thin pixel-art border like a CRT TV / handheld console bezel; optional subtle scanline overlay toggle.
- **Camera bubbles:** the two webcam feeds sit in pixel-cat "portholes" — circular feed masked inside a pixel cat-face frame (ears poking out).
- **Chat sidebar:** speech-bubble messages, pixel font, cat-paw send button. Each message tagged with the sender's cat sprite.
- **Reactions:** pixel hearts 💗, laughing cats, pixel "meow" bursts float up over the video (`steps()` animation).
- **Buffer/health bar:** a pixel yarn-ball unspooling; fills mint-green when healthy, red when starving.

---

## 6. Cat memes — "Meow Feed"

A live, up-to-date stream of cat memes woven into idle/waiting moments (lobby, buffering, intermissions).

### Where they come from (honest sourcing)

| Source | Feasible? | How |
|---|---|---|
| **Reddit** | ✅ **Yes — primary** | Public JSON API: `https://www.reddit.com/r/catmemes/top.json?t=day` (also `r/cats`, `r/catpics`, `r/IllegallySmolCats`). Fetch top posts, filter for images, cache daily. |
| **Curated pack** | ✅ Yes — always available | A bundled set of pixel-cat memes shipped with the app, so the feed works offline / when Reddit is down. |
| Instagram | ❌ No open API for arbitrary memes; ToS forbids scraping | — |
| Pinterest | ❌ No open meme API; scraping violates ToS & breaks constantly | — |
| WhatsApp | ❌ Not a queryable source — just where memes get forwarded | (Add a manual "upload a meme she sent you" button instead) |

### Design of the feed
- **"Meow Feed" widget** in the lobby and during buffering: rotates fresh cat memes so waiting never feels dead.
- Daily refresh from Reddit → cached locally; falls back to the bundled pack if offline.
- **"Add your own"** button: upload memes you two collect (the WhatsApp-forward pile) into a private shared stash.
- Each meme framed in a pixel polaroid with a cat-paw pin.
- Reactions on memes → sent to partner as a shared little joke.

### ⚠️ Note for when you monetize
Reddit-sourced and forwarded memes are other people's copyrighted images — fine for a private two-person tool, but redistributing them in a **paid public product** is legal exposure. Safe path for the public version: ship **original pixel-cat memes** (we can generate our own house style) + let users add their own, rather than rebroadcasting scraped content. Flagged so it doesn't bite later.

---

## 7. Sound (optional, toggleable)

8-bit chiptune SFX: soft "meow" on partner join, pixel "blip" on chat, purring loop option in lobby. All muted by default during playback so it never talks over the movie.

---

## 8. Asset pipeline

- Pixel sprites as SVG or tiny PNG sprite sheets (`image-rendering: pixelated` upscales crisply — a 16px sprite scales to 64px with no blur).
- Keep the whole theme in `shared/theme/` (tokens + fonts + sprites) so both the extension and the player page render identically.
