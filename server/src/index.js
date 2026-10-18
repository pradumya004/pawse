/**
 * @file index.js
 * Pawse sync relay — entry point.
 *
 * Responsibilities:
 *   1. Serve a tiny HTTP /health endpoint (used to wake/ping a sleeping
 *      free-tier host and confirm it's alive).
 *   2. Run a WebSocket server on the same port.
 *   3. Route each incoming message by its `type` to a room action.
 *   4. Relay control/chat events to the OTHER peer (never echo to the sender).
 *   5. Heartbeat every connection so dead sockets get cleaned up.
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { MSG } from "./protocol.js";
import {
  createRoom,
  joinRoom,
  getRoom,
  leaveClient,
  roomCount,
  dropStaleUid,
} from "./rooms.js";

const PORT = process.env.PORT || 8080;

// Test hook: add latency to every message in each direction, keeping order per
// socket. Used by scripts/measure-sync.mjs; both default to 0 in production.
const DELAY_MS = Number(process.env.RELAY_DELAY_MS) || 0;
const JITTER_MS = Number(process.env.RELAY_JITTER_MS) || 0;

function later(ws, lane, fn) {
  if (!DELAY_MS && !JITTER_MS) return fn();
  const q = (ws[lane] ||= []);
  const due = Math.max(q.at(-1)?.due ?? 0, Date.now() + DELAY_MS + Math.random() * JITTER_MS);
  q.push({ due, fn });
  if (q.length === 1) drain(q);
}

// One timer per lane, so equal due times can never swap order (TCP doesn't).
function drain(q) {
  setTimeout(() => {
    while (q.length && q[0].due <= Date.now()) q.shift().fn();
    if (q.length) drain(q);
  }, Math.max(0, q[0].due - Date.now()));
}

/**
 * HTTP server. Only answers /health; everything else 404s. The WebSocket
 * server shares this same port by attaching to it below.
 */
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: roomCount(), ts: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

/**
 * Send a typed JSON message to a single socket (no-op if it's not open).
 * @param {import('ws').WebSocket} ws
 * @param {string} type - a MSG.* value
 * @param {object} [payload] - extra fields merged alongside `type`
 */
function send(ws, type, payload = {}) {
  const data = JSON.stringify({ type, ...payload });
  later(ws, "outQ", () => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
}

/**
 * Relay a message to everyone in a room EXCEPT the sender.
 * Skipping the sender is our first line of defense against sync echo loops.
 * @param {object} room - room object
 * @param {string} type - a MSG.* value
 * @param {object} payload
 * @param {string} exceptId - client id NOT to send to (usually the sender)
 */
function broadcast(room, type, payload, exceptId) {
  for (const [id, client] of room.clients) {
    if (id === exceptId) continue;
    send(client.ws, type, payload);
  }
}

/**
 * A new socket connected = one browser tab. Assign identity and wire handlers.
 */
wss.on("connection", (ws) => {
  ws.id = randomUUID(); // unique per connection
  ws.roomCode = null; // which room this socket is in (set on create/join)
  ws.isAlive = true; // heartbeat flag
  ws.on("pong", () => {
    ws.isAlive = true;
  }); // client answered our ping

  send(ws, MSG.HELLO, { id: ws.id });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore anything that isn't valid JSON
    }
    later(ws, "inQ", () => handle(ws, msg));
  });

  ws.on("close", () => {
    if (!ws.roomCode) return;
    const room = leaveClient(ws.roomCode, ws.id);
    // Tell the remaining partner they're now alone.
    if (room)
      broadcast(room, MSG.PRESENCE, { event: "left", id: ws.id, name: ws.name }, ws.id);
  });
});

/**
 * Find the display name of the OTHER person in a room (the partner).
 * @param {object} room
 * @param {string} selfId - the id to exclude
 * @returns {string|null}
 */
function partnerNameOf(room, selfId) {
  for (const [id, client] of room.clients) {
    if (id !== selfId) return client.ws.name || "Guest";
  }
  return null;
}

/**
 * Route one parsed message to the right action based on msg.type.
 * @param {import('ws').WebSocket} ws - the sender's socket
 * @param {object} msg - parsed JSON, must have a `type`
 */
function handle(ws, msg) {
  switch (msg.type) {
    // Clock ping: echo the client's t0 with our time so it can estimate offset.
    case MSG.TIME:
      send(ws, MSG.TIME, { t0: msg.t0, ts: Date.now() });
      break;

    // "Make a new room, I'm the host."
    case MSG.CREATE: {
      ws.name = msg.name || "Guest";
      ws.uid = msg.uid || ws.id; // stable per-browser id (survives refresh)
      const room = createRoom(ws);
      if (!room) {
        send(ws, MSG.ERROR, { reason: "server_full" });
        return;
      }
      ws.roomCode = room.code;
      send(ws, MSG.ROOM, { room: room.code, role: "host", partnerHere: false });
      break;
    }

    // "Join this room by code."
    case MSG.JOIN: {
      const room = getRoom(msg.room);
      if (!room) {
        send(ws, MSG.ERROR, { reason: "no_such_room" });
        return;
      }
      ws.name = msg.name || "Guest";
      ws.uid = msg.uid || ws.id; // stable per-browser id
      joinRoom(room, ws.id, ws);
      dropStaleUid(room, ws.uid, ws.id); // remove our own leftover socket (refresh)
      ws.roomCode = room.code;
      // Reclaim host if this browser is the room's host (by stable uid).
      const role = room.hostUid === ws.uid ? "host" : "follower";
      // Hand the joiner the current playback state AND tell them the partner is
      // already here (the fix: the joiner previously never learned this).
      send(ws, MSG.ROOM, {
        room: room.code,
        role,
        hostState: room.state,
        partnerHere: room.clients.size > 1,
        partnerName: partnerNameOf(room, ws.id),
      });
      broadcast(room, MSG.PRESENCE, { event: "joined", id: ws.id, name: ws.name }, ws.id);
      break;
    }

    // "Remove me from the room" (explicit Leave — socket stays open for reuse).
    case MSG.LEAVE: {
      const room = leaveClient(ws.roomCode, ws.id);
      if (room) broadcast(room, MSG.PRESENCE, { event: "left", id: ws.id, name: ws.name }, ws.id);
      ws.roomCode = null;
      break;
    }

    // Playback command or tick: remember it, then relay to the partner.
    // sentAt is relay-clock time (clients sync to us via MSG.TIME), so the
    // receiver can add the transit time. We MUTATE fields so videoId is kept.
    case MSG.CONTROL: {
      const room = getRoom(ws.roomCode);
      if (!room) return;
      if (typeof msg.mediaTime === "number") {
        room.state.action = msg.action;
        room.state.mediaTime = msg.mediaTime;
        room.state.paused = typeof msg.paused === "boolean" ? msg.paused : msg.action === "pause";
        room.state.rate = msg.rate || 1;
        room.state.sentAt = msg.sentAt ?? null;
        room.state.updatedAt = Date.now();
      }
      broadcast(
        room,
        MSG.CONTROL,
        {
          action: msg.action,
          mediaTime: msg.mediaTime,
          sentAt: msg.sentAt,
          paused: msg.paused,
          rate: msg.rate,
          seq: msg.seq,
          from: ws.id,
        },
        ws.id,
      );
      break;
    }

    // Video switch: remember which video the room is on, relay to the partner.
    case MSG.VIDEO: {
      const room = getRoom(ws.roomCode);
      if (!room) return;
      room.state.videoId = msg.videoId;
      room.state.updatedAt = Date.now();
      broadcast(room, MSG.VIDEO, { videoId: msg.videoId, from: ws.id }, ws.id);
      break;
    }

    // Buffering signal: relay to the partner so both sides wait together.
    // state === "start" -> I stalled; "end" -> I recovered.
    case MSG.BUFFER: {
      const room = getRoom(ws.roomCode);
      if (!room) return;
      broadcast(room, MSG.BUFFER, { state: msg.state, from: ws.id }, ws.id);
      break;
    }

    // WebRTC signaling (Track B): relay SDP/ICE verbatim to the other peer.
    // The server is a dumb pipe here — it never inspects the payload.
    case MSG.SIGNAL: {
      const room = getRoom(ws.roomCode);
      if (!room) return;
      broadcast(room, MSG.SIGNAL, { data: msg.data, from: ws.id }, ws.id);
      break;
    }

    // Chat / reaction: relay to the partner.
    case MSG.CHAT: {
      const room = getRoom(ws.roomCode);
      if (!room) return;
      broadcast(
        room,
        MSG.CHAT,
        { text: msg.text, from: ws.id, sentAt: Date.now() },
        ws.id,
      );
      break;
    }
  }
}

/**
 * Heartbeat: every 30s, terminate any socket that didn't answer our last ping,
 * then ping everyone again. Catches half-open connections (closed laptop, dead
 * wifi) that never fire a clean "close" event.
 */
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

// Bind to 0.0.0.0 so cloud hosts (Render/Fly) can route traffic to us.
server.listen(PORT, "0.0.0.0", () => console.log(`🐾 Pawse relay listening on :${PORT}`));
