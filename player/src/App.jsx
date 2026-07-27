/**
 * @file src/App.jsx
 * The Pawse player UI (React). All real-time logic lives in PawseClient; this
 * component only renders state and calls client methods on user actions.
 *
 * Layout: responsive two-column (grid) so the screen is filled and fits without
 * page scroll on desktop; stacks on mobile.
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
    progress: 0,
    transfer: "idle",
  });
  const [name, setName] = useState(localStorage.getItem("pawse_name") || "");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const clientRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const c = new PawseClient({ onState: setS });
    clientRef.current = c;
    c.connect();
  }, []);

  useEffect(() => {
    if (s.room && videoRef.current) clientRef.current?.attachVideo(videoRef.current);
  }, [s.room]);

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
  const onCopy = () => { navigator.clipboard.writeText(s.room); setCopied(true); setTimeout(() => setCopied(false), 1200); };

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
                {isHost && (
                  <div className="filepick">
                    <label htmlFor="file" className="btn primary filebtn">🎬 CHOOSE A MOVIE FILE</label>
                    <input id="file" type="file" accept="video/*" hidden onChange={onFile} />
                    {s.fileName && <span className="filename">🎞️ {s.fileName}</span>}
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

              <aside className="sidebar">
                <MeowFeed caption="stretch those paws" />
              </aside>
            </div>
          </div>
        )}
      </main>

      <footer className="pagefoot">made with 🐾 &amp; love · watch together, purr-fectly in sync</footer>
    </>
  );
}
