/**
 * @file src/App.jsx
 * The Pawse player UI (React). All real-time logic lives in PawseClient; this
 * component only renders state and calls client methods on user actions.
 *
 * Room sidebar now holds the "Together Layer": webcam bubbles (you + partner),
 * a camera toggle, and text chat. The movie fills the main column.
 */
import { useEffect, useRef, useState } from "react";
import { PawseClient } from "./lib/PawseClient.js";
import Cat from "./Cat.jsx";
import MeowFeed from "./MeowFeed.jsx";

export default function App() {
  const [s, setS] = useState({
    status: "connecting",
    room: null,
    role: null,
    partnerHere: false,
    partnerName: null,
    fileName: null,
    hint: "",
    error: null,
    progress: 0,
    transfer: "idle",
    camOn: false,
    micOn: false,
    partnerCam: false,
    messages: [],
    subsOn: false,
  });
  // treat a leftover "Guest" as "no name yet" — old builds saved it, and we must NOT auto-join with it
  const [name, setName] = useState(() => {
    const s = localStorage.getItem("pawse_name");
    return s && s !== "Guest" ? s : "";
  });
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatText, setChatText] = useState("");
  const [lobbyMode, setLobbyMode] = useState("choose"); // "choose" = pick create/join, "join" = code entry
  const [inviteRoom, setInviteRoom] = useState(null); // room code pulled from a ?room= invite link
  const [needName, setNeedName] = useState(false); // true when user tries to create/join without a name
  const [showChat, setShowChat] = useState(true); // 💬 toggle — off = cams stack bigger
  const [showCode, setShowCode] = useState(false); // room code masked until revealed
  const [burst, setBurst] = useState(false); // 😻 celebration when the partner joins
  const prevPartner = useRef(false);

  const clientRef = useRef(null);
  const videoRef = useRef(null);
  const localCamRef = useRef(null);
  const remoteCamRef = useRef(null);
  const chatLogRef = useRef(null);

  useEffect(() => {
    const c = new PawseClient({
      onState: setS,
      onLocalStream: (stream) => {
        if (localCamRef.current) {
          localCamRef.current.srcObject = stream;
          localCamRef.current.play?.().catch(() => {});
        }
      },
      onRemoteStream: (stream) => {
        if (remoteCamRef.current) {
          remoteCamRef.current.srcObject = stream;
          remoteCamRef.current.play?.().catch(() => {});
        }
      },
    });
    clientRef.current = c;
    c.connect();
  }, []);

  useEffect(() => {
    if (s.room && videoRef.current)
      clientRef.current?.attachVideo(videoRef.current);
  }, [s.room]);

  // If opened via an invite link (?room=CODE) → prefill the code + show the join panel.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("room");
    if (r) {
      localStorage.removeItem("pawse_room"); // an invite link takes priority over any leftover room
      const CODE = r.toUpperCase();
      setCode(CODE);
      setLobbyMode("join");
      setInviteRoom(CODE);
    }
  }, []);

  // Auto-join the invited room once we're connected — but only if a name is already
  // saved. If not, we leave the join panel prefilled so they type a name first.
  useEffect(() => {
    if (inviteRoom && s.status === "connected" && !s.room && name.trim()) {
      clientRef.current.join(inviteRoom, name.trim());
      setInviteRoom(null);
    }
  }, [s.status, inviteRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll the chat to the newest message.
  useEffect(() => {
    if (chatLogRef.current)
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [s.messages]);

  // 😻 celebrate the moment the partner joins (false → true), then clear.
  useEffect(() => {
    if (s.partnerHere && !prevPartner.current) {
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 1800);
      prevPartner.current = true;
      return () => clearTimeout(t);
    }
    prevPartner.current = s.partnerHere;
  }, [s.partnerHere]);

  const inRoom = !!s.room;
  const isHost = s.role === "host";
  const online = ["connected", "hosting", "in room", "watching"].includes(
    s.status,
  );
  const ready = s.status === "connected"; // socket open & idle in the lobby
  const reconnecting = s.status === "reconnecting"; // dropped mid-session, retrying
  const transferring = s.transfer === "sending" || s.transfer === "receiving";
  const pct = Math.round((s.progress || 0) * 100);

  const saveName = () => localStorage.setItem("pawse_name", name.trim());
  const onCreate = () => {
    if (!name.trim()) { setNeedName(true); return; }
    if (!ready) return; // socket not open yet — the loading note explains why
    saveName();
    clientRef.current.create(name.trim());
  };
  const onJoin = () => {
    if (!name.trim()) { setNeedName(true); return; }
    if (!ready) return;
    if (!code.trim()) return;
    saveName();
    clientRef.current.join(code.trim().toUpperCase(), name.trim());
  };
  const onLeave = () => {
    clientRef.current.leave();
    setLobbyMode("choose");
  };
  const onFile = (e) => {
    const f = e.target.files[0];
    if (f) clientRef.current.chooseFile(f);
  };
  const onSubs = (e) => {
    const f = e.target.files[0];
    if (f) clientRef.current.addSubtitles(f);
  };
  const onCopy = () => {
    const link = `${window.location.origin}/?room=${s.room}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const toggleCam = () => clientRef.current.toggleCamera();
  const toggleMic = () => clientRef.current.toggleMic();
  const sendChat = (e) => {
    e.preventDefault();
    clientRef.current.sendChat(chatText);
    setChatText("");
  };

  return (
    <>
      <div className="scanlines" aria-hidden="true" />

      {burst && (
        <div className="burst" aria-hidden="true">
          {["😻", "💕", "🎉", "🐾", "💛", "😸", "✨"].map((e, i) => (
            <span key={i} style={{ left: `${8 + i * 13}%`, animationDelay: `${i * 0.07}s` }}>
              {e}
            </span>
          ))}
        </div>
      )}

      <header className="topbar">
        <div className="brand">
          <Cat />
          <div className="brandtext">
            <span className="logo">PAWSE</span>
            <span className="tagline">watch together, from anywhere 🐾</span>
          </div>
        </div>
        <div className="status">
          <span className={"dot" + (online ? " on" : "")} />
          <span>{s.status.toUpperCase()}</span>
        </div>
      </header>

      <main className="stage">
        {!inRoom ? (
          // ===================== LOBBY =====================
          <div className="lobbyGrid">
            <div className="stickers" aria-hidden="true">
              <span className="sticker s1">🐾</span>
              <span className="sticker s2">💕</span>
              <span className="sticker s3">🍿</span>
              <span className="sticker s4">🎬</span>
              <span className="sticker s5">🐱</span>
            </div>

            <section className="card">
              <div className="paws">🐾</div>
              <h2 className="cardTitle">
                watch your movies,
                <br />
                together
              </h2>
              <p className="cardSub">
                one of you picks a file — the other just joins.
                <br />
                no accounts. no uploads. just you two &amp; a cat. 🐱
              </p>

              <div className="badges">
                <span className="badge">🎬 your files</span>
                <span className="badge">📷 see each other</span>
                <span className="badge">💬 chat</span>
              </div>

              <div className="identity">
                <label className="label" htmlFor="name">
                  WHAT'S YOUR NAME?
                </label>
                <input
                  id="name"
                  className="input"
                  placeholder="your name, cutie"
                  maxLength={12}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNeedName(false);
                  }}
                />
                {needName && (
                  <div className="tinyhint nameerr">🐱 enter your name first!</div>
                )}
              </div>

              {s.error && <div className="tinyhint err">{s.error}</div>}
              {!ready && (
                <div className="tinyhint">🔌 waking up the server… (first connect ~30s)</div>
              )}

              {lobbyMode === "choose" ? (
                <div className="chooser">
                  <button className="btn primary big" onClick={onCreate} disabled={!ready}>
                    🎬 CREATE A ROOM
                  </button>
                  <div className="tinyhint">(you have the movie file)</div>
                  <button
                    className="btn big"
                    onClick={() => setLobbyMode("join")}
                  >
                    🚪 JOIN A ROOM
                  </button>
                  <div className="tinyhint">
                    (your partner has the file — you just watch)
                  </div>
                </div>
              ) : (
                <div className="joinpanel">
                  <label className="label" htmlFor="room">
                    ENTER THE ROOM CODE
                  </label>
                  <input
                    id="room"
                    className="input"
                    placeholder="ROOM CODE"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                  <button className="btn primary" onClick={onJoin} disabled={!ready}>
                    JOIN ROOM
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => setLobbyMode("choose")}
                  >
                    ← back
                  </button>
                </div>
              )}
            </section>

            <aside className="lobbyArt">
              <MeowFeed caption="today's certified cat content" />
              <p className="bigtag">
                the cutest way to
                <br />
                watch together 💕
              </p>
            </aside>
          </div>
        ) : (
          // ===================== ROOM =====================
          <div className="roomWrap">
            {reconnecting && (
              <div className="reconnbar">🔄 connection dropped — reconnecting, hang tight 🐾</div>
            )}
            <div className="roombar">
              <div className="roomcode">
                <span className="label">ROOM</span>{" "}
                <span className="code">{showCode ? s.room : "••••••"}</span>
                <button className="btn ghost tiny" onClick={() => setShowCode((v) => !v)}>
                  {showCode ? "🙈" : "👁"}
                </button>
              </div>
              <button className="btn small" onClick={onCopy}>
                {copied ? "✓ LINK COPIED" : "📋 COPY LINK"}
              </button>
              <div className={"partner" + (s.partnerHere ? " active" : "")}>
                {s.partnerHere
                  ? `😻 ${s.partnerName || "your partner"} is here`
                  : "😿 waiting for your partner..."}
              </div>
              <button className="btn small leave" onClick={onLeave}>
                LEAVE
              </button>
            </div>

            <div className={"roomGrid" + (showChat ? "" : " nochat")}>
              <section className="stageMain">
                <div className="roomtools">
                  {isHost && (
                    <>
                      <label htmlFor="file" className="btn small primary">
                        🎬 CHOOSE MOVIE
                      </label>
                      <input
                        id="file"
                        type="file"
                        accept="video/*"
                        hidden
                        onChange={onFile}
                      />
                    </>
                  )}
                  <label htmlFor="subs" className="btn small">
                    📝 {s.subsOn ? "SUBTITLES ✓" : "ADD SUBTITLES"}
                  </label>
                  <input
                    id="subs"
                    type="file"
                    accept=".srt,.vtt"
                    hidden
                    onChange={onSubs}
                  />
                  {s.fileName && (
                    <span className="filename">🎞️ {s.fileName}</span>
                  )}
                </div>
                {(s.audioMissing || s.formatWarn) && (
                  <div className="tinyhint fmt">
                    {s.audioMissing
                      ? "🔇 no sound — this file's audio (likely AC3/DTS/Dolby) can't be decoded in the browser."
                      : "⚠️ " + s.formatWarn}
                    {isHost && (
                      <>
                        {" "}safest fix — re-encode to MP4 + AAC:{" "}
                        <code>ffmpeg -i in.mkv -c:v libx264 -c:a aac out.mp4</code>
                      </>
                    )}
                  </div>
                )}

                {transferring && (
                  <div className="progress">
                    <div className="progresslabel">
                      {s.transfer === "sending"
                        ? "beaming the movie to your partner"
                        : "catching the movie"}{" "}
                      — {pct}%
                    </div>
                    <div className="progressbar">
                      <div
                        className="progressfill"
                        style={{ width: pct + "%" }}
                      />
                    </div>
                  </div>
                )}

                <div className="videowrap">
                  <video
                    ref={videoRef}
                    className="video"
                    controls
                    playsInline
                  />
                  {s.mediaError ? (
                    <div className="videohint mediaerr">
                      <span className="errbox">{s.mediaError}</span>
                    </div>
                  ) : (
                    s.hint && <div className="videohint">{s.hint}</div>
                  )}
                </div>
              </section>

              {/* ---- Together sidebar: 3 toggles → cams → chat ---- */}
              <aside className="sidebar">
                <div className="togglebar">
                  <button className={"toggle" + (s.camOn ? " on" : "")} onClick={toggleCam}>
                    📷<span className="tlabel">{s.camOn ? "on" : "cam"}</span>
                  </button>
                  <button className={"toggle" + (s.micOn ? " on" : "")} onClick={toggleMic}>
                    🎤<span className="tlabel">{s.micOn ? "on" : "mic"}</span>
                  </button>
                  <button
                    className={"toggle" + (showChat ? " on" : "")}
                    onClick={() => setShowChat((v) => !v)}
                  >
                    💬<span className="tlabel">chat</span>
                  </button>
                </div>

                <div className={"cams " + (showChat ? "twocol" : "stacked")}>
                  <div className={"cam remote" + (s.partnerCam ? "" : " empty")}>
                    <video ref={remoteCamRef} autoPlay playsInline />
                    {!s.partnerCam && (
                      <span className="camlabel">
                        {s.partnerHere
                          ? `😿 ${s.partnerName || "partner"} cam off`
                          : "waiting for partner"}
                      </span>
                    )}
                  </div>
                  <div className={"cam local" + (s.camOn ? "" : " empty")}>
                    <video ref={localCamRef} autoPlay playsInline muted />
                    {!s.camOn && <span className="camlabel">you</span>}
                  </div>
                </div>

                {showChat && (
                  <div className="chat">
                    <div className="chatlog" ref={chatLogRef}>
                      {s.messages.length === 0 && (
                        <div className="chatempty">say hi 👋</div>
                      )}
                      {s.messages.map((m, i) => (
                        <div key={i} className={"msg" + (m.mine ? " mine" : "")}>
                          <span className="msgwho">
                            {m.mine ? "you" : s.partnerName || "them"}
                          </span>
                          <span className="msgtext">{m.text}</span>
                        </div>
                      ))}
                    </div>
                    <form className="chatbar" onSubmit={sendChat}>
                      <input
                        className="chatinput"
                        placeholder="type something cute..."
                        maxLength={200}
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                      />
                      <button className="btn small" type="submit">
                        SEND
                      </button>
                    </form>
                  </div>
                )}
              </aside>
            </div>
          </div>
        )}
      </main>

      <footer className="pagefoot">
        made with 🐾 &amp; love · watch together, purr-fectly in sync
      </footer>
    </>
  );
}
