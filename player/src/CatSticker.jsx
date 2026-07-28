/**
 * @file src/CatSticker.jsx
 * Cute pixel-cat stickers (same crisp style + palette as the mascot).
 * Variants change the eyes so the little cats have personality:
 *   happy (default) · love (heart eyes) · sleep (closed ^^) · wink
 * Used as decorative stickers around the lobby and as the card's hero.
 */
const GINGER = "#ef7d1a";
const DEEP = "#d9660a";
const INK = "#2a2438";
const PINK = "#e85d86";

// a tiny 3px-wide pixel heart at (x,y)
function Heart({ x, y }) {
  return (
    <>
      <rect x={x} y={y} width="1" height="1" fill={PINK} />
      <rect x={x + 2} y={y} width="1" height="1" fill={PINK} />
      <rect x={x} y={y + 1} width="3" height="1" fill={PINK} />
      <rect x={x + 1} y={y + 2} width="1" height="1" fill={PINK} />
    </>
  );
}

export default function CatSticker({ variant = "happy", className = "catsticker" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 18"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* ears */}
      <rect x="4" y="2" width="2" height="1" fill={GINGER} />
      <rect x="3" y="3" width="4" height="1" fill={GINGER} />
      <rect x="14" y="2" width="2" height="1" fill={GINGER} />
      <rect x="13" y="3" width="4" height="1" fill={GINGER} />
      <rect x="4" y="3" width="1" height="1" fill={PINK} />
      <rect x="15" y="3" width="1" height="1" fill={PINK} />
      {/* head */}
      <rect x="3" y="4" width="14" height="11" fill={GINGER} />
      {/* forehead stripes */}
      <rect x="7" y="4" width="1" height="2" fill={DEEP} />
      <rect x="10" y="4" width="1" height="2" fill={DEEP} />
      <rect x="12" y="4" width="1" height="2" fill={DEEP} />

      {/* eyes — vary by mood */}
      {variant === "love" ? (
        <>
          <Heart x={5} y={8} />
          <Heart x={12} y={8} />
        </>
      ) : variant === "sleep" ? (
        <>
          {/* closed happy eyes */}
          <rect x="6" y="9" width="2" height="1" fill={INK} />
          <rect x="5" y="8" width="1" height="1" fill={INK} />
          <rect x="8" y="8" width="1" height="1" fill={INK} />
          <rect x="12" y="9" width="2" height="1" fill={INK} />
          <rect x="11" y="8" width="1" height="1" fill={INK} />
          <rect x="14" y="8" width="1" height="1" fill={INK} />
        </>
      ) : variant === "wink" ? (
        <>
          <rect x="6" y="9" width="2" height="1" fill={INK} />
          <rect x="12" y="8" width="2" height="3" fill={INK} />
          <rect x="12" y="8" width="1" height="1" fill="#fff" />
        </>
      ) : (
        <>
          <rect x="6" y="8" width="2" height="3" fill={INK} />
          <rect x="12" y="8" width="2" height="3" fill={INK} />
          <rect x="6" y="8" width="1" height="1" fill="#fff" />
          <rect x="12" y="8" width="1" height="1" fill="#fff" />
        </>
      )}

      {/* blush */}
      <rect x="4" y="11" width="2" height="1" fill={PINK} opacity="0.55" />
      <rect x="14" y="11" width="2" height="1" fill={PINK} opacity="0.55" />
      {/* nose + mouth */}
      <rect x="9" y="11" width="2" height="1" fill={PINK} />
      <rect x="8" y="12" width="1" height="1" fill={INK} />
      <rect x="11" y="12" width="1" height="1" fill={INK} />
      {/* whiskers */}
      <rect x="0" y="8" width="3" height="1" fill={INK} />
      <rect x="0" y="10" width="3" height="1" fill={INK} />
      <rect x="17" y="8" width="3" height="1" fill={INK} />
      <rect x="17" y="10" width="3" height="1" fill={INK} />
    </svg>
  );
}
