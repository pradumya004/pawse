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
  //  - TURN RELAYS media/data when a direct P2P connection is impossible
  //    (strict/symmetric NAT — common on mobile & many ISPs, esp. long-distance).
  // WebRTC tries direct (STUN) first and only uses TURN as a fallback, so TURN
  // quota is spent only when a direct path can't be found. The multiple ports
  // (80, 443, TLS/tcp) maximize the chance of punching through locked networks.
  // TURN creds are client-side by design (the browser needs them).
  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    // Primary: ExpressTURN (free, ~1000GB/mo, no card) — port 3478 UDP + TCP.
    { urls: "turn:free.expressturn.com:3478", username: "000000002100599088", credential: "H/5J1xXDaq7PL4IU5gge73njdms=" },
    { urls: "turn:free.expressturn.com:3478?transport=tcp", username: "000000002100599088", credential: "H/5J1xXDaq7PL4IU5gge73njdms=" },
    // Fallback: metered 443/TLS — punches through networks that block 3478
    // (small quota; only used when ExpressTURN's port is unreachable).
    { urls: "turn:global.relay.metered.ca:443", username: "73adf437e22711a4e0f09114", credential: "3B3L3xh8nQWfuTlZ" },
    { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "73adf437e22711a4e0f09114", credential: "3B3L3xh8nQWfuTlZ" },
  ],
};
