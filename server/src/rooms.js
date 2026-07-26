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
 * A room object is: { code, hostId, clients: Map<id, {ws}>, state, createdAt }
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
 * Create a brand-new room with the given client as its host.
 * @param {string} hostId - the creator's client id
 * @param {import('ws').WebSocket} ws - the creator's socket
 * @returns {object} the new room object (its `.code` is the shareable code)
 */
export function createRoom(hostId, ws) {
  const code = generateCode();
  const room = {
    code,
    hostId,
    clients: new Map([[hostId, { ws }]]),
    // Last known playback state. Handed to whoever joins next so a late joiner
    // lands on the right video AND at the right timestamp.
    state: {
      videoId: null, // which video the room is watching (YouTube id, etc.)
      action: "pause",
      mediaTime: 0,
      paused: true,
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

  // Host migration: promote whoever's left so the room still has a source of truth.
  if (room.hostId === clientId) {
    room.hostId = room.clients.keys().next().value || null;
  }

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
