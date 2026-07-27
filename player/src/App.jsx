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
    status: "connecting", room: null, role: null, partnerHere: false, partnerName: null,
    fileName: null, hint: "", progress: 0, transfer: "idle",
    cameraOn: false, partnerCam: false, messages: [], subsOn: false,
  });
  const [name, setName] = useState(localStorage.getItem("pawse_name") || "");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatText, setChatText] = useState("");

  const clientRef = useRef(null);
  const videoRef = useRef(null);
  const localCamRef = useRef(null);
  const remoteCamRef = useRef(null);
  const chatLogRef = useRef(null);

  useEffect(() => {
    const c = new PawseClient({
      onState: setS,
      onLocalStream: (stream) => {
        if (localCamRef.current) { localCamRef.current.srcObject = stream; localCamRef.current.play?.().catch(() => {}); }
      },
      onRemoteStream: (stream) => {
        if (remoteCamRef.current) { remoteCamRef.current.srcObject = stream; remoteCamRef.current.play?.().catch(() => {}); }
      },
    });
    clientRef.current = c;
    c.connect();
  }, []);

  useEffect(() => {
    if (s.room && videoRef.current) clientRef.current?.attachVideo(videoRef.current);
  }, [s.room]);

  // Auto-scroll the chat to the newest message.
  useEffect(() => {
    if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [s.messages]);

  const inRoom = !!s.room;
  const isHost = s.role === "host";
  const online = ["connected", "hosting", "in room", "watching"].includes(s.status);
  const transferring = s.transfer === "sending" || s.transfer === "receiving";
  const pct = Math.round((s.progress || 0) * 100);

  const saveName = () => localStorage.setItem("pawse_name", name.trim());
  const onCreate = () => { saveName(); clientRef.current.create(name.trim()); };
  const onJoin = () => { if (!code.trim()) return; saveName(); clientRef.current.join(code.trim().toUpperCase(), name.trim()); };
  const onLeave = () => clientRef.current.leave();
  const onFile = (e) => { const f = e.target.files[0]; if (f) clientRef.current.chooseFile(f); };
  const onSubs = (e) => { const f = e.target.files[0]; if (f) clientRef.current.addSubtitles(f); };
  const onCopy = () => { navigator.clipboard.writeText(s.room); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  const toggleCam = () => (s.cameraOn ? clientRef.current.stopCamera() : clientRef.current.startCamera());
  const sendChat = (e) => { e.preventDefault(); clientRef.current.sendChat(chatText); setChatText(""); };

  return (
    <>
      <div className="scanlines" aria-hidden="true" />

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
            <section className="card">
              <div className="paws">🐾</div>
              <h2 className="cardTitle">watch your movies,<br />together</h2>
              <p className="cardSub">one of you picks a file — the other just joins.<br />no accounts. no uploads. just you two &amp; a cat. 🐱</p>

              <div className="identity">
                <label className="label" htmlFor="name">① WHO ARE YOU?</label>
                <input id="name" className="input" placeholder="your name, cutie" maxLength={12}
                  value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="label">② THEN PICK ONE:</div>
              <button className="btn primary big" onClick={onCreate}>🎬 START A ROOM</button>
              <div className="tinyhint">(you have the movie file)</div>

              <div className="divider"><span>OR</span></div>

              <div className="join">
                <input className="input" id="room" placeholder="ROOM CODE" maxLength={6}
                  value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                <button className="btn" onClick={onJoin}>JOIN</button>
              </div>
              <div className="tinyhint">(your partner has the file — you just watch)</div>
            </section>

            <aside className="lobbyArt">
              <MeowFeed caption="today's certified cat content" />
              <p className="bigtag">the cutest way to<br />watch together 💕</p>
            </aside>
          </div>
        ) : (
          // ===================== ROOM =====================
          <div className="roomWrap">
            <div className="roombar">
              <div className="roomcode"><span className="label">ROOM</span> <span className="code">{s.room}</span></div>
              <button className="btn small" onClick={onCopy}>{copied ? "✓ COPIED" : "📋 COPY CODE"}</button>
              <div className={"partner" + (s.partnerHere ? " active" : "")}>
                {s.partnerHere ? `😻 ${s.partnerName || "your partner"} is here` : "😿 waiting for your partner..."}
              </div>
              <button className="btn small leave" onClick={onLeave}>LEAVE</button>
            </div>

            <div className="roomGrid">
              <section className="stageMain">
                <div className="roomtools">
                  {isHost && (
                    <>
                      <label htmlFor="file" className="btn small primary">🎬 CHOOSE MOVIE</label>
                      <input id="file" type="file" accept="video/*" hidden onChange={onFile} />
                    </>
                  )}
                  <label htmlFor="subs" className="btn small">💬 {s.subsOn ? "SUBTITLES ✓" : "ADD SUBTITLES"}</label>
                  <input id="subs" type="file" accept=".srt,.vtt" hidden onChange={onSubs} />
                  {s.fileName && <span className="filename">🎞️ {s.fileName}</span>}
                </div>
                {isHost && (
                  <div className="tinyhint fmt">
                    ⚠️ no sound? your file likely has AC3/DTS/Dolby audio (browsers can't play it).
                    use MP4 with AAC audio, or re-encode: <code>ffmpeg -i in.mkv -c:v copy -c:a aac out.mp4</code>
                  </div>
                )}

                {transferring && (
                  <div className="progress">
                    <div className="progresslabel">
                      {s.transfer === "sending" ? "beaming the movie to your partner" : "catching the movie"} — {pct}%
                    </div>
                    <div className="progressbar"><div className="progressfill" style={{ width: pct + "%" }} /></div>
                  </div>
                )}

                <div className="videowrap">
                  <video ref={videoRef} className="video" controls playsInline />
                  {s.hint && <div className="videohint">{s.hint}</div>}
                </div>
              </section>

              {/* ---- Together sidebar: cams + chat ---- */}
              <aside className="sidebar">
                <div className="cams">
                  <div className={"cam remote" + (s.partnerCam ? "" : " empty")}>
                    <video ref={remoteCamRef} autoPlay playsInline />
                    {!s.partnerCam && (
                      <span className="camlabel">
                        {s.partnerHere ? `😿 ${s.partnerName || "partner"} cam off` : "waiting for partner"}
                      </span>
                    )}
                  </div>
                  <div className={"cam local" + (s.cameraOn ? "" : " empty")}>
                    <video ref={localCamRef} autoPlay playsInline muted />
                    {!s.cameraOn && <span className="camlabel">you</span>}
                  </div>
                </div>

                <button className={"btn small camtoggle" + (s.cameraOn ? " on" : "")} onClick={toggleCam}>
                  {s.cameraOn ? "📷 STOP CAMERA" : "📷 START CAMERA"}
                </button>

                <div className="chat">
                  <div className="chatlog" ref={chatLogRef}>
                    {s.messages.length === 0 && <div className="chatempty">say hi 👋</div>}
                    {s.messages.map((m, i) => (
                      <div key={i} className={"msg" + (m.mine ? " mine" : "")}>
                        <span className="msgwho">{m.mine ? "you" : s.partnerName || "them"}</span>
                        <span className="msgtext">{m.text}</span>
                      </div>
                    ))}
                  </div>
                  <form className="chatbar" onSubmit={sendChat}>
                    <input className="chatinput" placeholder="type something cute..." maxLength={200}
                      value={chatText} onChange={(e) => setChatText(e.target.value)} />
                    <button className="btn small" type="submit">SEND</button>
                  </form>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>

      <footer className="pagefoot">made with 🐾 &amp; love · watch together, purr-fectly in sync</footer>
    </>
  );
}
