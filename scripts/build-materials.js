// Builds docs/materials.js — every sellable material with its real in-game
// zenny sell price, for pricing revives.
//
//   node scripts/build-materials.js [pathToNativeNX]
//
// Source: nativeNX/table/itemData.itm — magic 6666aa41, u32 count, then
// fixed 44-byte records where the record index IS the item id (verified for
// all 2991 records).
//
// Field offsets were derived empirically:
//   0x00 u32  item id (== record index)
//   0x06 u8   stack size — 99 marks a material, small values mark consumables
//   0x13 u32  SELL price          <- what we want
//   0x17 u32  buy price
//   0x1b u8   material tier, 1..9 roughly by value (0 = not a material)
//
// 0x13 is the sell price and 0x17 the buy price, not the other way round: 0x17
// is exactly 10x 0x13 for 2223 of 2418 priced items, and every exception is a
// *buyable* consumable whose real shop price breaks the ratio (Potion 7/66,
// Nutrients 25/760, Dash Juice 29/293). Unbuyable materials get the flat 10x
// placeholder, which is what you would expect if 0x17 were the buy price.
//
// Item names come from mhgu-editor's items.json — the game files in this dump
// carry no English item GMD.
const fs = require("fs"), path = require("path");

const NATIVE = process.argv[2] ||
  "C:/Users/humph/OneDrive/Documents/MHGU Stuff/nativeNX";
const EDITOR = "C:/Coding Repos/mhgu-editor/src/assets";
const OUT = path.join(__dirname, "..", "docs", "materials.js");

const OFF_STACK = 0x06, OFF_SELL = 0x13, OFF_TIER = 0x1b;
const MATERIAL_STACK = 99;

const itm = path.join(NATIVE, "table/itemData.itm");
if (!fs.existsSync(itm)) {
  console.error("Cannot find " + itm + "\nPass the nativeNX path as an argument.");
  process.exit(1);
}
const b = fs.readFileSync(itm);
if (b.readUInt32LE(0) !== 0x41aa6666) { console.error("ABORT: unexpected magic in itemData.itm"); process.exit(1); }
const count = b.readUInt32LE(4);
const REC = (b.length - 8) / count;
if (!Number.isInteger(REC)) { console.error("ABORT: record size not integral"); process.exit(1); }
const rec = (i) => b.slice(8 + i * REC, 8 + (i + 1) * REC);

// The whole join rests on index == id; refuse to continue if that breaks.
for (let i = 0; i < count; i++) {
  if (rec(i).readUInt32LE(0) !== i) { console.error(`ABORT: record ${i} id mismatch`); process.exit(1); }
}
console.log(`itemData.itm: ${count} records of ${REC} bytes, id==index verified`);

const names = JSON.parse(fs.readFileSync(EDITOR + "/items.json", "utf8"));
const rarity = JSON.parse(fs.readFileSync(EDITOR + "/item_rarity.json", "utf8"));

const mats = [];
for (let i = 1; i < count; i++) {
  const r = rec(i), sellPrice = r.readUInt32LE(OFF_SELL), tier = r[OFF_TIER];
  const name = names[i];
  if (!name || name === "(None)") continue;
  if (r[OFF_STACK] !== MATERIAL_STACK) continue;   // consumables stack lower
  if (!tier) continue;                             // tier 0 = books, ammo, tools
  if (!sellPrice) continue;                        // unsellable
  if (/\[\?\]/.test(name)) continue;               // unidentified ammo variants
  mats.push({ i: i, n: name, v: sellPrice, t: tier, r: rarity[i] || 0 });
}

mats.sort((a, b) => a.v - b.v);
const vals = mats.map(m => m.v);
const p = (q) => vals[Math.floor(vals.length * q)];

// Sanity gates.
if (mats.length < 800) { console.error(`ABORT: only ${mats.length} materials found`); process.exit(1); }
if (vals[0] < 1 || vals[vals.length - 1] > 200000) { console.error("ABORT: implausible value range"); process.exit(1); }

fs.writeFileSync(OUT, "window.MHGU_MATERIALS = " + JSON.stringify(mats) + ";\n");
console.log(`wrote ${OUT}`);
console.log(`  ${mats.length} sellable materials`);
console.log(`  value  min ${vals[0]}  p25 ${p(.25)}  median ${p(.5)}  p75 ${p(.75)}  p95 ${p(.95)}  max ${vals[vals.length-1]}`);
console.log(`  cheapest: ${mats.slice(0,3).map(m => m.n+" "+m.v+"z").join(", ")}`);
console.log(`  dearest:  ${mats.slice(-3).map(m => m.n+" "+m.v+"z").join(", ")}`);
console.log("Remember to bump ?v= on materials.js in docs/index.html.");
