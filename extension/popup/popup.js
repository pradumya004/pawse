/**
 * @file popup/popup.js
 * The toolbar UI logic. Two views: #lobby (name + create/join) and #room
 * (invite link, partner presence, leave). It sends CREATE/JOIN/LEAVE to the
 * background (the brain) with the active tab id + the user's name, and reflects
 * the session state the background reports back.
 */

/** Tiny helper: get an element by id. */
const $ = (id) => document.getElementById(id);

/**
 * Get the id of the currently active tab — the YouTube page we want to control.
 * @returns {Promise<number|undefined>}
 */
async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

/** The user's chosen name (falls back to a friendly default). */
function myName() {
  return $("nameInput").value.trim() || "Guest";
}

/**
 * Set the status pill (dot color + text).
 * @param {string} text - short status label
 * @param {boolean} online - true tints the dot green
 */
function setStatus(text, online) {
  $("statusText").textContent = text.toUpperCase();
  $("dot").classList.toggle("on", !!online);
}

/**
 * Swap between the lobby (create/join) and the in-room view.
 * @param {boolean} inRoom
 */
function setView(inRoom) {
  $("lobby").classList.toggle("hidden", inRoom);
  $("room").classList.toggle("hidden", !inRoom);
}

/**
 * Show the partner's presence + name.
 * @param {boolean} here
 * @param {string} [name]
 */
function setPartner(here, name) {
  const who = name || "your partner";
  $("partnerText").textContent = here ? `${who} is watching with you` : "waiting for your partner...";
  $("partnerBox").classList.toggle("active", !!here);
}

/**
 * Reflect a joined/created room in the UI.
 * @param {string} code
 * @param {string} [role] - "host" | "follower"
 * @param {boolean} [partnerHere]
 * @param {string} [partnerName]
 */
function showRoom(code, role, partnerHere, partnerName, sync) {
  $("roomCode").textContent = code;
  let label = role === "host" ? "HOSTING" : "IN ROOM";
  if (partnerHere && sync && Date.now() - sync.at < 3000) {
    const ms = Math.round(sync.error * 1000);
    label = ms <= 50 ? `IN SYNC ${ms}MS` : `CATCHING UP ${ms}MS`;
  }
  setStatus(label, true);
  setPartner(partnerHere, partnerName);
  setView(true);
}

// ---- button wiring ----

$("createBtn").addEventListener("click", async () => {
  chrome.storage.local.set({ pawse_name: myName() });
  const tabId = await activeTabId();
  await chrome.runtime.sendMessage({ cmd: "CREATE", tabId, name: myName() });
});

$("joinBtn").addEventListener("click", async () => {
  const room = $("roomInput").value.trim().toUpperCase();
  if (!room) return;
  chrome.storage.local.set({ pawse_name: myName() });
  const tabId = await activeTabId();
  await chrome.runtime.sendMessage({ cmd: "JOIN", room, tabId, name: myName() });
});

$("leaveBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ cmd: "LEAVE" });
  setView(false);
  setStatus("NOT IN A ROOM", false);
});

// Copy an INVITE LINK: the current video URL + #pawse=CODE. When the partner
// opens it, the content script auto-joins this room and follows the video.
$("copyBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const base = (tab?.url || "https://www.youtube.com/").split("#")[0];
  const link = `${base}#pawse=${$("roomCode").textContent}`;
  await navigator.clipboard.writeText(link);
  const btn = $("copyBtn");
  const original = btn.textContent;
  btn.textContent = "✓ LINK COPIED!";
  setTimeout(() => (btn.textContent = original), 1500);
});

// ---- state from the background ----

/** The background pushes STATE updates (room assigned, partner joined, errors). */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.cmd !== "STATE") return;
  if (msg.room) {
    showRoom(msg.room, msg.role, msg.partnerHere, msg.partnerName, msg.sync);
  } else {
    setView(false);
    setStatus(msg.error ? `ERR: ${msg.error}` : "NOT IN A ROOM", false);
  }
  if (msg.presence) setPartner(msg.presence === "joined", msg.partnerName);
});

// ---- on open: prefill name, and show the room if we're already in one ----
(async () => {
  const saved = await chrome.storage.local.get(["pawse_name"]);
  if (saved.pawse_name) $("nameInput").value = saved.pawse_name;
  const s = await chrome.runtime.sendMessage({ cmd: "GET_STATE" });
  if (s?.room) {
    showRoom(s.room, s.role, s.partnerHere, s.partnerName, s.sync);
  } else {
    setView(false); // explicitly show the lobby (don't rely on default markup)
    setStatus("NOT IN A ROOM", false);
  }
})();
