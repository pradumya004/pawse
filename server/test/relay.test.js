import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const PORT = 18000 + Math.floor(Math.random() * 1000);
const entry = fileURLToPath(new URL("../src/index.js", import.meta.url));
let relay;

before(async () => {
  relay = spawn(process.execPath, [entry], { env: { ...process.env, PORT: String(PORT) } });
  await new Promise((resolve, reject) => {
    relay.stdout.on("data", (d) => String(d).includes("listening") && resolve());
    relay.once("exit", (code) => reject(new Error(`relay exited ${code}`)));
  });
});
after(() => relay.kill());

/** Connected client with a queue of parsed messages. */
async function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const inbox = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  await once(ws, "open");
  return {
    ws,
    inbox,
    send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
    next(type) {
      const i = inbox.findIndex((m) => m.type === type);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve) => waiters.push({ type, resolve }));
    },
  };
}

async function pair() {
  const host = await client();
  host.send("create", { name: "A", uid: "ua" });
  const { room } = await host.next("room");
  const guest = await client();
  guest.send("join", { room, name: "B", uid: "ub" });
  await guest.next("room");
  await host.next("presence");
  return { host, guest, room };
}

test("time ping echoes t0 with the relay clock", async () => {
  const c = await client();
  const t0 = Date.now();
  c.send("time", { t0 });
  const reply = await c.next("time");
  assert.equal(reply.t0, t0);
  assert.ok(Math.abs(reply.ts - Date.now()) < 1000);
  c.ws.close();
});

test("control carries timing fields to the partner and not back to the sender", async () => {
  const { host, guest } = await pair();
  host.send("control", { action: "tick", mediaTime: 12.5, sentAt: 1000, paused: false, rate: 1 });
  const msg = await guest.next("control");
  assert.deepEqual(
    { action: msg.action, mediaTime: msg.mediaTime, sentAt: msg.sentAt, paused: msg.paused, rate: msg.rate },
    { action: "tick", mediaTime: 12.5, sentAt: 1000, paused: false, rate: 1 },
  );
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(host.inbox.filter((m) => m.type === "control").length, 0);
  host.ws.close();
  guest.ws.close();
});

test("a late joiner gets the last position with its timestamp", async () => {
  const { host, guest, room } = await pair();
  host.send("control", { action: "play", mediaTime: 30, sentAt: 5000, paused: false, rate: 1 });
  await guest.next("control");
  // a resync request has no position and must not wipe the stored state
  guest.send("control", { action: "resync" });
  await host.next("control");
  guest.ws.close();
  const late = await client();
  late.send("join", { room, name: "C", uid: "uc" });
  const { hostState } = await late.next("room");
  assert.equal(hostState.mediaTime, 30);
  assert.equal(hostState.sentAt, 5000);
  assert.equal(hostState.paused, false);
  host.ws.close();
  late.ws.close();
});
