/**
 * @file scripts/package-extension.cjs
 * Packages extension/ into a Chrome-Web-Store-ready .zip with ZERO deps and
 * proper FORWARD-SLASH paths (PowerShell's Compress-Archive uses backslashes,
 * which the Web Store rejects). Stored (uncompressed) entries — simplest, valid.
 *
 * Run from repo root: `node scripts/package-extension.cjs`
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const SRC = path.join(__dirname, "..", "extension");
const OUT_DIR = path.join(__dirname, "..", "build");
const version = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8")).version;
const OUT = path.join(OUT_DIR, `pawse-extension-v${version}.zip`);

// --- collect files (skip dev-only + junk) ---
const SKIP = new Set(["scripts", ".DS_Store", "Thumbs.db"]);
function walk(dir, base = "") {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name; // forward slashes always
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, data: fs.readFileSync(full) });
  }
  return out;
}

// --- crc32 ---
const CRCT = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- minimal ZIP writer (stored, method 0) ---
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n >>> 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

const files = walk(SRC);
const locals = [];
const centrals = [];
let offset = 0;

for (const f of files) {
  const name = Buffer.from(f.rel, "utf8");
  const crc = crc32(f.data);
  const size = f.data.length;
  const local = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
    u32(crc), u32(size), u32(size), u16(name.length), u16(0), name, f.data,
  ]);
  locals.push(local);
  centrals.push(Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
    u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0),
    u32(0), u32(offset), name,
  ]));
  offset += local.length;
}

const centralBuf = Buffer.concat(centrals);
const eocd = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
  u32(centralBuf.length), u32(offset), u16(0),
]);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([...locals, centralBuf, eocd]));
console.log(`✓ ${OUT}`);
console.log(`  ${files.length} files:`);
for (const f of files) console.log(`    ${f.rel}`);
// sanity: zlib can inflate our own crc? just report size
console.log(`  size: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
void zlib; // (reserved if we switch to deflate later)
