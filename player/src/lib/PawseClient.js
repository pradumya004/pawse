/**
 * @file src/lib/PawseClient.js
 * Framework-agnostic Pawse client for the own-files player (Track B).
 *
 * QUALITY-FIRST DESIGN (roadmap tiers B1/B0): the HOST sends the ORIGINAL file's
 * bytes over a WebRTC DataChannel; the PARTNER reassembles the exact same file
 * and plays it LOCALLY. Both play native, bit-identical video — no re-encode, no
 * live-stream lag, fully seekable — and stay in sync via play/pause/seek.
 *
 * RESILIENCE: room + name persist to localStorage, so a refresh or a dropped
 * socket auto-reconnects and rejoins the same room (the server holds it for a
 * 2-min grace window). When the partner rejoins, the host re-offers the file.
 *
 * React (App.jsx) only calls these methods and subscribes to `onState`.
 */
import { PAWSE_CONFIG } from "../config.js";

const CHUNK = 16 * 1024; // 16 KB DataChannel chunks (SCTP-safe)
const HIGH_WATER = 8 * 1024 * 1024; // pause sending above 8 MB buffered
const LOW_WATER = 2 * 1024 * 1024; // resume once drained below 2 MB

export class PawseClient {
  /** @param {{onState: (s: object) => void}} opts */
  constructor({ onState }) {
    this.onState = onState;
    this.ws = null;
    this.clientId = null;
    this.room = null;
    this.role = null; // "host" | "follower"
    this.myName = localStorage.getItem("pawse_name") || "Guest";
    this.partnerHere = false;
    this.partnerName = null;
    this.status = "connecting";
    this.fileName = null;
    this.reconnectDelay = 1000;

    // WebRTC / transfer
    this.pc = null;
    this.channel = null;
    this.file = null; // host: the chosen File
    this.fileChosen = false;
    this.pending = [];
    this.suppress = false;
    this.video = null;
    this.hint = "";
    this.progress = 0;
    this.transfer = "idle"; // idle | sending | receiving | ready
    this._lastPct = -1;

    this._chunks = [];
    this._recvBytes = 0;
    this._meta = null;
  }

  _updateHint() {
    if (this.role === "host") {
      if (!this.fileChosen) this.hint = "pick a movie file to start 🎬";
      else if (!this.partnerHere) this.hint = "waiting for your partner to join... 😿";
      else this.hint = ""; // partner here — progress bar / video takes over
    } else if (this.role === "follower") {
      if (this.transfer === "receiving") this.hint = "";
      else if (this.video && this.video.src) this.hint = "";
      else this.hint = "waiting for the host to pick a movie... 🍿";
    } else {
      this.hint = "";
    }
  }

  _emit() {
    this._updateHint();
    this.onState({
      status: this.status,
      room: this.room,
      role: this.role,
      partnerHere: this.partnerHere,
      partnerName: this.partnerName,
      fileName: this.fileName,
      hint: this.hint,
      progress: this.progress,
      transfer: this.transfer,
    });
  }

  attachVideo(el) {
    if (this.video === el) return;
    this.video = el;
    el.addEventListener("play", () => this._reportControl("play"));
    el.addEventListener("pause", () => this._reportControl("pause"));
    el.addEventListener("seeked", () => this._reportControl("seek"));
  }

  // ---- connection + resilience ----

  connect() {
    this.ws = new WebSocket(PAWSE_CONFIG.RELAY_WS);
    this.ws.onopen = () => {
      this.status = "connected";
      this.reconnectDelay = 1000;
      // Auto-rejoin a persisted room (refresh / reconnect).
      const saved = localStorage.getItem("pawse_room");
      if (saved && !this.room) this._send("join", { room: saved, name: this.myName });
      this._emit();
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (localStorage.getItem("pawse_room")) {
        this.status = "reconnecting";
        this._emit();
        this._scheduleReconnect();
      } else {
        this.status = "disconnected";
        this._emit();
      }
    };
    this.ws.onmessage = (e) => this._handle(JSON.parse(e.data));
  }

  _scheduleReconnect() {
    setTimeout(() => {
      if (this.ws) return;
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }, this.reconnectDelay);
  }

  _send(type, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type, ...payload }));
  }
  _signal(data) {
    this._send("signal", { data });
  }

  // ---- room actions ----

  create(name) {
    this.myName = name || "Guest";
    localStorage.setItem("pawse_name", this.myName);
    this._send("create", { name: this.myName });
  }
  join(code, name) {
    this.myName = name || "Guest";
    localStorage.setItem("pawse_name", this.myName);
    this._send("join", { room: code, name: this.myName });
  }
  leave() {
    this._send("leave");
    localStorage.removeItem("pawse_room");
    this._teardown();
    Object.assign(this, {
      room: null,
      role: null,
      partnerHere: false,
      partnerName: null,
      fileChosen: false,
      fileName: null,
      file: null,
      progress: 0,
      transfer: "idle",
      status: "connected",
    });
    this._emit();
  }

  chooseFile(file) {
    if (!this.video) return;
    this.file = file;
    this.fileName = file.name;
    this.fileChosen = true;
    this.progress = 0;
    this.transfer = "idle";
    this.video.srcObject = null;
    this.video.src = URL.createObjectURL(file); // host plays native file locally
    this._teardown();
    this._maybeStartTransfer();
    this._emit();
  }

  // ---- server routing ----

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
        localStorage.setItem("pawse_room", this.room);
        localStorage.setItem("pawse_name", this.myName);
        this._maybeStartTransfer();
        this._emit();
        break;
      case "presence":
        this.partnerHere = msg.event === "joined";
        if (msg.name) this.partnerName = msg.name;
        if (this.partnerHere && this.role === "host" && this.fileChosen) {
          // (Re)start the transfer for a partner that just (re)joined.
          this._teardown();
          this.progress = 0;
          this.transfer = "idle";
          this._maybeStartTransfer();
        }
        this._emit();
        break;
      case "signal":
        this._handleSignal(msg.data);
        break;
      case "control":
        if (msg.action === "resync") {
          // Partner finished downloading and wants our current position.
          if (this.role === "host" && this.video) {
            this._send("control", {
              action: this.video.paused ? "pause" : "play",
              mediaTime: this.video.currentTime,
              sentAt: Date.now(),
            });
          }
        } else {
          this._applyRemoteControl(msg.action, msg.mediaTime);
        }
        break;
      case "error":
        if (msg.reason === "no_such_room") {
          localStorage.removeItem("pawse_room");
          this.room = null;
          this.role = null;
          this.status = "connected";
        } else {
          this.status = `err: ${msg.reason}`;
        }
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
    return peer;
  }

  _teardown() {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.pending = [];
  }

  _maybeStartTransfer() {
    if (this.role !== "host" || !this.fileChosen || !this.partnerHere || this.pc) return;
    this.pc = this._newPeer();
    this.channel = this.pc.createDataChannel("file");
    this.channel.binaryType = "arraybuffer";
    this.channel.bufferedAmountLowThreshold = LOW_WATER;
    this.channel.onopen = () => this._sendFile();
    this.pc
      .createOffer()
      .then((o) => this.pc.setLocalDescription(o))
      .then(() => this._signal({ sdp: this.pc.localDescription }))
      .catch((e) => console.warn("[Pawse] offer failed", e));
  }

  _handleSignal(data) {
    if (data.sdp) {
      if (data.sdp.type === "offer") {
        this._teardown(); // drop any stale peer before accepting a fresh offer
        this.pc = this._newPeer();
        this.pc.ondatachannel = (e) => this._recvChannel(e.channel);
        this.pc
          .setRemoteDescription(data.sdp)
          .then(() => this._flush())
          .then(() => this.pc.createAnswer())
          .then((a) => this.pc.setLocalDescription(a))
          .then(() => this._signal({ sdp: this.pc.localDescription }))
          .catch((e) => console.warn("[Pawse] answer failed", e));
      } else if (data.sdp.type === "answer") {
        this.pc?.setRemoteDescription(data.sdp).then(() => this._flush()).catch(() => {});
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
    this.pending.forEach((c) => this.pc?.addIceCandidate(c).catch(() => {}));
    this.pending = [];
  }

  // ---- file transfer ----

  async _sendFile() {
    const file = this.file;
    if (!file) return;
    this.transfer = "sending";
    this.progress = 0;
    this._lastPct = -1;
    this.channel.send(JSON.stringify({ meta: true, name: file.name, size: file.size, mime: file.type }));
    let offset = 0;
    while (offset < file.size) {
      if (!this.channel || this.channel.readyState !== "open") return; // partner left
      if (this.channel.bufferedAmount > HIGH_WATER) {
        await new Promise((res) => {
          this.channel.onbufferedamountlow = () => {
            this.channel.onbufferedamountlow = null;
            res();
          };
        });
        if (!this.channel || this.channel.readyState !== "open") return;
      }
      const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
      this.channel.send(buf);
      offset += buf.byteLength;
      this._setProgress(offset / file.size);
    }
    this.channel.send(JSON.stringify({ done: true }));
    this.transfer = "ready";
    this.progress = 1;
    this._emit();
  }

  _recvChannel(ch) {
    ch.binaryType = "arraybuffer";
    this._chunks = [];
    this._recvBytes = 0;
    this._meta = null;
    this._lastPct = -1;
    this.transfer = "receiving";
    this.progress = 0;
    this._emit();
    ch.onmessage = (e) => {
      if (typeof e.data === "string") {
        const m = JSON.parse(e.data);
        if (m.meta) this._meta = m;
        else if (m.done) this._assemble();
        return;
      }
      this._chunks.push(e.data);
      this._recvBytes += e.data.byteLength;
      if (this._meta) this._setProgress(this._recvBytes / this._meta.size);
    };
  }

  _assemble() {
    const blob = new Blob(this._chunks, { type: this._meta?.mime || "video/mp4" });
    this.video.srcObject = null;
    this.video.src = URL.createObjectURL(blob); // partner plays the NATIVE file
    this.fileName = this._meta?.name || "movie";
    this.transfer = "ready";
    this.progress = 1;
    this.status = "watching";
    this._chunks = [];
    this._emit();
    // Ask the host where they are so we jump straight into sync.
    this._send("control", { action: "resync" });
  }

  _setProgress(p) {
    this.progress = p;
    const pct = Math.floor(p * 100);
    if (pct !== this._lastPct) {
      this._lastPct = pct;
      this._emit();
    }
  }

  // ---- playback sync ----

  _reportControl(action) {
    if (this.suppress) return;
    this._send("control", { action, mediaTime: this.video.currentTime, sentAt: Date.now() });
  }

  _applyRemoteControl(action, mediaTime) {
    if (!this.video || !this.video.src) return; // nothing loaded yet
    this.suppress = true;
    if (typeof mediaTime === "number" && Math.abs(this.video.currentTime - mediaTime) > 0.5) {
      this.video.currentTime = mediaTime;
    }
    if (action === "play") this.video.play().catch(() => {});
    else if (action === "pause") this.video.pause();
    setTimeout(() => (this.suppress = false), 150);
  }
}
