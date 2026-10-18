// Sync check for the Chrome extension's code, offline.
//
// Runs the real extension/background.js in a Node VM (chrome.* stubbed, real
// WebSocket to a local relay) and injects the real config.js, sync-core.js and
// content/content.js into a stand-in youtube.com watch page with a <video>.
// One background + one page per side, so it exercises everything except
// Chrome's own extension plumbing. Samples both players against wall-clock
// truth like measure-sync.mjs.
//
// Usage: node scripts/measure-extension.mjs [--delay 150] [--jitter 30] [--skew 0.005] [--secs 20]
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { WebSocket } = createRequire(join(root, "server/package.json"))("ws");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const delay = Number(arg("delay", 0));
const jitter = Number(arg("jitter", 0));
const skew = Number(arg("skew", 0));
const secs = Number(arg("secs", 20));
const port = 19600 + Math.floor(Math.random() * 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (f) => readFileSync(join(root, "extension", f), "utf8");

const relay = spawn(process.execPath, [join(root, "server/src/index.js")], {
  env: { ...process.env, PORT: String(port), RELAY_DELAY_MS: String(delay), RELAY_JITTER_MS: String(jitter) },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((res) => relay.stdout.on("data", (d) => String(d).includes("listening") && res()));

const movieDir = join(tmpdir(), "pawse-measure");
const movie = join(movieDir, "movie.webm");
if (!existsSync(movie)) {
  mkdirSync(movieDir, { recursive: true });
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=duration=90:size=640x360:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=90", "-c:v", "libvpx-vp9", "-b:v", "400k", "-g", "30",
    "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libopus", movie]);
}
const movieBytes = readFileSync(movie);
const html = `<!doctype html><title>stand-in</title><div id="movie_player"><video src="/movie.webm" muted></video></div>`;
const config = src("config.js").replace(/wss:\/\/pawse-relay\.onrender\.com/, `ws://127.0.0.1:${port}`);

const skewScript = (k) => {
  const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "playbackRate");
  Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
    configurable: true,
    get() { return d.get.call(this) / (1 - k); },
    set(v) { d.set.call(this, v * (1 - k)); },
  });
  document.addEventListener("loadedmetadata", (e) => d.set.call(e.target, 1 - k), true);
};

// The stand-in for chrome.* inside a page: messages go to/from our Node background.
const pageChrome = () => {
  window.__listeners = [];
  window.chrome = {
    runtime: {
      sendMessage: (m) => window.__toBg(m),
      onMessage: { addListener: (f) => window.__listeners.push(f) },
    },
  };
};

async function side(browser, withSkew) {
  const ctx = await browser.newContext();
  await ctx.route("https://www.youtube.com/**", (route) => {
    if (!route.request().url().includes("movie.webm"))
      return route.fulfill({ body: html, contentType: "text/html" });
    // byte ranges, or the video is not seekable
    const m = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || "");
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Number(m[2]) : movieBytes.length - 1;
    return route.fulfill({
      status: m ? 206 : 200,
      body: movieBytes.subarray(start, end + 1),
      headers: {
        "content-type": "video/webm",
        "accept-ranges": "bytes",
        ...(m && { "content-range": `bytes ${start}-${end}/${movieBytes.length}` }),
      },
    });
  });
  if (withSkew && skew) await ctx.addInitScript(skewScript, skew);
  await ctx.addInitScript(pageChrome);
  const page = await ctx.newPage();

  let bgListener = null;
  const store = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, Date,
    chrome: {
      runtime: {
        onMessage: { addListener: (f) => (bgListener = f) },
        sendMessage: () => Promise.resolve(), // popup is closed
      },
      tabs: {
        sendMessage: (_id, msg) =>
          page.evaluate((m) => window.__listeners.forEach((f) => f(m)), msg).catch(() => {}),
      },
      storage: {
        local: {
          get: async () => ({ ...store }),
          set: async (o) => Object.assign(store, o),
          remove: async (keys) => keys.forEach((k) => delete store[k]),
        },
      },
    },
  };
  sandbox.globalThis = sandbox;
  const bg = vm.createContext(sandbox);
  sandbox.importScripts = (...files) =>
    files.forEach((f) => vm.runInContext(f === "config.js" ? config : src(f), bg, { filename: f }));
  vm.runInContext(src("background.js"), bg, { filename: "background.js" });

  await page.exposeFunction("__toBg", (m) =>
    new Promise((res) => bgListener(m, { tab: { id: 1 } }, res) || res()));
  await page.goto("https://www.youtube.com/watch?v=pawsetest01");
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 3);
  for (const f of ["config.js", "sync-core.js", "content/content.js"])
    await page.addScriptTag({ content: f === "config.js" ? config : src(f) });
  return { page, bg, run: (code) => vm.runInContext(code, bg) };
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const host = await side(browser, false);
const guest = await side(browser, true);
await host.run(`state.syncTabId = 1; state.myName = "Host"; connect().then(() => sendToServer("create", { name: "Host" }))`);
let code = null;
while (!code) {
  await sleep(200);
  code = host.run("state.room");
}
await guest.run(`state.syncTabId = 1; state.myName = "Guest"; connect().then(() => sendToServer("join", { room: "${code}", name: "Guest" }))`);
while (!host.run("state.partnerHere")) await sleep(200);
await sleep(1500); // clock samples

const read = () => {
  const v = document.querySelector("video");
  return { m: v.currentTime, w: performance.timeOrigin + performance.now(), paused: v.paused };
};
const samples = [];
let phase = "";
let since = 0;
const sampleFor = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const [a, b] = await Promise.all([host.page.evaluate(read), guest.page.evaluate(read)]);
    const hostAtB = a.m + (a.paused ? 0 : (b.w - a.w) / 1000);
    samples.push({ phase, t: (Date.now() - since) / 1000, gap: b.m - hostAtB });
    await sleep(250);
  }
};

phase = "play";
since = Date.now();
await host.page.evaluate(() => { const v = document.querySelector("video"); v.currentTime = 5; v.play(); });
await sampleFor(secs * 1000);
phase = "seek";
since = Date.now();
await host.page.evaluate(() => { document.querySelector("video").currentTime = 50; });
await sampleFor(Math.min(secs, 15) * 1000);
const estimate = guest.run("state.sync && state.sync.error");

await browser.close();
relay.kill();

const stats = (xs) => {
  const s = xs.map((x) => Math.abs(x) * 1000).sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { median: at(0.5), p95: at(0.95), max: s.at(-1) };
};
console.log(`extension delay=${delay}ms jitter=${jitter}ms skew=${skew * 100}%`);
for (const ph of ["play", "seek"]) {
  const st = stats(samples.filter((s) => s.phase === ph && s.t >= 2).map((s) => s.gap));
  console.log(`  ${ph.padEnd(5)} median ${st.median.toFixed(0)} ms  p95 ${st.p95.toFixed(0)} ms  max ${st.max.toFixed(0)} ms`);
}
console.log(`  guest's own estimate at the end: ${estimate == null ? "-" : Math.round(estimate * 1000) + " ms"}`);
process.exit(0);
