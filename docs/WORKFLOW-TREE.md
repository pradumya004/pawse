# Pawse — Feature Tree & Master Workflow

## 1. The horizontal feature tree

Everything Pawse is or will be, left → right: product → tracks → capabilities → sub-features. Each leaf maps to a roadmap phase (tagged `P#`).

```mermaid
graph LR
    PAWSE((🐾 Pawse))

    PAWSE --> CORE[Sync Core P1]
    PAWSE --> TA[Track A<br/>Platform Sync P2/P4]
    PAWSE --> TB[Track B<br/>Own-Files P2P P3]
    PAWSE --> TOG[Together Layer P5]
    PAWSE --> INFRA[Infra & Ops P0/P6]

    %% ---- Sync Core ----
    CORE --> C1[Rooms]
    C1 --> C1a[6-char share codes]
    C1 --> C1b[Host / follower roles]
    C1 --> C1c[Host migration]
    C1 --> C1d[Rejoin grace window]
    CORE --> C2[Control protocol]
    C2 --> C2a[play / pause / seek / rate]
    C2 --> C2b[seq ordering, stale-drop]
    C2 --> C2c[Echo suppression]
    CORE --> C3[Time discipline]
    C3 --> C3a[RTT clock sync]
    C3 --> C3b[Drift nudge via playbackRate]
    C3 --> C3c[Hard-seek threshold]
    CORE --> C4[Presence]
    C4 --> C4a[Heartbeats]
    C4 --> C4b[Buffering → auto-pause partner]
    C4 --> C4c[Disconnect → auto-pause]

    %% ---- Track A ----
    TA --> A1[MV3 Extension]
    A1 --> A1a[Popup: create/join/status]
    A1 --> A1b[BG worker owns WS]
    A1 --> A1c[Content script per tab]
    TA --> A2[Adapter registry]
    A2 --> A2a[YouTube ✅ first<br/>ads + SPA nav]
    A2 --> A2b[Netflix<br/>page-context player API]
    A2 --> A2c[Prime Video]
    A2 --> A2d[JioHotstar]
    A2 --> A2e[Generic HTMLMediaElement<br/>= free coverage of random sites]
    TA --> A3[Join UX]
    A3 --> A3a[Share link with #room hash]
    A3 --> A3b[Both-ready gate]
    A3 --> A3c[Same-title verification]

    %% ---- Track B ----
    TB --> B1[Static player page]
    B1 --> B1a[Local file input<br/>file never uploaded]
    B1 --> B1b[Subtitles .srt/.vtt]
    TB --> B2[P2P transport<br/>quality-first]
    B2 --> B2a[B0: shared local file<br/>each plays own copy = native quality]
    B2 --> B2b[B1: file-byte transfer + MSE<br/>lossless, identical both sides]
    B2 --> B2c[B2: captureStream<br/>fallback only, avoided]
    B2 --> B2d[Adaptive buffering NOT quality<br/>dip → pause+buffer, never downgrade]
    B2 --> B2e[STUN → relay fallback<br/>bytes stay lossless]
    TB --> B4[Zero-buffer engine]
    B4 --> B4a[Pre-load for scheduled dates<br/>= B0 zero buffering at showtime]
    B4 --> B4b[Upload-vs-bitrate check<br/>recommend pre-load if pipe too thin]
    B4 --> B4c[60–90s lead buffer + both-ready gate]
    B4 --> B4d[Direct P2P preferred over relay<br/>lower latency]
    TB --> B3[Music mode]
    B3 --> B3a[Local audio files synced<br/>Spotify itself → use Jam]

    %% ---- Together layer ----
    TOG --> T1[Chat]
    T1 --> T1a[Text sidebar]
    T1 --> T1b[Emoji reactions overlay]
    TOG --> T2[Call]
    T2 --> T2a[WebRTC voice]
    T2 --> T2b[Camera PiP bubble 🐱]
    TOG --> T3[Rituals]
    T3 --> T3a[Scheduled movie dates]
    T3 --> T3b[Watch history<br/>e.g. 42 movies together]

    %% ---- Infra ----
    INFRA --> I1[Free hosting]
    I1 --> I1a[WS relay: Render/Fly/Railway]
    I1 --> I1b[Player: GitHub Pages/Vercel]
    I1 --> I1c[Cold-start wake UX]
    INFRA --> I2[Quality]
    I2 --> I2a[CI lint+typecheck+deploy]
    I2 --> I2b[Debug overlay: RTT/drift/buffer]
    I2 --> I2c[Room passwords]
```

---

## 2. Master workflow — a movie night, end to end

```mermaid
flowchart LR
    S([You: movie night 🐾]) --> Q{What are we watching?}

    Q -->|YouTube / free web| A0[Open video page]
    Q -->|Netflix / Prime / Hotstar<br/>both have logins| A0
    Q -->|Our own file| B0[Open Pawse player,<br/>pick local file]

    A0 --> A1[Extension → Create room] --> L[Share link → Kitty 💬]
    B0 --> B1[Player → Create room] --> L

    L --> J[She opens link → auto-join]
    J --> G{Both-ready gate}
    G -->|Track A| GA[Same title loaded both sides]
    G -->|Track B| GB[P2P stream connected]
    GA --> P[▶ Synced playback]
    GB --> P

    P --> LOOP[Either pauses/seeks →<br/>relay → partner applies<br/>drift loop keeps < 0.3s]
    LOOP --> P
    P --> X[Camera bubble + chat + reactions]
    X --> E([Credits roll — logged to watch history ❤])
```

---

## 3. Development workflow (how we ship each feature)

```mermaid
flowchart LR
    F[Pick leaf from feature tree] --> B[Branch feat/xxx]
    B --> D[Build against local relay<br/>two browser profiles = you & her]
    D --> T{Two-tab sync test passes?<br/>drift < 0.3s over 10 min}
    T -->|no| D
    T -->|yes| R[Real-world test:<br/>actual movie night with GF 🐱]
    R --> N{Survived a full movie?}
    N -->|no → bug notes| D
    N -->|yes| M[Merge → auto-deploy relay + player]
    M --> F
```

Your girlfriend is the QA department. Every feature graduates only after one real movie night.
