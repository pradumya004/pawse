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
];

const isVid = (u) => /\.(mp4|webm)$/i.test(u);
const isMedia = (u) => /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i.test(u);

// Local mascot shown first: preloaded in index.html, so it is the fast LCP.
const POSTER = { url: "/meow-poster.webp", title: "Pawse pixel cat", poster: true };

// Reddit's resized webp preview (<= 640px) instead of the multi-MB original.
// GIFs and videos keep the original so they still animate.
function displayUrl(m) {
  if (/\.(gif|mp4|webm)$/i.test(m.url)) return m.url;
  const fit = (m.preview || []).filter((p) => Number(/width=(\d+)/.exec(p)?.[1]) <= 640);
  return fit.length ? fit[fit.length - 1] : m.url;
}

function pickTwo() {
  const a = Math.floor(Math.random() * SUBS.length);
  let b = Math.floor(Math.random() * SUBS.length);
  if (b === a) b = (b + 1) % SUBS.length;
  return [SUBS[a], SUBS[b]];
}

export default function MeowFeed({ caption = "while you wait..." }) {
  const [items, setItems] = useState([POSTER]);
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(false); // fetch finished (success or empty)

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
        .map((m) => ({ url: displayUrl(m), title: m.title, sub: m.subreddit }));
      setItems([POSTER, ...media]);
      setLoaded(true);
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

  // A broken/hotlink-blocked image → drop it and move on (never a blank box).
  const onBroken = (badUrl) => {
    setItems((prev) => prev.filter((x) => x.poster || x.url !== badUrl));
    setI(0);
  };

  const m = items[i];
  return (
    <div className="meow">
      <div className="meowframe">
        {isVid(m.url) ? (
          <video className="meowimg" src={m.url} autoPlay muted loop playsInline />
        ) : (
          <img
            className="meowimg"
            src={m.url}
            alt={m.title || "cat"}
            width="920"
            height="690"
            loading={m.poster ? "eager" : "lazy"}
            fetchpriority={m.poster ? "high" : "auto"}
            onError={() => onBroken(m.url)}
          />
        )}
      </div>
      <div className="meowcap">
        🐾 {loaded && items.length < 2 ? "the cats are napping 😴" : caption}
        {m.sub ? ` · r/${m.sub}` : ""}
      </div>
    </div>
  );
}
