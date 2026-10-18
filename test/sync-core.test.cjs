const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../extension/sync-core.js");

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("clockSample: symmetric legs give the exact offset", () => {
  // client clock is 500 ms behind the relay, 80 ms each way
  const t0 = 1000;
  const ts = t0 + 500 + 80;
  const t1 = t0 + 160;
  assert.deepEqual(S.clockSample(t0, ts, t1), { rtt: 160, offset: 500 });
});

test("bestSample: lowest RTT wins, so a slow outlier does not bias the offset", () => {
  const samples = [
    { rtt: 300, offset: 650 },
    { rtt: 60, offset: 502 },
    { rtt: 120, offset: 470 },
  ];
  assert.deepEqual(S.bestSample(samples), { rtt: 60, offset: 502 });
  assert.equal(S.bestSample([]), null);
});

test("addSample keeps only the newest N", () => {
  let s = [];
  for (let i = 0; i < 12; i++) s = S.addSample(s, { rtt: i, offset: i }, 8);
  assert.equal(s.length, 8);
  assert.equal(s[0].rtt, 4);
});

test("expectedTime extrapolates a playing position and freezes a paused one", () => {
  near(S.expectedTime({ mediaTime: 10, at: 1000 }, 1250), 10.25);
  near(S.expectedTime({ mediaTime: 10, at: 1000, rate: 1.5 }, 2000), 11.5);
  assert.equal(S.expectedTime({ mediaTime: 10, at: 1000, paused: true }, 5000), 10);
  // a report from the "future" (clock noise) never moves time backwards
  assert.equal(S.expectedTime({ mediaTime: 10, at: 2000 }, 1990), 10);
});

test("correction: inside the deadband does nothing", () => {
  const c = S.correction(10.015, 10);
  assert.equal(c.kind, "ok");
  assert.equal(c.rate, 1);
});

test("correction: small gaps nudge the rate toward the partner", () => {
  const ahead = S.correction(10.1, 10);
  assert.equal(ahead.kind, "nudge");
  near(ahead.rate, 1 - 0.05); // 0.1 s over 2 s
  const behind = S.correction(9.9, 10);
  near(behind.rate, 1 + 0.05);
});

test("correction: nudges are capped", () => {
  const c = S.correction(10.35, 10);
  assert.equal(c.kind, "nudge");
  near(c.rate, 1 - S.TUNING.maxNudge);
});

test("correction: large gaps seek to the expected time", () => {
  const c = S.correction(12, 10);
  assert.equal(c.kind, "seek");
  assert.equal(c.to, 10);
});

test("plan skips states where correcting would fight the user or the decoder", () => {
  const ref = { mediaTime: 10, at: 1000 };
  const playing = { currentTime: 10.2, paused: false, seeking: false, readyState: 4 };
  assert.equal(S.plan({ ...playing, paused: true }, ref, 1000), null);
  assert.equal(S.plan({ ...playing, seeking: true }, ref, 1000), null);
  assert.equal(S.plan({ ...playing, readyState: 2 }, ref, 1000), null);
  assert.equal(S.plan(playing, { ...ref, paused: true }, 1000), null);
  assert.equal(S.plan(playing, ref, 1000 + S.TUNING.staleAfter + 1), null);
  assert.equal(S.plan(playing, ref, 1000).kind, "nudge");
});

test("createClock converts between local and relay time", () => {
  let t = 0;
  const clock = S.createClock(() => t);
  assert.equal(clock.offset, 0);
  assert.equal(clock.rtt, null);
  // two pings; the second has the lower RTT and should win
  t = 100;
  const a = clock.ping();
  t = 400;
  clock.pong({ ...a, ts: 5000 });
  t = 1000;
  const b = clock.ping();
  t = 1040;
  clock.pong({ ...b, ts: 5520 });
  assert.equal(clock.rtt, 40);
  assert.equal(clock.offset, 5520 + 20 - 1040);
  assert.equal(clock.toLocal(clock.toRelay(123)), 123);
});
