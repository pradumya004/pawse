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

## 2. Palette (cozy dark, cat-friendly)

Dark by default (movie nights are dark) with warm cat tones.

| Token | Hex | Use |
|---|---|---|
| `--bg-void` | `#12101a` | App background (deep night purple) |
| `--bg-panel` | `#1e1b2e` | Cards, sidebar |
| `--ink` | `#f4ecd8` | Primary text (warm cream) |
| `--cat-orange` | `#ff9f43` | Primary accent (ginger cat) |
| `--cat-pink` | `#ff6b9d` | Kitty accent (hearts, reactions) |
| `--paw-purple` | `#a55eea` | Secondary accent, links |
| `--mint-glow` | `#2ecc71` | "In sync" / success |
| `--alert-red` | `#ff5e57` | Buffering / disconnect |
| `--pixel-black` | `#0a0812` | Hard borders & shadows |

Optional **light theme** ("daytime cat") swaps `--bg-void`→`#f8f0e3`, `--ink`→`#2a2438`. Theme-aware via `prefers-color-scheme`.

---

## 3. Typography

- **Display / headings:** `Press Start 2P` (classic 8-bit font) — for the logo, room codes, buttons.
- **Body / chat / subtitles:** `Silkscreen` or `VT323` (pixel but readable at small sizes). Never use Press Start 2P for paragraphs — it's unreadable in bulk.
- All bundled as local `@font-face` (no external CDN — keeps it self-contained & offline-friendly).
- Room codes rendered BIG in Press Start 2P: `A B C 1 2 3`.

---

## 4. The mascot — "Pixel & Kitty"

Two pixel cats, one per partner:
- **Pixel** (ginger, `--cat-orange`) = you / host.
- **Kitty** (calico-pink, `--cat-pink`) = your girlfriend / partner.

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
