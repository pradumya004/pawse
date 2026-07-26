/**
 * @file background.js
 * Pawse extension — background service worker (the "brain").
 *
 * Owns the single WebSocket to the relay and ferries messages between:
 *   - the popup          (UI: create/join/leave a room)
 *   - the content script (the page's <video>: local play/pause, apply remote)
 *   - the relay server   (play/pause/seek/video from the partner)
 *
 * RESILIENCE (Phase 2 robustness pass):
 *   - The room code is persisted to chrome.storage, so if Chrome kills this
 *     (MV3 workers are disposable) or the network blips, a restarted worker
 *     AUTO-REJOINS the same room instead of silently dropping the session.
 *   - ws.onclose triggers reconnect-with-backoff while we still hold a room.
 *   - A MEDIA CACHE {videoId, mediaTime, paused} answers "where should I be?"
 *     for any freshly-loaded tab (after navigating videos or refreshing).
 *
 * Internal messages (popup/content) use UPPERCASE `cmd`; server messages use
 * the lowercase `type` strings the relay expects (see server/src/protocol.js).
 */

// Load shared config into the service worker's global scope (sets PAWSE_CONFIG).
importScripts("config.js");

const RELAY_URL = PAWSE_CONFIG.RELAY_WS;

/** Live connection + session state. Rebuilt from storage if the worker restarts. */
const state = {
  ws: null,
  connected: false,
  clientId: null, // our id, assigned by the server's "hello"
  room: null, // current room code
  role: null, // "host" | "follower"
  syncTabId: null, // the YouTube tab whose <video> we're syncing
  partnerHere: false, // is the partner currently connected?
  reconnectDelay: 1000, // backoff (ms), grows on repeated failures, caps at 30s
  // The room's latest media state — the "where should I be?" answer.
  media: { videoId: null, mediaTime: 0, paused: true },
};

// ---- persistence (survive worker death) ----

/** Save the current room + tab so a restarted worker can auto-rejoin. */
function persist() {
  chrome.storage.local.set({ pawse_room: state.room, pawse_tab: state.syncTabId });
}

/** Forget the room (on explicit Leave), so we don't auto-rejoin next start. */
function clearPersist() {
  chrome.storage.local.remove(["pawse_room", "pawse_tab"]);
}

// ---- connection ----

/**
 * Open the WebSocket to the relay (reusing an existing open one) and wire its
 * event handlers, including reconnect-with-backoff on unexpected close.
 * @returns {Promise<void>} resolves once the socket is open
 */
function connect() {
  return new Promise((resolve, reject) => {
    if (state.ws && state.connected) return resolve();
    const ws = new WebSocket(RELAY_URL);
    state.ws = ws;
    ws.onopen = () => {
      state.connected = true;
      state.reconnectDelay = 1000; // reset backoff on success
      resolve();
    };
    ws.onclose = () => {
      state.connected = false;
      state.ws = null;
      // If we still hold a room, the drop was unintended -> reconnect + rejoin.
      if (state.room) scheduleReconnect();
    };
    ws.onerror = (e) => reject(e);
    ws.onmessage = (evt) => handleServerMessage(JSON.parse(evt.data));
  });
}

/**
 * Reconnect after a drop, backing off 1s -> 2s -> 4s ... capped at 30s, then
 * rejoin the room we were in. Keeps a session alive through wifi hiccups and
 * worker restarts.
 */
function scheduleReconnect() {
  setTimeout(async () => {
    if (state.connected || !state.room) return;
    try {
      await connect();
      sendToServer("join", { room: state.room }); // rejoin the same code
    } catch {
      state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30000);
      scheduleReconnect();
    }
  }, state.reconnectDelay);
}

/**
 * Send a typed message to the relay server.
 * @param {string} type - matches the server's MSG.* strings ("create", "join"...)
 * @param {object} [payload] - extra fields merged alongside `type`
 */
function sendToServer(type, payload = {}) {
  if (state.ws && state.connected) {
    state.ws.send(JSON.stringify({ type, ...payload }));
  }
}

/**
 * Route a message coming FROM the relay to the right destination.
 * @param {object} msg - parsed server message
 */
function handleServerMessage(msg) {
  switch (msg.type) {
    case "hello": // server assigned us an id
      state.clientId = msg.id;
      break;

    case "room": // we successfully created/joined/rejoined
      state.room = msg.room;
      state.role = msg.role;
      persist();
      if (msg.hostState) {
        state.media = {
          videoId: msg.hostState.videoId ?? null,
          mediaTime: msg.hostState.mediaTime ?? 0,
          paused: msg.hostState.paused ?? true,
        };
        sendToContent({ cmd: "SYNC_STATE", media: state.media });
      }
      sendToContent({ cmd: "REPORT_VIDEO" }); // teach the room our current video
      notifyPopup();
      break;

    case "control": // partner pressed play/pause/seek -> apply to our video
      state.media.mediaTime = msg.mediaTime;
      state.media.paused = msg.action === "pause";
      sendToContent({ cmd: "REMOTE_CONTROL", action: msg.action, mediaTime: msg.mediaTime });
      break;

    case "video": // partner switched to a different video -> follow them
      state.media.videoId = msg.videoId;
      sendToContent({ cmd: "REMOTE_VIDEO", videoId: msg.videoId });
      break;

    case "buffer": // partner stalled/recovered -> make our video wait/resume
      sendToContent({ cmd: "REMOTE_BUFFER", state: msg.state });
      break;

    case "presence": // partner joined/left
      state.partnerHere = msg.event === "joined";
      notifyPopup({ presence: msg.event });
      break;

    case "error":
      // Rejoin failed because the room is gone (grace expired) -> end cleanly.
      if (msg.reason === "no_such_room") {
        state.room = null;
        state.role = null;
        state.partnerHere = false;
        clearPersist();
      }
      notifyPopup({ error: msg.reason });
      break;
  }
}

/**
 * Forward a message to the content script in the synced YouTube tab.
 * @param {object} msg - our internal { cmd, ... } message
 */
function sendToContent(msg) {
  if (state.syncTabId != null) {
    chrome.tabs.sendMessage(state.syncTabId, msg).catch(() => {}); // ignore if tab not ready
  }
}

/**
 * Push current session state to the popup. No-op if the popup is closed.
 * @param {object} [extra] - extra fields (presence/error) to include
 */
function notifyPopup(extra = {}) {
  chrome.runtime
    .sendMessage({
      cmd: "STATE",
      connected: state.connected,
      room: state.room,
      role: state.role,
      partnerHere: state.partnerHere,
      ...extra,
    })
    .catch(() => {});
}

/**
 * Single entry point for messages from BOTH the popup and the content script.
 * We distinguish them by `cmd`. Returns true to keep the async response open.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.cmd) {
      // ---- from popup ----
      case "CREATE":
        state.syncTabId = msg.tabId;
        await connect();
        sendToServer("create");
        sendResponse({ ok: true });
        break;

      case "JOIN":
        state.syncTabId = msg.tabId;
        await connect();
        sendToServer("join", { room: msg.room });
        sendResponse({ ok: true });
        break;

      case "LEAVE": // explicit Leave Room button
        sendToServer("leave");
        state.room = null;
        state.role = null;
        state.partnerHere = false;
        clearPersist();
        notifyPopup();
        sendResponse({ ok: true });
        break;

      case "GET_STATE":
        sendResponse({
          connected: state.connected,
          room: state.room,
          role: state.role,
          partnerHere: state.partnerHere,
        });
        break;

      // ---- from content script ----
      case "LOCAL_CONTROL": // user acted on our video -> relay to the partner
        state.media.mediaTime = msg.mediaTime;
        state.media.paused = msg.action === "pause";
        sendToServer("control", {
          action: msg.action,
          mediaTime: msg.mediaTime,
          sentAt: Date.now(),
          seq: msg.seq,
        });
        break;

      case "LOCAL_VIDEO": // our tab is on / switched to a video -> tell the room
        if (msg.videoId) {
          state.media.videoId = msg.videoId;
          sendToServer("video", { videoId: msg.videoId });
        }
        break;

      case "LOCAL_BUFFER": // our video stalled/recovered -> tell the partner
        sendToServer("buffer", { state: msg.state });
        break;

      case "REQUEST_SYNC": // a freshly-loaded tab asks where it should be
        sendToContent({ cmd: "SYNC_STATE", media: state.media });
        break;
    }
  })();
  return true; // keep the async sendResponse channel open
});

// ---- startup: revive a session if the worker was restarted ----
(async () => {
  const saved = await chrome.storage.local.get(["pawse_room", "pawse_tab"]);
  if (saved.pawse_room) {
    state.room = saved.pawse_room;
    state.syncTabId = saved.pawse_tab ?? null;
    try {
      await connect();
      sendToServer("join", { room: state.room }); // silently rejoin
    } catch {
      scheduleReconnect();
    }
  }
})();
