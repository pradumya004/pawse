/**
 * @file popup/popup.js
 * The toolbar UI logic. It doesn't touch the video or the WebSocket directly —
 * it just sends CREATE/JOIN/LEAVE commands to the background (the brain), along
 * with the id of the active tab (the YouTube page to sync), and reflects the
 * session state the background reports back (room code, partner presence).
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
 * Toggle between the "lobby" (create/join) view and the "in a room" view.
 * @param {boolean} inRoom
 */
function setView(inRoom) {
  $("createBtn").classList.toggle("hidden", inRoom);
  $("joinBtn").parentElement.classList.toggle("hidden", inRoom); // the .join row
  document.querySelector(".divider").classList.toggle("hidden", inRoom);
  $("roomBox").classList.toggle("hidden", !inRoom);
  $("partnerBox").classList.toggle("hidden", !inRoom);
  $("leaveBtn").classList.toggle("hidden", !inRoom);
}

/**
 * Reflect a joined/created room in the UI.
 * @param {string} code - the room code
 * @param {string} [role] - "host" | "follower"
 * @param {boolean} [partnerHere] - whether the partner is connected
 */
function showRoom(code, role, partnerHere) {
  $("roomCode").textContent = code;
  setStatus(role ? `LIVE - ${role}` : "LIVE", true);
  setPartner(partnerHere);
  setView(true);
}

/**
 * Show whether the partner is present.
 * @param {boolean} here
 */
function setPartner(here) {
  $("partnerText").textContent = here ? "Kitty is here <3" : "waiting for partner...";
  $("partnerBox").classList.toggle("active", !!here);
}

// ---- button wiring ----

$("createBtn").addEventListener("click", async () => {
  const tabId = await activeTabId();
  await chrome.runtime.sendMessage({ cmd: "CREATE", tabId });
});

$("joinBtn").addEventListener("click", async () => {
  const room = $("roomInput").value.trim().toUpperCase();
  if (!room) return;
  const tabId = await activeTabId();
  await chrome.runtime.sendMessage({ cmd: "JOIN", room, tabId });
});

$("leaveBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ cmd: "LEAVE" });
  setView(false);
  setStatus("OFFLINE", false);
});

$("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText($("roomCode").textContent);
});

// ---- state from the background ----

/** The background pushes STATE updates (room assigned, partner joined, errors). */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.cmd !== "STATE") return;
  if (msg.room) {
    showRoom(msg.room, msg.role, msg.partnerHere);
  } else {
    // No room (e.g. after leave, or room ended) -> back to lobby.
    setView(false);
    setStatus(msg.error ? `ERR: ${msg.error}` : "OFFLINE", false);
  }
  if (msg.presence) setPartner(msg.presence === "joined");
});

/** On open, ask the background whether we're already in a room. */
(async () => {
  const s = await chrome.runtime.sendMessage({ cmd: "GET_STATE" });
  if (s?.room) showRoom(s.room, s.role, s.partnerHere);
})();
