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
  /** @param {{onState:Function, onLocalStream?:Function, onRemoteStream?:Function}} opts */
  constructor({ onState, onLocalStream, onRemoteStream }) {
    this.onState = onState;
    this.onLocalStream = onLocalStream; // called with our webcam stream
    this.onRemoteStream = onRemoteStream; // called with partner's webcam stream
    this.ws = null;
    this.clientId = null;
    this.room = null;
    this.role = null; // "host" | "follower"
    this.myName = localStorage.getItem("pawse_name") || "Guest";
    // Stable per-browser id (survives refresh) so the host reclaims host on rejoin.
    this.uid = localStorage.getItem("pawse_uid");
    if (!this.uid) {
      this.uid = (crypto.randomUUID && crypto.randomUUID()) || "u" + Date.now() + Math.random().toString(36).slice(2);
      localStorage.setItem("pawse_uid", this.uid);
    }
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

    // ---- Together Layer (Phase 5): A/V call + chat ----
    this.callPc = null; // SEPARATE peer connection for the webcam/mic call
    this.localCall = null; // our getUserMedia stream
    this.cameraOn = false;
    this.partnerCam = false; // is the partner's camera stream flowing?
    this.makingOffer = false; // perfect-negotiation flags (avoid offer glare)
    this.ignoreOffer = false;
    this.pendingCall = []; // call ICE candidates that arrived before remote desc
    this.messages = []; // chat log: { mine, text }
    this.subsOn = false; // are external subtitles loaded?

    // Phones/browsers SUSPEND background tabs, which silently drops the socket.
    // When the tab comes back to the foreground, reconnect if we're not open —
    // connect()'s onopen auto-rejoins the saved room. This fixes the "waiting
    // for partner" case where someone tabbed away (e.g. to send the code).
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (
          document.visibilityState === "visible" &&
          (!this.ws || this.ws.readyState !== WebSocket.OPEN)
        ) {
          this.connect();
        }
      });
    }
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
      cameraOn: this.cameraOn,
      partnerCam: this.partnerCam,
      messages: this.messages,
      subsOn: this.subsOn,
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
      if (saved && !this.room) this._send("join", { room: saved, name: this.myName, uid: this.uid });
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
    this._send("create", { name: this.myName, uid: this.uid });
  }
  join(code, name) {
    this.myName = name || "Guest";
    localStorage.setItem("pawse_name", this.myName);
    this._send("join", { room: code, name: this.myName, uid: this.uid });
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
        if (this.partnerHere) {
          if (msg.name) this.partnerName = msg.name;
        } else {
          // Partner left — clear their label + cam so no ghost lingers.
          this.partnerName = null;
          this.partnerCam = false;
        }
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
        // A signal tagged ch:"call" is for the webcam call; else the file P2P.
        if (msg.data && msg.data.ch === "call") this._handleCallSignal(msg.data);
        else this._handleSignal(msg.data);
        break;
      case "chat":
        this.messages = [...this.messages, { mine: false, text: msg.text }];
        this._emit();
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

  // =====================================================================
  //  Together Layer (Phase 5): webcam/mic call + text chat
  // =====================================================================

  /** Send a chat message to the partner (and add it to our own log). */
  sendChat(text) {
    const t = (text || "").trim();
    if (!t) return;
    this.messages = [...this.messages, { mine: true, text: t }];
    this._send("chat", { text: t });
    this._emit();
  }

  /**
   * Lazily create the SEPARATE peer connection used for the A/V call (kept
   * apart from the file-transfer `pc`). Uses the "perfect negotiation" pattern
   * so either side can turn their camera on at any time without offer glare.
   */
  _ensureCallPc() {
    if (this.callPc) return this.callPc;
    const pc = new RTCPeerConnection({ iceServers: PAWSE_CONFIG.ICE_SERVERS });
    this.pendingCall = [];
    // The "impolite" peer (host) wins collisions; the "polite" one (follower) yields.
    this._polite = this.role !== "host";

    pc.onicecandidate = (e) => {
      if (e.candidate) this._signal({ ch: "call", candidate: e.candidate });
    };
    pc.oniceconnectionstatechange = () =>
      console.log("[Pawse] call ICE:", pc.iceConnectionState);
    pc.onconnectionstatechange = () =>
      console.log("[Pawse] call conn:", pc.connectionState);
    pc.ontrack = (e) => {
      console.log("[Pawse] call ontrack — partner stream in");
      this.partnerCam = true;
      if (this.onRemoteStream) this.onRemoteStream(e.streams[0]);
      this._emit();
    };
    // Adding tracks (or the partner doing so) fires this — we (re)offer.
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription(); // implicit offer
        this._signal({ ch: "call", desc: pc.localDescription });
      } catch (err) {
        console.warn("[Pawse] call negotiation failed", err);
      } finally {
        this.makingOffer = false;
      }
    };
    this.callPc = pc;
    return pc;
  }

  /** Handle an incoming call signal (SDP/ICE) with perfect-negotiation rules. */
  async _handleCallSignal(data) {
    const pc = this._ensureCallPc();
    try {
      if (data.desc) {
        const offerCollision =
          data.desc.type === "offer" && (this.makingOffer || pc.signalingState !== "stable");
        this.ignoreOffer = !this._polite && offerCollision;
        if (this.ignoreOffer) return; // impolite peer ignores a colliding offer
        await pc.setRemoteDescription(data.desc);
        // Now that a remote description exists, flush any ICE that arrived early.
        for (const c of this.pendingCall) {
          try {
            await pc.addIceCandidate(c);
          } catch {
            /* ignore */
          }
        }
        this.pendingCall = [];
        if (data.desc.type === "offer") {
          await pc.setLocalDescription(); // implicit answer
          this._signal({ ch: "call", desc: pc.localDescription });
        }
      } else if (data.candidate) {
        // Candidates can arrive before the remote description is set — if so,
        // QUEUE them and add after setRemoteDescription (this was the bug: they
        // were being dropped, so ICE never completed and the call never connected).
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch (err) {
            if (!this.ignoreOffer) console.warn("[Pawse] call ICE add failed", err);
          }
        } else {
          this.pendingCall.push(data.candidate);
        }
      }
    } catch (err) {
      console.warn("[Pawse] call signal error", err);
    }
  }

  /** Turn our webcam+mic on and add the tracks to the call (triggers an offer). */
  async startCamera() {
    try {
      const pc = this._ensureCallPc();
      this.localCall = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (this.onLocalStream) this.onLocalStream(this.localCall);
      for (const track of this.localCall.getTracks()) pc.addTrack(track, this.localCall);
      this.cameraOn = true;
      this._emit();
    } catch (err) {
      console.warn("[Pawse] camera/mic blocked", err);
      this.cameraOn = false;
      this._emit();
    }
  }

  /** Stop sending our camera/mic (simple version: stop the local tracks). */
  stopCamera() {
    if (this.localCall) this.localCall.getTracks().forEach((t) => t.stop());
    this.localCall = null;
    if (this.onLocalStream) this.onLocalStream(null);
    this.cameraOn = false;
    this._emit();
  }

  /**
   * Load an external subtitle file (.srt or .vtt) onto the movie. Runs locally
   * per side — each person loads their own copy. Browsers only render WebVTT,
   * so we convert SRT -> VTT (add header + turn comma decimals into dots).
   * @param {File} file
   */
  async addSubtitles(file) {
    if (!this.video || !file) return;
    let text = await file.text();
    if (!/^WEBVTT/.test(text.trimStart())) {
      text =
        "WEBVTT\n\n" +
        text.replace(/\r/g, "").replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2");
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
    this.video.querySelectorAll("track").forEach((t) => t.remove()); // replace old
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = "Subtitles";
    track.srclang = "en";
    track.src = url;
    track.default = true;
    this.video.appendChild(track);
    // Give the browser a tick to register the track, then show it.
    setTimeout(() => {
      const tt = this.video.textTracks[0];
      if (tt) tt.mode = "showing";
    }, 100);
    this.subsOn = true;
    this._emit();
  }
}
