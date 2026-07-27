/**
 * @file config.js
 * Central configuration for the Pawse extension.
 *
 * THE ONE PLACE to change the relay URL. After deploying the server, edit the
 * two values here and every part of the extension (background, content script,
 * popup) picks them up — no hunting through files.
 *
 * Loaded as a plain (non-module) script into all three worlds:
 *   - background.js  via importScripts("config.js")
 *   - content.js     via manifest content_scripts: ["config.js", ...]
 *   - popup.html     via <script src="../config.js">
 * Each of those sets the same global below.
 */
globalThis.PAWSE_CONFIG = {
  // Production cloud relay (Render). For local dev, swap to ws://localhost:8080.
  RELAY_WS: "wss://pawse-relay.onrender.com", // WebSocket endpoint of the relay server
  RELAY_HTTP: "https://pawse-relay.onrender.com", // HTTP endpoint (used for /health)
};
