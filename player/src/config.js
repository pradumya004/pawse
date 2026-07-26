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
  // Free public STUN server for WebRTC NAT traversal (no account needed).
  ICE_SERVERS: [{ urls: "stun:stun.l.google.com:19302" }],
};
