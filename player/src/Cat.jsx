/**
 * @file src/Cat.jsx
 * The hand-built pixel-art cat mascot (ginger), reusable across the UI.
 * Pure SVG rects with crisp edges; the eyelids blink via CSS (.lid animation).
 */
export default function Cat({ className = "cat" }) {
  return (
    <svg className={className} viewBox="0 0 20 18" shapeRendering="crispEdges" aria-hidden="true">
      {/* ears */}
      <rect x="4" y="2" width="2" height="1" fill="#ef7d1a" />
      <rect x="3" y="3" width="4" height="1" fill="#ef7d1a" />
      <rect x="14" y="2" width="2" height="1" fill="#ef7d1a" />
      <rect x="13" y="3" width="4" height="1" fill="#ef7d1a" />
      <rect x="4" y="3" width="1" height="1" fill="#e85d86" />
      <rect x="15" y="3" width="1" height="1" fill="#e85d86" />
      {/* head */}
      <rect x="3" y="4" width="14" height="11" fill="#ef7d1a" />
      {/* forehead stripes */}
      <rect x="7" y="4" width="1" height="2" fill="#d9660a" />
      <rect x="10" y="4" width="1" height="2" fill="#d9660a" />
      <rect x="12" y="4" width="1" height="2" fill="#d9660a" />
      {/* eyes */}
      <rect x="6" y="8" width="2" height="3" fill="#2a2438" />
      <rect x="12" y="8" width="2" height="3" fill="#2a2438" />
      <rect x="6" y="8" width="1" height="1" fill="#fff" />
      <rect x="12" y="8" width="1" height="1" fill="#fff" />
      {/* eyelids (blink) */}
      <rect className="lid" x="6" y="8" width="2" height="3" fill="#ef7d1a" />
      <rect className="lid" x="12" y="8" width="2" height="3" fill="#ef7d1a" />
      {/* nose + mouth */}
      <rect x="9" y="11" width="2" height="1" fill="#e85d86" />
      <rect x="8" y="12" width="1" height="1" fill="#2a2438" />
      <rect x="11" y="12" width="1" height="1" fill="#2a2438" />
      {/* whiskers */}
      <rect x="0" y="8" width="3" height="1" fill="#2a2438" />
      <rect x="0" y="10" width="3" height="1" fill="#2a2438" />
      <rect x="17" y="8" width="3" height="1" fill="#2a2438" />
      <rect x="17" y="10" width="3" height="1" fill="#2a2438" />
    </svg>
  );
}
