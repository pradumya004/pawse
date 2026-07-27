/**
 * @file src/config.js
 * Central config for the Pawse player.
 *
 * The relay URL comes from a build-time env var so we never edit code to deploy:
 *   - local dev  -> falls back to ws://localhost:8080
 *   - production -> set VITE_RELAY_WS in Vercel (e.g. wss://pawse-relay.onrender.com)
 *
 * IMPORTANT: on an https site the relay MUST be wss:// (secure) — browsers block
 * insecure ws:// from https pages.
 */
export const PAWSE_CONFIG = {
  RELAY_WS: import.meta.env.VITE_RELAY_WS || "ws://localhost:8080",
  // WebRTC NAT traversal:
  //  - STUN just tells a browser its public address (works on friendly NATs).
  //  - TURN RELAYS the media when a direct P2P connection is impossible
  //    (strict/symmetric NAT — common on mobile & many ISPs, esp. long-distance).
  // Without TURN, two people on different networks often can't connect at all.
  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};
