/**
 * @file src/lib/PawseClient.js
 * Framework-agnostic Pawse client for the own-files player (Track B).
 *
 * Deliberately NOT a React component — real-time WebRTC/WebSocket logic doesn't
 * belong in the render cycle. React (App.jsx) just calls these methods and
 * subscribes to `onState` for UI updates. This keeps the tricky bits testable
 * and isolated.
 *
 * Responsibilities:
 *   - connect to the relay, create/join/leave rooms
 *   - HOST: capture a chosen local file and stream it over WebRTC
 *   - FOLLOWER: receive and display the stream
 *   - relay play/pause/seek so both stay in sync
 *
 * NOTE (quality): uses captureStream() (roadmap tier "B2") to prove the P2P
 * pipeline. Lossless file-byte transfer (B1/B0) is the next iteration.
 */
import { PAWSE_CONFIG } from "../config.js";

export class PawseClient {
  /** @param {{onState: (s: object) => void}} opts */
  constructor({ onState }) {
    this.onState = onState;
    this.ws = null;
    this.clientId = null;
    this.room = null;
    this.role = null; // "host" | "follower"
    this.myName = "Guest";
    this.partnerHere = false;
    this.partnerName = null;
    this.status = "connecting";
    this.fileName = null;

    // WebRTC
    this.pc = null;
    this.localStream = null;
    this.fileChosen = false;
    this.pending = []; // ICE candidates arrived before remote description
    this.suppress = false; // echo-suppression while applying a remote control
    this.video = null; // <video> element, set via attachVideo()
    this.hint = ""; // hint text for the video overlay
  }

  /** Push a state snapshot to the UI (React). */
  _emit() {
    this.onState({
      status: this.status,
      room: this.room,
      role: this.role,
      partnerHere: this.partnerHere,
      partnerName: this.partnerName,
      fileName: this.fileName,
      hint: this.hint,
    });
  }

  /** Give the client the <video> element and wire local playback events. */
  attachVideo(el) {
    if (this.video === el) return;
    this.video = el;
    el.addEventListener("play", () => this._reportControl("play"));
    el.addEventListener("pause", () => this._reportControl("pause"));
    el.addEventListener("seeked", () => this._reportControl("seek"));
  }

  // ---- connection ----

  connect() {
    this.ws = new WebSocket(PAWSE_CONFIG.RELAY_WS);
    this.ws.onopen = () => {
      this.status = "connected";
      this._emit();
    };
    this.ws.onclose = () => {
      this.status = "disconnected";
      this._emit();
    };
    this.ws.onmessage = (e) => this._handle(JSON.parse(e.data));
  }

  _send(type, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  _signal(data) {
    this._send("signal", { data });
  }

  // ---- room actions (called by the UI) ----

  create(name) {
    this.myName = name || "Guest";
    this._send("create", { name: this.myName });
  }

  join(code, name) {
    this.myName = name || "Guest";
    this._send("join", { room: code, name: this.myName });
  }

  leave() {
    this._send("leave");
    this._teardownPeer();
    this.room = null;
    this.role = null;
    this.partnerHere = false;
    this.partnerName = null;
    this.fileChosen = false;
    this.fileName = null;
    this.status = "connected";
    this._emit();
  }

  /** HOST picks a local file: play it locally, then stream if partner is here. */
  chooseFile(file) {
    if (!this.video) return;
    this.fileName = file.name;
    this.video.srcObject = null;
    this.video.src = URL.createObjectURL(file);
    this.video.play().catch(() => {});
    this.fileChosen = true;
    this.hint = this.partnerHere ? "" : "waiting for your partner to join...";
    this._teardownPeer(); // if re-picking, restart the stream cleanly
    this._maybeStartStream();
    this._emit();
  }

  // ---- server message routing ----

  _handle(msg) {
    switch (msg.type) {
      case "hello":
        this.clientId = msg.id;
        break;
      case "room":
        this.room = msg.room;
        this.role = msg.role;
        if (typeof msg.partnerHere === "boolean") this.partnerHere = msg.partnerHere;
        if (msg.partnerName) this.partnerName = msg.partnerName;
        this.status = this.role === "host" ? "hosting" : "in room";
        this.hint =
          this.role === "host"
            ? "choose a movie file to start"
            : "waiting for the host to pick a movie...";
        this._maybeStartStream();
        this._emit();
        break;
      case "presence":
        this.partnerHere = msg.event === "joined";
        if (msg.name) this.partnerName = msg.name;
        if (this.partnerHere) this._maybeStartStream();
        this._emit();
        break;
      case "signal":
        this._handleSignal(msg.data);
        break;
      case "control":
        this._applyRemoteControl(msg.action, msg.mediaTime);
        break;
      case "error":
        this.status = `err: ${msg.reason}`;
        this._emit();
        break;
    }
  }

  // ---- WebRTC ----

  _newPeer() {
    const peer = new RTCPeerConnection({ iceServers: PAWSE_CONFIG.ICE_SERVERS });
    peer.onicecandidate = (e) => {
      if (e.candidate) this._signal({ candidate: e.candidate });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        this.status = "streaming";
        this._emit();
      }
    };
    return peer;
  }

  _teardownPeer() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.pending = [];
  }

  /** HOST: once a file is chosen AND partner is present, offer the stream. */
  _maybeStartStream() {
    if (this.role !== "host" || !this.fileChosen || !this.partnerHere || this.pc) return;
    this.pc = this._newPeer();
    this.localStream = this.video.captureStream();
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
    this.pc
      .createOffer()
      .then((o) => this.pc.setLocalDescription(o))
      .then(() => this._signal({ sdp: this.pc.localDescription }))
      .catch((e) => console.warn("[Pawse] offer failed", e));
  }

  _handleSignal(data) {
    if (data.sdp) {
      if (data.sdp.type === "offer") {
        // FOLLOWER: answer the host's offer and show the incoming stream.
        this.pc = this._newPeer();
        this.pc.ontrack = (e) => {
          this.video.srcObject = e.streams[0];
          this.hint = "";
          this._emit();
          this.video.play().catch(() => {
            this.hint = "click the video to start";
            this._emit();
          });
        };
        this.pc
          .setRemoteDescription(data.sdp)
          .then(() => this._flush())
          .then(() => this.pc.createAnswer())
          .then((a) => this.pc.setLocalDescription(a))
          .then(() => this._signal({ sdp: this.pc.localDescription }))
          .catch((e) => console.warn("[Pawse] answer failed", e));
      } else if (data.sdp.type === "answer") {
        // HOST: the follower answered.
        this.pc.setRemoteDescription(data.sdp).then(() => this._flush()).catch(() => {});
      }
    } else if (data.candidate) {
      if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
        this.pc.addIceCandidate(data.candidate).catch(() => {});
      } else {
        this.pending.push(data.candidate);
      }
    }
  }

  _flush() {
    this.pending.forEach((c) => this.pc.addIceCandidate(c).catch(() => {}));
    this.pending = [];
  }

  // ---- playback sync ----

  _reportControl(action) {
    if (this.suppress) return;
    this._send("control", { action, mediaTime: this.video.currentTime, sentAt: Date.now() });
  }

  _applyRemoteControl(action, mediaTime) {
    this.suppress = true;
    // Only seek our own local file (a follower's srcObject stream can't seek).
    if (
      typeof mediaTime === "number" &&
      !this.video.srcObject &&
      Math.abs(this.video.currentTime - mediaTime) > 0.5
    ) {
      this.video.currentTime = mediaTime;
    }
    if (action === "play") this.video.play().catch(() => {});
    else if (action === "pause") this.video.pause();
    setTimeout(() => (this.suppress = false), 150);
  }
}
