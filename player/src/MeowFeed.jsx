/**
 * @file src/MeowFeed.jsx
 * The "Meow Feed" — a rotating stream of fresh cat memes to keep the waiting
 * moments cute (lobby, waiting for partner, during a file transfer).
 *
 * Source: meme-api.com proxies Reddit's cat subreddits and adds CORS, so we can
 * fetch it straight from the browser (Reddit's own API blocks cross-origin).
 * If it's unreachable, we degrade gracefully to a cute placeholder.
 */
import { useEffect, useState } from "react";

const SUBS = ["catmemes", "cats", "catpics", "IllegallySmolCats"];

export default function MeowFeed({ caption = "while you wait..." }) {
  const [memes, setMemes] = useState([]);
  const [i, setI] = useState(0);

  // Fetch a batch of cat memes once.
  useEffect(() => {
    const sub = SUBS[Math.floor((Date.now() / 60000) % SUBS.length)];
    let alive = true;
    fetch(`https://meme-api.com/gimme/${sub}/30`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const urls = (d.memes || [])
          .filter((m) => m && m.url && !m.nsfw && /\.(jpg|jpeg|png|gif)$/i.test(m.url))
          .map((m) => ({ url: m.url, title: m.title }));
        setMemes(urls);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Rotate through them.
  useEffect(() => {
    if (memes.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % memes.length), 4500);
    return () => clearInterval(t);
  }, [memes]);

  if (!memes.length) {
    return (
      <div className="meow">
        <div className="meowframe meowempty">=^• ⩊ •^=</div>
        <div className="meowcap">{caption}</div>
      </div>
    );
  }

  const m = memes[i];
  return (
    <div className="meow">
      <div className="meowframe">
        <img src={m.url} alt={m.title || "cat meme"} className="meowimg" />
      </div>
      <div className="meowcap">🐾 {caption}</div>
    </div>
  );
}
