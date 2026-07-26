/**
 * @file src/lib/PawseClient.js
 * Framework-agnostic Pawse client for the own-files player (Track B).
 *
 * QUALITY-FIRST DESIGN (roadmap tiers B1/B0): we do NOT live-stream a re-encoded
 * picture (that was the laggy captureStream slice). Instead the HOST sends the
 * ORIGINAL file's bytes over a WebRTC DataChannel; the PARTNER reassembles them
 * into the exact same file and plays it LOCALLY. Result: both sides play native,
 * bit-identical video — no re-encode, no live-stream lag, fully seekable — and
 * stay in sync via play/pause/seek control events (like the extension).
 *
 * Tradeoff: the partner downloads before watching (peer-to-peer, so it's fast on
 * a LAN and matches the host's upload over the internet). This is the "pre-load"
 * model from the roadmap — the price of perfect quality with zero playback lag.
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
    this.myName = "Guest";
    this.partnerHere = false;
    this.partnerName = null;
    this.status = "connecting";
    this.fileName = null;

    // WebRTC / transfer
    this.pc = null;
    this.channel = null;
    this.file = null; // host: the chosen File
    this.fileChosen = false;
    this.pending = [];
    this.suppress = false;
    this.video = null;
    this.hint = "";
    this.progress = 0; // 0..1 transfer progress
    this.transfer = "idle"; // idle | sending | receiving | ready
    this._lastPct = -1;

    // receive buffers
    this._chunks = [];
    this._recvBytes = 0;
    this._meta = null;
  }

  _emit() {
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
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type, ...payload }));
  }
  _signal(data) {
    this._send("signal", { data });
  }

  // ---- room actions ----

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

  /** HOST picks a local file: play it locally, then send it if partner's here. */
  chooseFile(file) {
    if (!this.video) return;
    this.file = file;
    this.fileName = file.name;
    this.fileChosen = true;
    this.video.srcObject = null;
    this.video.src = URL.createObjectURL(file); // host plays native file locally
    this.hint = this.partnerHere ? "" : "waiting for your partner to join...";
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
        this.hint =
          this.role === "host" ? "choose a movie file to start" : "waiting for the host to pick a movie...";
        this._maybeStartTransfer();
        this._emit();
        break;
      case "presence":
        this.partnerHere = msg.event === "joined";
        if (msg.name) this.partnerName = msg.name;
        if (this.partnerHere) this._maybeStartTransfer();
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

  /** HOST: when a file is chosen AND the partner is here, open a channel + offer. */
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
        this.pc = this._newPeer();
        this.pc.ondatachannel = (e) => this._recvChannel(e.channel); // FOLLOWER receives
        this.pc
          .setRemoteDescription(data.sdp)
          .then(() => this._flush())
          .then(() => this.pc.createAnswer())
          .then((a) => this.pc.setLocalDescription(a))
          .then(() => this._signal({ sdp: this.pc.localDescription }))
          .catch((e) => console.warn("[Pawse] answer failed", e));
      } else if (data.sdp.type === "answer") {
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

  // ---- file transfer (host -> partner) ----

  async _sendFile() {
    const file = this.file;
    this.transfer = "sending";
    this.channel.send(JSON.stringify({ meta: true, name: file.name, size: file.size, mime: file.type }));
    let offset = 0;
    while (offset < file.size) {
      // Backpressure: wait if the send buffer is too full.
      if (this.channel.bufferedAmount > HIGH_WATER) {
        await new Promise((res) => {
          this.channel.onbufferedamountlow = () => {
            this.channel.onbufferedamountlow = null;
            res();
          };
        });
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
    this.transfer = "receiving";
    this.hint = "receiving the movie...";
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
    this.video.src = URL.createObjectURL(blob); // partner now plays the NATIVE file
    this.fileName = this._meta?.name || "movie";
    this.transfer = "ready";
    this.progress = 1;
    this.hint = "";
    this.status = "watching";
    this._chunks = []; // free the chunk refs (blob holds the data)
    this._emit();
  }

  /** Emit progress only when the whole-number percent changes (throttle). */
  _setProgress(p) {
    this.progress = p;
    const pct = Math.floor(p * 100);
    if (pct !== this._lastPct) {
      this._lastPct = pct;
      this._emit();
    }
  }

  // ---- playback sync (both play local files, so seeks work) ----

  _reportControl(action) {
    if (this.suppress) return;
    this._send("control", { action, mediaTime: this.video.currentTime, sentAt: Date.now() });
  }

  _applyRemoteControl(action, mediaTime) {
    this.suppress = true;
    if (typeof mediaTime === "number" && Math.abs(this.video.currentTime - mediaTime) > 0.5) {
      this.video.currentTime = mediaTime;
    }
    if (action === "play") this.video.play().catch(() => {});
    else if (action === "pause") this.video.pause();
    setTimeout(() => (this.suppress = false), 150);
  }
}
