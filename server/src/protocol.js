/**
 * @file protocol.js
 * The shared message vocabulary for Pawse.
 *
 * Every client (relay server, browser extension, player page, test client)
 * imports these constants so all sides agree on message names. Never type a
 * raw message string anywhere else — always reference MSG / ACTION.
 *
 * Wire format is always JSON: { type: <MSG value>, ...payload }
 */

/**
 * Message types — the `type` field on every packet.
 * Grouped by direction for readability; the strings are what actually travel.
 */
export const MSG = {
  // ---- server -> client ----
  HELLO: "hello", // sent once on connect; carries the client's assigned id
  ROOM: "room", // reply to create/join; carries room code, role, host state
  PRESENCE: "presence", // partner joined / left / buffering
  ERROR: "error", // request failed (e.g. joining a room that doesn't exist)

  // ---- client -> server ----
  CREATE: "create", // "make a new room, I'm the host"
  JOIN: "join", // "join this room by code"

  // ---- relayed to the OTHER peer (bidirectional) ----
  CONTROL: "control", // playback command: play / pause / seek / rate
  CHAT: "chat", // text message or reaction
};

/**
 * Playback actions — the `action` field carried inside a CONTROL message.
 * Kept separate from MSG so a control packet is { type: 'control', action: 'play', ... }.
 */
export const ACTION = {
  PLAY: "play", // resume playback
  PAUSE: "pause", // halt playback
  SEEK: "seek", // jump to a timestamp (carries mediaTime)
  RATE: "rate", // change playback speed (drift-correction nudges)
};  