/**
 * @file player/config.js
 * Central config for the Pawse own-files player (Track B).
 * THE ONE PLACE to change the relay URL after deploy — player.js reads these.
 */
window.PAWSE_CONFIG = {
  RELAY_WS: "ws://localhost:8080", // WebSocket endpoint of the relay server
  // Free public STUN server for WebRTC NAT traversal (no account needed).
  ICE_SERVERS: [{ urls: "stun:stun.l.google.com:19302" }],
};
