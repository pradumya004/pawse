/**
 * @file content/content.js
 * Pawse content script — injected into the YouTube page.
 *
 * This is the ONLY world allowed to touch the page's <video>. It does three jobs:
 *   1. Report LOCAL actions (you press play/pause/seek) up to the background,
 *      which relays them to your partner.
 *   2. Apply REMOTE actions (your partner's play/pause/seek) to your video.
 *   3. BUFFER-AWARE SYNC: if either side stalls (buffering), the other waits and
 *      both resume together — so you never drift apart because one connection
 *      hiccuped. This is what makes "watch together" actually feel together.
 *
 * The trap this file must avoid: when we apply a remote command (e.g. video.pause()),
 * the browser fires a local "pause" event — which would get reported back to the
 * partner, who applies it, which fires their event... an infinite echo. The
 * `suppress` flag is our echo suppression: while applying a remote command we
 * ignore the local events it causes.
 *
 * DRIFT CORRECTION: every second while playing we report our position; the
 * follower compares the partner's report with its own clock and closes small
 * gaps with playbackRate nudges, big ones with a seek (sync-core.js). Timestamps
 * arrive here already converted to local Date.now() time by the background.
 */

let video = null; // the <video> element we're syncing
let seq = 0; // increments on every LOCAL action we send (ordering)
let suppress = false; // true while applying a remote command (don't rebroadcast)
let contextDead = false; // true once the extension was reloaded (orphaned tab)
let quietSeek = false; // next 'seeked' is our own correction, don't report it
let baseRate = 1; // agreed playback speed, before drift nudges
let nudging = false; // is playbackRate currently nudged?

/**
 * Send a message to the background, surviving the "Extension context
 * invalidated" case. That happens when the extension is reloaded while this
 * tab stays open: the old content script is orphaned and chrome.runtime throws
 * SYNCHRONOUSLY (so a .catch() alone can't stop it). We swallow it and mark the
 * context dead — the fix is a page refresh, which re-injects a fresh script.
 * @param {object} message - the { cmd, ... } payload for the background
 */
function safeSend(message) {
  if (contextDead) return;
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch (e) {
    contextDead = true; // extension reloaded — this tab needs a refresh
    console.warn("[Pawse] extension reloaded — refresh this tab to reconnect.");
  }
}

// ---- buffering state ----
let selfBuffering = false; // are WE currently stalled?
let partnerBuffering = false; // is the PARTNER currently stalled?
let pausedForBuffer = false; // did WE auto-pause to wait for a buffering side?
let userWantsToPlay = false; // did the user intend to be playing? (so we only
//                              auto-resume when playback was actually wanted)

// ---- video-follow state ----
let currentVideoId = null; // the YouTube id we're currently on (for change detection)

/**
 * Read the current YouTube video id from the page URL (?v=...).
 * @returns {string|null}
 */
function getVideoId() {
  return new URLSearchParams(location.search).get("v");
}

/**
 * Build a watch URL for a given video id.
 * @param {string} id
 * @returns {string}
 */
function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Navigate this tab to a video (used to FOLLOW the partner). A full navigation
 * reloads the page; on reload the fresh content script asks the background for
 * the current sync state (REQUEST_SYNC) and snaps to the right time/paused.
 * @param {string} id - the video id to go to
 */
function navigateTo(id) {
  if (!id || id === getVideoId()) return; // already there
  location.href = watchUrl(id);
}

/**
 * If the page's video changed (user clicked a new video), tell the room so the
 * partner follows. Skips when there's no id (e.g. YouTube home).
 */
function reportVideoIfChanged() {
  const id = getVideoId();
  if (id && id !== currentVideoId) {
    currentVideoId = id;
    safeSend({ cmd: "LOCAL_VIDEO", videoId: id });
  }
}

/**
 * Find the page's <video> element. YouTube is a single-page app: it loads the
 * video late and swaps the element on navigation, so we keep re-checking.
 * @returns {HTMLVideoElement|null}
 */
function findVideo() {
  const v = document.querySelector("video");
  if (v && v !== video) {
    video = v;
    attachListeners(v);
  }
  return v;
}

/**
 * Attach all playback + buffering listeners to a video element.
 * @param {HTMLVideoElement} v
 */
function attachListeners(v) {
  // User intent + control events.
  v.addEventListener("play", () => {
    if (!suppress) userWantsToPlay = true;
    reportLocal("play");
  });
  v.addEventListener("pause", () => {
    // A pause caused by our own buffer-wait is not the user changing intent.
    if (!suppress && !pausedForBuffer) userWantsToPlay = false;
    reportLocal("pause");
  });
  v.addEventListener("seeked", () => {
    if (quietSeek) quietSeek = false;
    else reportLocal("seek");
  });

  // Buffering signals — the fix for "one keeps running while the other stalls".
  // `waiting` = stalled and needs to buffer; `playing` = data arrived, resumed.
  v.addEventListener("waiting", onSelfBufferStart);
  v.addEventListener("playing", onSelfBufferEnd);
  // 'playing' never fires if we were paused (e.g. waiting for a buffering
  // partner) while our own buffer refilled; without this both sides wait forever.
  v.addEventListener("canplay", onSelfBufferEnd);
}

/**
 * Report a local action to the background — unless we're mid-applying a remote
 * command (echo suppression) or have no video yet.
 * @param {string} action - "play" | "pause" | "seek"
 */
function reportLocal(action) {
  if (suppress || !video) return;
  safeSend({
    cmd: "LOCAL_CONTROL",
    action,
    mediaTime: video.currentTime,
    paused: video.paused,
    rate: nudging ? baseRate : video.playbackRate,
    at: Date.now(),
    seq: ++seq,
  });
}

/** YouTube marks the player while an ad plays; its <video> is the ad then. */
function isAd() {
  return !!document.querySelector(".ad-showing");
}

function seekQuietly(t) {
  quietSeek = true;
  video.currentTime = t;
  setTimeout(() => (quietSeek = false), 2000); // in case 'seeked' never fires
}

/**
 * Where the partner is now, from a report stamped at local time `at`.
 * Old relays/clients send no timestamp: fall back to the raw position.
 */
function targetOf(m) {
  if (typeof m.mediaTime !== "number") return null;
  if (typeof m.at !== "number") return m.mediaTime;
  return PawseSync.expectedTime(
    { mediaTime: m.mediaTime, at: m.at, paused: m.paused, rate: m.rate },
    Date.now(),
  );
}

/** Partner's once-a-second position: measure the gap; the follower closes it. */
function onTick(m) {
  if (!findVideo() || isAd() || typeof m.at !== "number") return;
  const ref = { mediaTime: m.mediaTime, at: m.at, rate: m.rate || 1 };
  const p = PawseSync.plan(video, ref, Date.now());
  if (!p) return;
  if (m.follower) {
    baseRate = ref.rate;
    if (p.kind === "seek") seekQuietly(p.to);
    const rate = ref.rate * p.rate;
    if (Math.abs(video.playbackRate - rate) > 1e-3) video.playbackRate = rate;
    nudging = p.kind === "nudge";
  }
  safeSend({ cmd: "SYNC_STAT", error: Math.abs(p.error), correcting: !!m.follower && p.kind !== "ok" });
}

// Report position every second while playing (drives the partner's correction).
setInterval(() => {
  if (!video || suppress || isAd()) return;
  if (video.paused || video.seeking || video.readyState < 3) return;
  reportLocal("tick");
}, 1000);

/**
 * Our video just stalled. Tell the partner so they pause and wait for us.
 */
function onSelfBufferStart() {
  if (selfBuffering) return;
  selfBuffering = true;
  safeSend({ cmd: "LOCAL_BUFFER", state: "start" });
}

/**
 * Our video just recovered. Tell the partner; then resume both if nobody's
 * still buffering and the user actually wants to be playing.
 */
function onSelfBufferEnd() {
  if (!selfBuffering) return;
  selfBuffering = false;
  safeSend({ cmd: "LOCAL_BUFFER", state: "end" });
  maybeResume();
}

/**
 * Apply a remote command to our video, suppressing the local events it triggers
 * so they aren't re-reported to the partner.
 * @param {string} action - "play" | "pause" | "seek"
 * @param {object} m - { mediaTime, at?, paused?, rate? } partner's report
 */
function applyRemote(action, m) {
  if (!findVideo()) return;
  suppress = true;

  // Only seek if meaningfully out of position. With a timestamp we know where
  // the partner is now, so the tolerance can be tight.
  const target = targetOf(m);
  const tolerance = typeof m.at !== "number" ? 0.5 : action === "pause" ? PawseSync.TUNING.deadband : 0.1;
  if (target != null && Math.abs(video.currentTime - target) > tolerance) {
    seekQuietly(target);
  }
  if (action === "play") {
    userWantsToPlay = true;
    video.play().catch(() => {});
  } else if (action === "pause") {
    userWantsToPlay = false;
    video.pause();
    if (nudging) video.playbackRate = baseRate;
    nudging = false;
  }

  // Release suppression after the browser has fired the resulting events.
  setTimeout(() => {
    suppress = false;
  }, 150);
}

/**
 * Pause our video to wait for a buffering partner (marked so we know to auto-
 * resume it later, and so the pause isn't treated as the user stopping).
 */
function pauseForBuffer() {
  if (!video || video.paused) return;
  pausedForBuffer = true;
  suppress = true;
  video.pause();
  setTimeout(() => {
    suppress = false;
  }, 150);
}

/**
 * Resume playback IF: neither side is still buffering, the user wanted to be
 * playing, and we had paused only to wait. Keeps both sides moving together.
 */
function maybeResume() {
  if (selfBuffering || partnerBuffering) return; // someone's still loading
  if (!pausedForBuffer || !userWantsToPlay) return;
  pausedForBuffer = false;
  suppress = true;
  video.play().catch(() => {});
  setTimeout(() => {
    suppress = false;
  }, 150);
}

/**
 * Messages from the background: remote commands, buffer signals, sync state,
 * video-follow, and video-report requests.
 */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.cmd === "REMOTE_CONTROL") {
    applyRemote(msg.action, msg);
  } else if (msg.cmd === "REMOTE_TICK") {
    onTick(msg);
  } else if (msg.cmd === "REMOTE_VIDEO") {
    // Partner switched videos -> follow them (navigates + reloads this tab).
    navigateTo(msg.videoId);
  } else if (msg.cmd === "REMOTE_BUFFER") {
    // Partner stalled -> we pause and wait. Partner recovered -> try to resume.
    if (msg.state === "start") {
      partnerBuffering = true;
      pauseForBuffer();
    } else {
      partnerBuffering = false;
      maybeResume();
    }
  } else if (msg.cmd === "SYNC_STATE") {
    // "Where should I be?" — sent on join and on every fresh page load.
    const m = msg.media || {};
    // 1. Wrong video? Go there first (reload; we'll re-sync time on the way back).
    if (m.videoId && m.videoId !== getVideoId()) {
      navigateTo(m.videoId);
      return;
    }
    // 2. Right video -> align time + play/pause.
    currentVideoId = getVideoId();
    if (typeof m.mediaTime === "number") {
      applyRemote(m.paused ? "pause" : "play", m);
    }
  } else if (msg.cmd === "REPORT_VIDEO") {
    // Background (just created/joined a room) asks what video we're on.
    const id = getVideoId();
    if (id) {
      currentVideoId = id;
      safeSend({ cmd: "LOCAL_VIDEO", videoId: id });
    }
  }
});

/**
 * If this page was opened from a Pawse share link (…#pawse=CODE), auto-join
 * that room. Runs once on load; the hash is dropped on later navigations.
 */
function maybeAutoJoin() {
  const m = location.hash.match(/pawse=([A-Za-z0-9]+)/);
  if (m) safeSend({ cmd: "AUTOJOIN", room: m[1].toUpperCase() });
}

// Poll: keep the <video> reference fresh AND detect user-driven video changes.
setInterval(() => {
  findVideo();
  reportVideoIfChanged();
}, 1000);

// On (re)load, note our video, auto-join if this is a share link, and ask the
// background where we should be.
currentVideoId = getVideoId();
findVideo();
maybeAutoJoin();
safeSend({ cmd: "REQUEST_SYNC" });
