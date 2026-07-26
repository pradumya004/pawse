/**
 * @file test-client.js
 * A command-line Pawse client for testing the relay without a browser.
 *
 * Usage (run in two separate terminals):
 *   node scripts/test-client.js create          # prints a room code
 *   node scripts/test-client.js join <CODE>      # joins that room
 *
 * The creator auto-sends a fake "play" shortly after someone joins, so you can
 * watch the control event arrive in the joiner's terminal.
 */

import { WebSocket } from "ws";

const URL = process.env.URL || "ws://localhost:8080";
const [, , cmd, arg] = process.argv; // cmd = "create" | "join", arg = room code

const ws = new WebSocket(URL);

/**
 * Send a typed JSON message to the server.
 * @param {string} type - a message type string (matches MSG.* on the server)
 * @param {object} [payload] - extra fields merged alongside `type`
 */
function send(type, payload = {}) {
  ws.send(JSON.stringify({ type, ...payload }));
}

// On connect, issue our command.
ws.on("open", () => {
  if (cmd === "create") send("create");
  else if (cmd === "join") send("join", { room: arg });
  else {
    console.log("Usage: node scripts/test-client.js create | join <CODE>");
    process.exit(1);
  }
});

// Log everything the server sends back, and react to a couple of message types.
ws.on("message", (raw) => {
  const msg = JSON.parse(raw);
  console.log("<-", msg);

  // When WE created the room, show how to join.
  if (msg.type === "room" && cmd === "create") {
    console.log(
      `\n  Room ready. In another terminal run:\n    node scripts/test-client.js join ${msg.room}\n`,
    );
  }

  // When a partner joins our room, fire a fake play to test the relay.
  if (msg.type === "presence" && msg.event === "joined" && cmd === "create") {
    setTimeout(() => {
      console.log("-> sending fake play @ mediaTime 42");
      send("control", {
        action: "play",
        mediaTime: 42,
        sentAt: Date.now(),
        seq: 1,
      });
    }, 1000);
  }
});

ws.on("close", () => console.log("connection closed"));
ws.on("error", (e) => console.error("error:", e.message));
