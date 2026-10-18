/**
 * @file rooms.js
 * In-memory room registry for Pawse.
 *
 * A "room" pairs two clients under a short shareable code. All state lives in
 * the `rooms` Map below — no database, because it's only ever 2 people and the
 * data is disposable (a restart just means everyone rejoins). Every function
 * here is pure bookkeeping; the socket wiring happens in index.js.
 */

import { randomInt } from "node:crypto";

/**
 * The whole registry: room code -> room object.
 * A room object is: { code, hostUid, clients: Map<connId, {ws}>, state, createdAt }
 * @type {Map<string, object>}
 */
const rooms = new Map();

/** Characters used in room codes — intentionally excludes 0/O, 1/I/L to avoid
 *  misreads when someone reads the code aloud or types it. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

/** How long an empty room lingers before destruction, so a refresh or brief
 *  network drop can rejoin the SAME code instead of the room vanishing. */
const GRACE_MS = 120000; // 2 minutes

/** Safety cap for a public relay: refuse new rooms past this to bound memory /
 *  abuse. Plenty for a personal tool; raise it if real usage grows. */
const MAX_ROOMS = 500;

/**
 * Generate a room code that isn't already in use.
 * Uses crypto.randomInt (not Math.random) so codes aren't predictable.
 * @returns {string} a unique 6-char uppercase code, e.g. "H7KQ29"
 */
function generateCode() {
  let code;
  do {
    code = Array.from(
      { length: CODE_LEN },
      () => ALPHABET[randomInt(ALPHABET.length)],
    ).join("");
  } while (rooms.has(code)); // vanishingly rare, but guarantee uniqueness
  return code;
}

/**
 * Create a brand-new room. The creator becomes host (by their stable `ws.uid`).
 * @param {import('ws').WebSocket} ws - the creator's socket (must have .uid + .id)
 * @returns {object|null} the new room, or null if the server room cap is hit
 */
export function createRoom(ws) {
  if (rooms.size >= MAX_ROOMS) return null; // public-relay safety cap
  const code = generateCode();
  const room = {
    // Host is identified by a STABLE per-browser uid (survives refresh), NOT the
    // ephemeral connection id — so a host who refreshes reclaims host on rejoin.
    hostUid: ws.uid,
    code,
    clients: new Map([[ws.id, { ws }]]),
    // Last known playback state. Handed to whoever joins next so a late joiner
    // lands on the right video AND at the right timestamp.
    state: {
      videoId: null, // which video the room is watching (YouTube id, etc.)
      action: "pause",
      mediaTime: 0,
      paused: true,
      rate: 1,
      sentAt: null, // relay-clock time mediaTime was true at
      updatedAt: Date.now(),
    },
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

/**
 * Look up a room by code.
 * @param {string|null} code
 * @returns {object|null} the room, or null if the code is unknown/empty
 */
export function getRoom(code) {
  return code ? rooms.get(code) || null : null;
}

/**
 * Add a client to an existing room.
 * @param {object} room - a room object from createRoom/getRoom
 * @param {string} clientId
 * @param {import('ws').WebSocket} ws
 * @returns {object} the same room, now containing the client
 */
/**
 * Kick any OTHER connection in the room that shares this uid — i.e. the same
 * browser's stale socket left over from a refresh. Prevents "seeing yourself as
 * your own partner". We null its roomCode first so its close handler no-ops.
 * @param {object} room
 * @param {string} uid - the (re)joining browser's stable id
 * @param {string} keepConnId - the new connection id to keep
 */
export function dropStaleUid(room, uid, keepConnId) {
  for (const [id, client] of room.clients) {
    if (id !== keepConnId && client.ws.uid === uid) {
      client.ws.roomCode = null;
      try {
        client.ws.terminate();
      } catch {
        /* already gone */
      }
      room.clients.delete(id);
    }
  }
}

export function joinRoom(room, clientId, ws) {
  room.clients.set(clientId, { ws });
  // Someone's back — cancel any pending grace-period destruction.
  if (room.destroyTimer) {
    clearTimeout(room.destroyTimer);
    room.destroyTimer = null;
  }
  return room;
}

/**
 * Remove a client from a room, handling host handoff and cleanup.
 * - If the departing client was the host, the remaining client is promoted.
 * - If the room becomes empty, it is destroyed.
 * @param {string} code - the room the client was in
 * @param {string} clientId - the client leaving
 * @returns {object|null} the room if people remain, or null if it was destroyed
 */
export function leaveClient(code, clientId) {
  const room = rooms.get(code);
  if (!room) return null;

  room.clients.delete(clientId);

  // NOTE: host is tracked by stable `hostUid`, so we do NOT migrate/reassign it
  // on disconnect. The host reclaims their role by uid when they rejoin.

  // Empty room -> DON'T destroy immediately. Hold it for a grace period so an
  // accidental refresh or a brief network drop can rejoin the same code. If
  // someone rejoins (joinRoom), the timer is cancelled.
  if (room.clients.size === 0) {
    if (!room.destroyTimer) {
      room.destroyTimer = setTimeout(() => rooms.delete(code), GRACE_MS);
    }
    return null;
  }
  return room;
}

/**
 * How many rooms are currently live. Handy for a /health stat or debugging.
 * @returns {number}
 */
export function roomCount() {
  return rooms.size;
}
