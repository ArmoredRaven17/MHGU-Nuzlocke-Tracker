// Builds docs/data.js — the quest list, with each quest's in-game zenny reward.
//
//   node scripts/build-data.js [pathToNativeNX]
//
// Two sources:
//   1. The Randomizer's docs/data.js — quest list, type, level, target, Prowler flag.
//   2. Extracted MHGU game files (nativeNX) — the reward money, which exists in no
//      other dataset. Quest pages on the wikis don't carry it either.
//
// Game file layout:
//   loc/arc/quest/qNNNNNNN.arc          one Capcom ARC per quest, containing:
//     eng\quest\questData\..._eng       GMD text; string[0] is the quest name
//     loc\quest\questData\questData_N   369-byte struct; reward is u32 LE at 0x39
//
// Field offsets in that struct were derived empirically, not from a spec: 0x39 is
// the only u32 whose values are round, populated across all 1849 quests, and rise
// monotonically with rank (including the Low->High Rank reset at Village 7 / Hub 4).
// 0x41 is the contract fee, 0x3d a secondary reward.
const fs = require("fs"), path = require("path"), zlib = require("zlib");

const NATIVE = process.argv[2] ||
  "C:/Users/humph/OneDrive/Documents/MHGU Stuff/nativeNX";
const RANDOMIZER = "C:/Coding Repos/MHGU Quest Randomizer/docs/data.js";
const OUT = path.join(__dirname, "..", "docs", "data.js");

const OFF_REWARD = 0x39, OFF_FEE = 0x41;

// ── Capcom ARC ────────────────────────────────────────────────────────────
// "ARC\0", u16 version, u16 fileCount, u32 pad, then 80-byte entries:
// 64-byte path, u32 typeHash, u32 compSize, u32 decompSize|flags, u32 offset.
function readArc(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 3) !== "ARC") return null;
  const count = b.readUInt16LE(6), out = [];
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 80;
    out.push({
      name: b.toString("ascii", o, o + 64).replace(/\0.*$/, ""),
      compSize: b.readUInt32LE(o + 68),
      offset: b.readUInt32LE(o + 76),
      buf: b,
    });
  }
  return out;
}
const inflate = (e) => {
  try { return zlib.inflateSync(e.buf.slice(e.offset, e.offset + e.compSize)); }
  catch { return null; }
};

// GMD (MT Framework text): header at 0x20 holds the size of the trailing
// null-separated string blob. string[0] is the quest name.
function gmdStrings(buf) {
  if (buf.toString("ascii", 0, 3) !== "GMD") return null;
  const blob = buf.slice(buf.length - buf.readUInt32LE(0x20));
  return blob.toString("utf8").split("\0").filter(Boolean);
}

// ── Pull name + reward for every quest in the game files ──────────────────
const arcDir = path.join(NATIVE, "loc/arc/quest");
if (!fs.existsSync(arcDir)) {
  console.error("Cannot find " + arcDir + "\nPass the nativeNX path as an argument.");
  process.exit(1);
}
const game = [];
for (const f of fs.readdirSync(arcDir).filter(f => /^q\d+\.arc$/.test(f)).sort()) {
  const entries = readArc(path.join(arcDir, f));
  if (!entries) continue;
  const engE = entries.find(e => /^eng\\.*_eng$/.test(e.name));
  const strE = entries.find(e => /^loc\\quest\\questData\\questData_\d+$/.test(e.name));
  if (!engE || !strE) continue;
  const gmd = inflate(engE), st = inflate(strE);
  if (!gmd || !st || st.length < OFF_FEE + 4) continue;
  const s = gmdStrings(gmd);
  if (!s || !s.length) continue;
  game.push({
    id: parseInt(f.match(/q(\d+)\.arc/)[1], 10),
    name: s[0].trim(),
    reward: st.readUInt32LE(OFF_REWARD),
    fee: st.readUInt32LE(OFF_FEE),
  });
}
console.log("game quests read:", game.length);

// ── Randomizer quest list ─────────────────────────────────────────────────
global.window = {};
eval(fs.readFileSync(RANDOMIZER, "utf8"));
const quests = window.MHGU_DATA.quests;
console.log("randomizer quests:", quests.length);

// ── Join on name ──────────────────────────────────────────────────────────
// Randomizer names are "Village 1★ // Find the Ferns"; the game stores the bare
// title. Some titles are reused across ranks, so where a name is ambiguous the
// quest id's rank prefix decides — that mapping is learned from the names that
// matched 1:1 rather than hardcoded.
const norm = s => s.toLowerCase().replace(/\s+/g, " ").replace(/[’']/g, "'").trim();
const bare = n => { const i = n.indexOf("//"); return norm(i >= 0 ? n.slice(i + 2) : n); };
const prefixOf = id => id >= 1000000 ? Math.floor(id / 1000) : Math.floor(id / 100);

const byName = new Map();
game.forEach(r => {
  const k = norm(r.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(r);
});

const learn = new Map();
quests.forEach(q => {
  const hits = byName.get(bare(q.Name));
  if (!hits || hits.length !== 1) return;
  const p = prefixOf(hits[0].id), k = q.Type + "|" + q.Level;
  if (!learn.has(p)) learn.set(p, new Map());
  learn.get(p).set(k, (learn.get(p).get(k) || 0) + 1);
});
const prefixTo = new Map();
for (const [p, counts] of learn) {
  prefixTo.set(p, [...counts].sort((a, b) => b[1] - a[1])[0][0]);
}

let direct = 0, viaPrefix = 0, viaMedian = 0, unmatched = 0;
const slim = quests.map(q => {
  const o = { t: q.Type, n: q.Name, l: q.Level };
  if (q.Monster) o.m = q.Monster;
  else if (q.Monsters && q.Monsters.length) o.m = q.Monsters[0];
  if (q.Monsters && q.Monsters.length > 1) o.ms = q.Monsters;
  if (q.Locale) o.loc = q.Locale;
  if (q.Prowler) o.p = 1;

  const hits = byName.get(bare(q.Name));
  let r = null;
  if (!hits) unmatched++;
  else if (hits.length === 1) { r = hits[0]; direct++; }
  else {
    const want = q.Type + "|" + q.Level;
    const m = hits.filter(h => prefixTo.get(prefixOf(h.id)) === want);
    if (m.length) { r = m[0]; viaPrefix++; }
    else { const s = [...hits].sort((a, b) => a.reward - b.reward); r = s[s.length >> 1]; viaMedian++; }
  }
  if (r) { o.r = r.reward; o.fee = r.fee; }
  return o;
});
console.log(`matched: ${direct} direct, ${viaPrefix} by rank prefix, ${viaMedian} by median, ${unmatched} unmatched`);

// ── Sanity gates — fail loudly rather than shipping bad numbers ───────────
const missing = slim.filter(q => q.r == null).length;
const zero = slim.filter(q => q.r === 0).length;
if (missing || zero) { console.error(`ABORT: ${missing} without a reward, ${zero} at zero`); process.exit(1); }

// Every reward should be a multiple of 300 except the Prowler-quest bucket,
// which pays its own (lower, non-300-aligned) scale.
const odd = slim.filter(q => q.r % 300 !== 0 && !q.p);
if (odd.length) {
  console.error("ABORT: non-Prowler quests with unexpected reward:",
    odd.slice(0, 5).map(q => q.n + "=" + q.r));
  process.exit(1);
}

fs.writeFileSync(OUT, "window.MHGU_QUESTS = " + JSON.stringify(slim) + ";\n");
const r = slim.map(q => q.r);
console.log(`wrote ${OUT} — ${slim.length} quests, rewards ${Math.min(...r)}–${Math.max(...r)}z`);
console.log("Remember to bump ?v= on data.js in docs/index.html.");
