/**
 * @file src/App.jsx
 * The Pawse player UI (React). All real-time logic lives in PawseClient; this
 * component only renders state and calls client methods on user actions.
 */
import { useEffect, useRef, useState } from "react";
import { PawseClient } from "./lib/PawseClient.js";
import Cat from "./Cat.jsx";

export default function App() {
  const [s, setS] = useState({
    status: "connecting",
    room: null,
    role: null,
    partnerHere: false,
    partnerName: null,
    fileName: null,
    hint: "",
  });
  const [name, setName] = useState(localStorage.getItem("pawse_name") || "");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const clientRef = useRef(null);
  const videoRef = useRef(null);

  // Create the client once, on mount.
  useEffect(() => {
    const c = new PawseClient({ onState: setS });
    clientRef.current = c;
    c.connect();
  }, []);

  // Attach the <video> element to the client whenever the room view is showing.
  useEffect(() => {
    if (s.room && videoRef.current) clientRef.current?.attachVideo(videoRef.current);
  }, [s.room]);

  const inRoom = !!s.room;
  const isHost = s.role === "host";

  function saveName() {
    localStorage.setItem("pawse_name", name.trim());
  }

  function onCreate() {
    saveName();
    clientRef.current.create(name.trim());
  }
  function onJoin() {
    if (!code.trim()) return;
    saveName();
    clientRef.current.join(code.trim().toUpperCase(), name.trim());
  }
  function onLeave() {
    clientRef.current.leave();
  }
  function onFile(e) {
    const file = e.target.files[0];
    if (file) clientRef.current.chooseFile(file);
  }
  function onCopy() {
    navigator.clipboard.writeText(s.room);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const online = ["connected", "hosting", "in room", "streaming"].includes(s.status);

  return (
    <>
      <div className="scanlines" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <Cat />
          <span className="logo">PAWSE</span>
        </div>
        <div className="status">
          <span className={"dot" + (online ? " on" : "")} />
          <span>{s.status.toUpperCase()}</span>
        </div>
      </header>

      <main className="stage">
        {!inRoom ? (
          // ============ LOBBY ============
          <section className="card">
            <h2 className="cardTitle">watch your own movies, together</h2>
            <p className="cardSub">one of you picks a file — the other just joins. no accounts, no uploads.</p>

            <label className="label" htmlFor="name">WHO ARE YOU?</label>
            <input
              id="name"
              className="input"
              placeholder="your name"
              maxLength={12}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <button className="btn primary" onClick={onCreate}>START A ROOM (I HAVE THE FILE)</button>

            <div className="divider"><span>OR JOIN YOUR PARTNER</span></div>

            <div className="join">
              <input
                className="input"
                id="room"
                placeholder="ROOM CODE"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button className="btn" onClick={onJoin}>JOIN</button>
            </div>
          </section>
        ) : (
          // ============ ROOM ============
          <section className="room">
            <div className="roombar">
              <div className="roomcode"><span className="label">ROOM</span> <span className="code">{s.room}</span></div>
              <button className="btn small" onClick={onCopy}>{copied ? "✓ COPIED" : "📋 COPY CODE"}</button>
              <div className={"partner" + (s.partnerHere ? " active" : "")}>
                {s.partnerHere ? `${s.partnerName || "your partner"} is here` : "waiting for your partner..."}
              </div>
              <button className="btn small leave" onClick={onLeave}>LEAVE</button>
            </div>

            {isHost && (
              <div className="filepick">
                <label htmlFor="file" className="btn primary filebtn">🎬 CHOOSE A MOVIE FILE</label>
                <input id="file" type="file" accept="video/*" hidden onChange={onFile} />
                {s.fileName && <span className="filename">{s.fileName}</span>}
              </div>
            )}

            <div className="videowrap">
              <video ref={videoRef} className="video" controls playsInline />
              {s.hint && <div className="videohint">{s.hint}</div>}
            </div>
          </section>
        )}
      </main>

      <footer className="pagefoot">watch together, purr-fectly in sync 🐾</footer>
    </>
  );
}
