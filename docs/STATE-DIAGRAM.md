# Pawse — State Diagrams

The three state machines that make sync bug-free. Most watch-party bugs are one of these machines being implicit instead of explicit — so we make them explicit from day one.

---

## 1. Room lifecycle (server side)

```mermaid
stateDiagram-v2
    [*] --> Created: host sends create
    Created --> Waiting: room code issued
    Waiting --> Active: partner joins
    Active --> Degraded: one peer disconnects
    Degraded --> Active: peer rejoins within grace (2 min)
    Degraded --> Waiting: grace expires, one peer left
    Active --> Degraded: host drops → follower promoted to host
    Waiting --> Destroyed: empty past TTL
    Degraded --> Destroyed: both gone past TTL
    Active --> Destroyed: explicit end session
    Destroyed --> [*]

    note right of Degraded
        Remaining peer's video auto-pauses.
        Room state (mediaTime, paused) is
        snapshotted for the rejoiner.
    end note
```

---

## 2. Client player state machine (extension content script / player page)

This is the machine that prevents echo loops and drift fights. A client is *always* in exactly one of these states.

```mermaid
stateDiagram-v2
    [*] --> Detached: page loaded, no video found
    Detached --> Attached: adapter finds video element
    Attached --> Idle: joined room, gate not open
    Idle --> InSync: both-ready gate opens

    state InSync {
        [*] --> Playing
        Playing --> Paused: local OR remote pause
        Paused --> Playing: local OR remote play
        Playing --> Nudging: drift 0.3–1s → playbackRate 1.05/0.95
        Nudging --> Playing: drift < 0.1s → rate 1.0
        Playing --> HardSeek: drift > 1s or remote seek
        Paused --> HardSeek: remote seek while paused
        HardSeek --> Playing: seeked + canplay
        HardSeek --> Paused: was paused before seek
    }

    InSync --> ApplyingRemote: remote command arrives
    ApplyingRemote --> InSync: local event swallowed (echo suppression)
    InSync --> Buffering: waiting/stalled event
    Buffering --> InSync: canplay → notify partner, resume
    InSync --> PartnerLost: presence timeout
    PartnerLost --> InSync: partner rejoins → resync from host state
    Attached --> Detached: SPA nav destroys video (YouTube!)
    Detached --> Attached: MutationObserver re-finds video

    note right of ApplyingRemote
        suppressNext flag set BEFORE
        calling play()/pause()/seek so the
        resulting DOM event is not
        rebroadcast → no infinite loop.
    end note
```

---

## 3. WebSocket connection + session (every client) — ✅ implemented in background.js

```mermaid
stateDiagram-v2
    [*] --> Idle: worker start
    Idle --> Connecting: create/join OR restored room from storage
    Connecting --> Open: onopen
    Connecting --> WakingServer: connect timeout (free-tier cold start)
    WakingServer --> Connecting: backoff retry (1s, 2s, 4s… cap 30s)
    Open --> InRoom: server confirms room (persisted to storage)
    InRoom --> Reconnecting: onclose while still holding a room
    Reconnecting --> Connecting: scheduleReconnect (backoff)
    Connecting --> Rejoining: reconnected, send join(savedCode)
    Rejoining --> InRoom: room still exists (within grace) → resync
    Rejoining --> Ended: error no_such_room (grace expired) → clear storage
    InRoom --> Ended: user clicks Leave (clear storage)
    Ended --> Idle
    Idle --> [*]

    note right of Reconnecting
        Room code lives in chrome.storage, so a
        killed MV3 worker or a wifi blip
        auto-reconnects and rejoins the SAME
        room instead of dropping the session.
        Server holds the room for a 2-min grace.
    end note
```

> Clock-sync ping/pong (RTT compensation) is deferred — not yet in the machine above.

---

## 4. Track B — WebRTC peer connection (own-files mode only)

```mermaid
stateDiagram-v2
    [*] --> HashCheck: both joined — compare file hash
    HashCheck --> SharedLocal: partner already has the file (B0)
    SharedLocal --> [*]: no transfer — each plays own copy, native quality, sync only
    HashCheck --> Signaling: partner lacks file → set up transfer
    Signaling --> Checking: offer/answer + ICE via relay
    Checking --> ConnectedP2P: direct path found (STUN)
    Checking --> RelayFallback: NATs hostile, no P2P path
    ConnectedP2P --> TransferB1: file bytes over DataChannel → MSE (lossless)
    RelayFallback --> TransferB1: same bytes via WS relay (slower, still lossless)
    TransferB1 --> Buffering: bandwidth dip
    Buffering --> TransferB1: refilled — quality NEVER downgraded, only paused
    TransferB1 --> Renegotiating: network change (WiFi→hotspot)
    Renegotiating --> TransferB1: ICE restart success
    Renegotiating --> RelayFallback: ICE restart fails
    TransferB1 --> [*]: session ends

    note right of TransferB1
        Partner plays the ORIGINAL file bytes,
        not a re-encoded stream. Both sides
        decode identical data → identical quality.
        captureStream (B2) is fallback only.
    end note
```
