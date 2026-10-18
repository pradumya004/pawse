// Measures how far apart two Pawse players are, against wall-clock truth.
//
// Starts a local relay (optionally with injected latency) and the player dev
// server, opens host + partner in headless Chromium, streams a test movie,
// then samples both players' positions every 250 ms through play, seek, pause.
// Each sample pairs currentTime with a high-res wall time in the same page, so
// the read latency of the test harness does not leak into the result.
//
// Usage: node scripts/measure-sync.mjs [--delay 150] [--jitter 30] [--skew 0.005] [--sync off] [--secs 20]
//   --delay   ms added by the relay in EACH direction (partner to partner = 2x)
//   --jitter  random extra ms per message (order kept)
//   --skew    partner's video clock runs this much slow (0.005 = 0.5%)
//   --sync    off = old behavior: plain play/pause/seek relay, no clock sync
// Needs ffmpeg on PATH (makes the test movie once) and `npm install` at the repo root.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const delay = Number(arg("delay", 0));
const jitter = Number(arg("jitter", 0));
const skew = Number(arg("skew", 0));
const syncOn = arg("sync", "on") !== "off";
const secs = Number(arg("secs", 20));

const port = 19000 + Math.floor(Math.random() * 500);
const webPort = port + 500;
const children = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start(cmd, args, opts, ready) {
  const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  return new Promise((res, rej) => {
    const onData = (d) => String(d).includes(ready) && res(child);
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) => rej(new Error(`${args[0]} exited ${code}`)));
  });
}
const cleanup = () => children.forEach((c) => c.kill());
process.on("exit", cleanup);

function movie() {
  const dir = join(tmpdir(), "pawse-measure");
  const file = join(dir, "movie.webm");
  if (existsSync(file)) return file;
  mkdirSync(dir, { recursive: true });
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=duration=90:size=640x360:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=90",
    "-c:v", "libvpx-vp9", "-b:v", "400k", "-g", "30", "-deadline", "realtime", "-cpu-used", "8",
    "-c:a", "libopus", file,
  ]);
  return file;
}

// Partner side: make the video clock run `skew` slow, invisibly to the app.
const skewScript = (k) => {
  const proto = HTMLMediaElement.prototype;
  const d = Object.getOwnPropertyDescriptor(proto, "playbackRate");
  Object.defineProperty(proto, "playbackRate", {
    configurable: true,
    get() { return d.get.call(this) / (1 - k); },
    set(v) { d.set.call(this, v * (1 - k)); },
  });
  document.addEventListener("loadedmetadata", (e) => d.set.call(e.target, 1 - k), true);
};

const read = () => {
  const v = document.querySelector(".videowrap video");
  return {
    m: v.currentTime,
    w: performance.timeOrigin + performance.now(),
    paused: v.paused,
    badge: document.querySelector(".syncbadge")?.innerText ?? null,
  };
};

async function main() {
  const file = movie();
  await start(process.execPath, [join(root, "server/src/index.js")], {
    env: { ...process.env, PORT: String(port), RELAY_DELAY_MS: String(delay), RELAY_JITTER_MS: String(jitter) },
  }, "listening");
  await start(process.execPath, [join(root, "player/node_modules/vite/bin/vite.js"), "--port", String(webPort), "--strictPort"], {
    cwd: join(root, "player"),
    env: { ...process.env, VITE_RELAY_WS: `ws://127.0.0.1:${port}` },
  }, "Local");

  const base = `http://localhost:${webPort}/`;
  const q = syncOn ? "" : "sync=off";
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const host = await (await browser.newContext()).newPage();
  const ctxB = await browser.newContext();
  if (skew) await ctxB.addInitScript(skewScript, skew);
  const guest = await ctxB.newPage();

  await host.goto(base + (q ? `?${q}` : ""));
  await host.getByText("CONNECTED").waitFor({ timeout: 30000 });
  await host.getByPlaceholder("your name, cutie").fill("Host");
  await host.getByRole("button", { name: /CREATE A ROOM/ }).click();
  await host.locator(".roomcode button").first().click();
  const code = (await host.locator(".roomcode .code").innerText()).trim();
  await host.locator("#file").setInputFiles(file);

  await guest.goto(`${base}?room=${code}${q ? `&${q}` : ""}`);
  await guest.getByText("CONNECTED").waitFor({ timeout: 30000 });
  await guest.getByPlaceholder("your name, cutie").fill("Guest2");
  await guest.getByRole("button", { name: /JOIN ROOM/ }).click();
  await guest.waitForFunction(() => {
    const v = document.querySelector(".videowrap video");
    return v && v.readyState >= 3 && v.duration > 0;
  }, null, { timeout: 120000 });
  await sleep(1500);

  const samples = [];
  let phase = "";
  let since = 0;
  const sampleFor = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const [a, b] = await Promise.all([host.evaluate(read), guest.evaluate(read)]);
      const hostAtB = a.m + (a.paused ? 0 : (b.w - a.w) / 1000);
      samples.push({ phase, t: (Date.now() - since) / 1000, gap: b.m - hostAtB, badge: b.badge, paused: b.paused });
      await sleep(250);
    }
  };
  const hostDo = (fn, x) => host.locator(".videowrap video").evaluate(fn, x);

  phase = "play";
  since = Date.now();
  await hostDo((v) => { v.currentTime = 5; v.play(); });
  await sampleFor(secs * 1000);

  phase = "seek";
  since = Date.now();
  await hostDo((v) => { v.currentTime = 50; });
  await sampleFor(Math.min(secs, 15) * 1000);

  phase = "pause";
  since = Date.now();
  await hostDo((v) => v.pause());
  await sampleFor(3000);

  await browser.close();
  cleanup();
  return samples;
}

const stats = (xs) => {
  const s = xs.map((x) => Math.abs(x) * 1000).sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, median: at(0.5), p95: at(0.95), max: s[s.length - 1] };
};

const samples = await main();
const settle = 2; // s after each command before a sample counts as steady state
const label = `sync=${syncOn ? "on" : "off"} delay=${delay}ms jitter=${jitter}ms skew=${skew * 100}%`;
console.log(label);
const summary = {};
for (const phase of ["play", "seek", "pause"]) {
  const steady = samples.filter((s) => s.phase === phase && s.t >= settle);
  const st = stats(steady.map((s) => s.gap));
  const last = steady.filter((s) => s.t >= { play: secs, seek: Math.min(secs, 15), pause: 3 }[phase] - 3);
  summary[phase] = { ...st, endMedian: stats(last.map((s) => s.gap)).median, badge: steady.at(-1)?.badge };
  const f = (x) => (x == null ? "-" : x.toFixed(0));
  console.log(`  ${phase.padEnd(6)} median ${f(st.median)} ms  p95 ${f(st.p95)} ms  max ${f(st.max)} ms  last-3s median ${f(summary[phase].endMedian)} ms  badge "${summary[phase].badge}"`);
}
if (process.env.MEASURE_JSON) console.log(JSON.stringify({ label, summary, samples }));
process.exit(0);
