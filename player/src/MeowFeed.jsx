/**
 * @file src/MeowFeed.jsx
 * The "Meow Feed" — a rotating stream of fresh cat content (images, GIFs, and
 * videos) to keep the waiting moments cute. Pulls from several cat subreddits
 * via meme-api.com (which proxies Reddit + adds CORS). Degrades gracefully.
 */
import { useEffect, useState } from "react";

// The good stuff. We pull from a couple of these at random each load.
const SUBS = [
  "Catmemes",
  "funnycats",
  "sillycats",
  "CatReacts",
  "WhatsWrongWithYourCat",
  "WhyCatHowCat",
  "cats",
  "catpics",
];

const isVid = (u) => /\.(mp4|webm)$/i.test(u);
const isMedia = (u) => /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i.test(u);

function pickTwo() {
  const a = Math.floor(Math.random() * SUBS.length);
  let b = Math.floor(Math.random() * SUBS.length);
  if (b === a) b = (b + 1) % SUBS.length;
  return [SUBS[a], SUBS[b]];
}

export default function MeowFeed({ caption = "while you wait..." }) {
  const [items, setItems] = useState([]);
  const [i, setI] = useState(0);

  // Fetch a batch from two random cat subreddits.
  useEffect(() => {
    let alive = true;
    Promise.all(
      pickTwo().map((sub) =>
        fetch(`https://meme-api.com/gimme/${sub}/25`)
          .then((r) => r.json())
          .catch(() => ({ memes: [] })),
      ),
    ).then((results) => {
      if (!alive) return;
      const media = results
        .flatMap((d) => d.memes || [])
        .filter((m) => m && m.url && !m.nsfw && isMedia(m.url))
        .map((m) => ({ url: m.url, title: m.title, sub: m.subreddit }));
      setItems(media);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Rotate through them.
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 5000);
    return () => clearInterval(t);
  }, [items]);

  if (!items.length) {
    return (
      <div className="meow">
        <div className="meowframe meowempty">
          =^･ ⩊ ･^=<br />loading cats…
        </div>
        <div className="meowcap">{caption}</div>
      </div>
    );
  }

  const m = items[i];
  return (
    <div className="meow">
      <div className="meowframe">
        {isVid(m.url) ? (
          <video className="meowimg" src={m.url} autoPlay muted loop playsInline />
        ) : (
          <img className="meowimg" src={m.url} alt={m.title || "cat"} loading="lazy" />
        )}
      </div>
      <div className="meowcap">🐾 {caption}{m.sub ? ` · r/${m.sub}` : ""}</div>
    </div>
  );
}
