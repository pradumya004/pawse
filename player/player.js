/**
 * @file player/player.js
 * Pawse own-files P2P player (Track B) — all the logic for one standalone page.
 *
 * Flow:
 *   1. Connect to the relay (same server the extension uses).
 *   2. Create or join a room (same protocol: create/join/leave/presence).
 *   3. HOST picks a local movie file -> plays it locally -> streams it to the
 *      partner over a direct WebRTC peer connection (signaling relayed by the
 *      server, which never sees the video itself).
 *   4. PARTNER receives the stream and watches — no file, no account needed.
 *   5. Play/pause/seek relay over the room so both stay together.
 *
 * NOTE (quality): this first slice uses captureStream() (roadmap tier "B2") to
 * prove the P2P pipeline end-to-end. The lossless file-byte transfer (tier "B1"
 * / "B0") that guarantees native quality is the next iteration — see ROADMAP.md.
 */

const $ = (id) => document.getElementById(id);

// ---- session + connection state ----
let ws = null;
let clientId = null;
let room = null;
let role = null; // "host" | "follower"
let myName = "Guest";
let partnerHere = false;
let partnerName = null;

// ---- WebRTC state ----
let pc = null; // the RTCPeerConnection
let localStream = null; // host: captured stream of the playing file
let fileChosen = false; // host: has a file been picked?
let pendingCandidates = []; // ICE candidates that arrived before remote desc
let suppress = false; // echo-suppression while applying a remote control

const video = $("video");

// =====================================================================
//  WebSocket / room
// =====================================================================

/** Open the relay connection and wire message handling. */
function connect() {
  ws = new WebSocket(PAWSE_CONFIG.RELAY_WS);
  ws.onopen = () => setStatus("CONNECTED", true);
  ws.onclose = () => setStatus("DISCONNECTED", false);
  ws.onmessage = (evt) => handleServer(JSON.parse(evt.data));
}

/** Send a typed message to the relay. */
function send(type, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload }));
}

/** Relay a WebRTC signaling blob (SDP or ICE) to the other peer. */
function sendSignal(data) {
  send("signal", { data });
}

/** Route a message from the relay. */
function handleServer(msg) {
  switch (msg.type) {
    case "hello":
      clientId = msg.id;
      break;

    case "room":
      room = msg.room;
      role = msg.role;
      if (typeof msg.partnerHere === "boolean") partnerHere = msg.partnerHere;
      if (msg.partnerName) partnerName = msg.partnerName;
      showRoom();
      // If the partner was already here when we joined, we may be able to stream.
      maybeStartStream();
      break;

    case "presence":
      partnerHere = msg.event === "joined";
      if (msg.name) partnerName = msg.name;
      setPartner();
      if (partnerHere) maybeStartStream(); // partner arrived -> begin streaming
      break;

    case "signal":
      handleSignal(msg.data);
      break;

    case "control":
      applyRemoteControl(msg.action, msg.mediaTime);
      break;

    case "error":
      setStatus(`ERR: ${msg.reason}`, false);
      break;
  }
}

// =====================================================================
//  WebRTC — the peer-to-peer video pipe
// =====================================================================

/** Build a fresh RTCPeerConnection with our STUN config + shared handlers. */
function newPeer() {
  const peer = new RTCPeerConnection({ iceServers: PAWSE_CONFIG.ICE_SERVERS });
  // Trickle our ICE candidates to the other peer as they're discovered.
  peer.onicecandidate = (e) => {
    if (e.candidate) sendSignal({ candidate: e.candidate });
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "connected") setStatus("STREAMING", true);
  };
  return peer;
}

/**
 * HOST: once a file is chosen AND the partner is present, capture the playing
 * video and offer it over WebRTC.
 */
function maybeStartStream() {
  if (role !== "host" || !fileChosen || !partnerHere) return;
  if (pc) return; // already streaming

  pc = newPeer();
  localStream = video.captureStream();
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => sendSignal({ sdp: pc.localDescription }))
    .catch((e) => console.warn("[Pawse] offer failed", e));
}

/** Handle an incoming signaling blob (SDP offer/answer or ICE candidate). */
function handleSignal(data) {
  if (data.sdp) {
    if (data.sdp.type === "offer") {
      // FOLLOWER: receive the host's offer, answer it, show the stream.
      pc = newPeer();
      pc.ontrack = (e) => {
        video.srcObject = e.streams[0];
        $("videoHint").textContent = "";
        video.play().catch(() => {
          $("videoHint").textContent = "click the video to start ▶";
        });
      };
      pc.setRemoteDescription(data.sdp)
        .then(() => flushCandidates())
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => sendSignal({ sdp: pc.localDescription }))
        .catch((e) => console.warn("[Pawse] answer failed", e));
    } else if (data.sdp.type === "answer") {
      // HOST: the follower answered — connection can complete.
      pc.setRemoteDescription(data.sdp).then(flushCandidates).catch(() => {});
    }
  } else if (data.candidate) {
    // Queue candidates until the remote description exists, then add.
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      pc.addIceCandidate(data.candidate).catch(() => {});
    } else {
      pendingCandidates.push(data.candidate);
    }
  }
}

/** Add any ICE candidates that arrived before the remote description was set. */
function flushCandidates() {
  pendingCandidates.forEach((c) => pc.addIceCandidate(c).catch(() => {}));
  pendingCandidates = [];
}

// =====================================================================
//  Playback sync (host drives; follower's stream mirrors automatically)
// =====================================================================

/** Report a local playback action to the partner (host side mainly). */
function reportControl(action) {
  if (suppress) return;
  send("control", { action, mediaTime: video.currentTime, sentAt: Date.now() });
}

/** Apply a control from the partner. */
function applyRemoteControl(action, mediaTime) {
  suppress = true;
  if (typeof mediaTime === "number" && Math.abs(video.currentTime - mediaTime) > 0.5 && !video.srcObject) {
    video.currentTime = mediaTime;
  }
  if (action === "play") video.play().catch(() => {});
  else if (action === "pause") video.pause();
  setTimeout(() => (suppress = false), 150);
}

video.addEventListener("play", () => reportControl("play"));
video.addEventListener("pause", () => reportControl("pause"));
video.addEventListener("seeked", () => reportControl("seek"));

// =====================================================================
//  UI wiring
// =====================================================================

function setStatus(text, online) {
  $("statusText").textContent = text.toUpperCase();
  $("dot").classList.toggle("on", !!online);
}

function setView(inRoom) {
  $("lobby").classList.toggle("hidden", inRoom);
  $("room").classList.toggle("hidden", !inRoom);
}

function setPartner() {
  const who = partnerName || "your partner";
  $("partnerText").textContent = partnerHere ? `${who} is here` : "waiting for your partner...";
  $("partnerText").classList.toggle("active", partnerHere);
}

/** Show the room view and reveal host-only controls if we're the host. */
function showRoom() {
  $("roomCode").textContent = room;
  setStatus(role === "host" ? "HOSTING" : "IN ROOM", true);
  setPartner();
  setView(true);
  $("hostControls").classList.toggle("hidden", role !== "host");
  $("videoHint").textContent =
    role === "host" ? "choose a movie file above to start" : "waiting for the host to pick a movie...";
}

function nameVal() {
  return $("nameInput").value.trim() || "Guest";
}

$("createBtn").addEventListener("click", () => {
  myName = nameVal();
  localStorage.setItem("pawse_name", myName);
  send("create", { name: myName });
});

$("joinBtn").addEventListener("click", () => {
  const code = $("roomInput").value.trim().toUpperCase();
  if (!code) return;
  myName = nameVal();
  localStorage.setItem("pawse_name", myName);
  send("join", { room: code, name: myName });
});

$("leaveBtn").addEventListener("click", () => {
  send("leave");
  if (pc) {
    pc.close();
    pc = null;
  }
  room = null;
  role = null;
  partnerHere = false;
  fileChosen = false;
  setView(false);
  setStatus("CONNECTED", true);
});

$("copyBtn").addEventListener("click", () => {
  navigator.clipboard.writeText($("roomCode").textContent);
  const b = $("copyBtn");
  const t = b.textContent;
  b.textContent = "✓ COPIED";
  setTimeout(() => (b.textContent = t), 1200);
});

// HOST picks a local file -> play it locally, then (if partner is here) stream.
$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("fileName").textContent = file.name;
  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  video.play().catch(() => {});
  fileChosen = true;
  $("videoHint").textContent = partnerHere ? "" : "waiting for your partner to join...";
  // If a peer connection already exists (re-pick), tear it down and restart.
  if (pc) {
    pc.close();
    pc = null;
  }
  maybeStartStream();
});

// ---- boot ----
(() => {
  const saved = localStorage.getItem("pawse_name");
  if (saved) $("nameInput").value = saved;
  setView(false);
  connect();
})();
