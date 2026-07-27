/**
 * @file scripts/make-icons.js
 * Generates the extension's PNG icons (16/48/128) from the pixel-cat art, with
 * ZERO dependencies — a tiny hand-rolled PNG encoder (Node's built-in zlib does
 * the compression). Run: `node scripts/make-icons.js` (from extension/).
 *
 * The cat is defined as rects on a 20x18 grid (same art as popup Cat.jsx),
 * rasterized nearest-neighbor into each square icon on a cream background.
 */
const zlib = require("node:zlib");
const { writeFileSync, mkdirSync } = require("node:fs");

const BG = "#f4ecd8"; // cream
// [x, y, w, h, hex] — mirrors the SVG cat.
const RECTS = [
  [4, 2, 2, 1, "#ef7d1a"], [3, 3, 4, 1, "#ef7d1a"],
  [14, 2, 2, 1, "#ef7d1a"], [13, 3, 4, 1, "#ef7d1a"],
  [4, 3, 1, 1, "#e85d86"], [15, 3, 1, 1, "#e85d86"],
  [3, 4, 14, 11, "#ef7d1a"],
  [7, 4, 1, 2, "#d9660a"], [10, 4, 1, 2, "#d9660a"], [12, 4, 1, 2, "#d9660a"],
  [6, 8, 2, 3, "#2a2438"], [12, 8, 2, 3, "#2a2438"],
  [6, 8, 1, 1, "#ffffff"], [12, 8, 1, 1, "#ffffff"],
  [9, 11, 2, 1, "#e85d86"], [8, 12, 1, 1, "#2a2438"], [11, 12, 1, 1, "#2a2438"],
  [0, 8, 3, 1, "#2a2438"], [0, 10, 3, 1, "#2a2438"],
  [17, 8, 3, 1, "#2a2438"], [17, 10, 3, 1, "#2a2438"],
];
const GW = 20, GH = 18;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Paint the rects into a 20x18 grid of [r,g,b]; null cells fall back to bg. */
function buildGrid() {
  const grid = Array.from({ length: GH }, () => Array(GW).fill(null));
  for (const [x, y, w, h, c] of RECTS) {
    const rgb = hex(c);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (yy >= 0 && yy < GH && xx >= 0 && xx < GW) grid[yy][xx] = rgb;
    }
  }
  return grid;
}

/** Rasterize the grid into an NxN RGBA buffer (nearest-neighbor, cream bg). */
function raster(N, grid) {
  const bg = hex(BG);
  const scale = N / GW;
  const offY = Math.round((N - GH * scale) / 2);
  const buf = Buffer.alloc(N * N * 4);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const ax = Math.floor(px / scale);
      const ay = Math.floor((py - offY) / scale);
      const cell = ay >= 0 && ay < GH && ax >= 0 && ax < GW ? grid[ay][ax] : null;
      const [r, g, b] = cell || bg;
      const i = (py * N + px) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
  return buf;
}

// --- minimal PNG encoder ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crc]);
}

function png(N, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = N * 4 + 1;
  const raw = Buffer.alloc(stride * N);
  for (let y = 0; y < N; y++) rgba.copy(raw, y * stride + 1, y * N * 4, y * N * 4 + N * 4);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- generate ---
mkdirSync("icons", { recursive: true });
const grid = buildGrid();
for (const N of [16, 48, 128]) {
  writeFileSync(`icons/icon${N}.png`, png(N, raster(N, grid)));
  console.log(`wrote icons/icon${N}.png`);
}
