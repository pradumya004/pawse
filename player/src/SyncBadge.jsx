/**
 * @file src/SyncBadge.jsx
 * Live readout of the measured gap to the partner (from PawseClient's ticks).
 */
import { useEffect, useState } from "react";

const FRESH_MS = 3000;

export default function SyncBadge({ sync, on, partnerName }) {
  // re-render once a second so a stale reading ages out after a pause
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const who = partnerName || "your partner";
  const rtt = sync?.rtt != null ? ` · relay round trip ${Math.round(sync.rtt)} ms` : "";
  let level = "idle";
  let text = "SYNC READY";
  let title = `starts measuring when you both press play${rtt}`;

  if (!on) {
    text = "SYNC OFF";
    title = "drift correction disabled (?sync=off)";
  } else if (sync?.error != null && Date.now() - sync.at < FRESH_MS) {
    const ms = Math.round(sync.error * 1000);
    level = ms <= 50 ? "good" : ms <= 400 ? "fix" : "bad";
    text = level === "good" ? `IN SYNC ${ms}MS` : `CATCHING UP ${ms}MS`;
    title = `gap to ${who}, measured every second${rtt}`;
  }

  return (
    <span className={`syncbadge ${level}`} title={title} aria-live="polite">
      <span className="syncdot" />
      {text}
    </span>
  );
}
