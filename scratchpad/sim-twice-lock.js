// Does forcing the quest lock OFF under "same quest failed twice" still leave a
// playable condition? The lock is what supplies the second attempt at the same
// quest; without it you have to randomly redraw one of ~1,136, which in 50 hunts
// is rare. Measure rather than assume.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);

// Current app.js table.
const LEVERS = {
  kill: { both:[1,1], cart:[0.709,0.75], fail:[0.400,0.50], streak:[0.250,0.38], twice:[0.171,0.26] },
  cap: { 1:[4.717,1.60], 2:[1.944,1.35], 3:[1,1], 4:[0.737,0.85], 5:[0.578,0.72], 6:[0.459,0.60] },
  assign: { roll:[1,1], pick:[0.850,0.85] },
  loadout:{ hold:[1,1], cycle:[1.150,1.15], free:[0.850,0.85] },
  quest:  { on:[1,1], off:[0.850,0.85] },
  reviveOn:[0.775,0.82], reviveOnce:[1.060,1.06],
  revivePrice:{5000:[0.94,0.94],10000:[1,1],20000:[1.03,1.03],30000:[1.05,1.05]},
  reviveCap:{1:[1.05,1.05],3:[1.02,1.02],5:[1,1],10:[0.97,0.97],20:[0.94,0.94]},
  rerollOn:[0.860,0.86], rerollPrice:{2500:[0.96,0.96],5000:[1,1],10000:[1.02,1.02],20000:[1.04,1.04]},
};
const legs = (c, i) => {
  const L = LEVERS, out = [ (L.kill[c.kill]||[1,1])[i], (L.cap[c.stylesPerWeapon]||[1,1])[i],
    (L.assign[c.assign]||[1,1])[i], (L.loadout[c.loadout]||[1,1])[i],
    (c.lockQuest ? L.quest.on : L.quest.off)[i] ];
  if (c.reviveEnabled) { out.push(L.reviveOn[i]); if (c.reviveOnce) out.push(L.reviveOnce[i]);
    out.push((L.revivePrice[c.revivePrice]||[1,1])[i]); out.push((L.reviveCap[c.reviveCap]||[1,1])[i]); }
  if (c.rerollEnabled) { out.push(L.rerollOn[i]); out.push((L.rerollPrice[c.rerollPrice]||[1,1])[i]); }
  return out;
};
const product = a => a.reduce((p,x)=>p*x,1);
const multiplier = c => Math.round(product(legs(c,0))*1000)/1000;
const difficulty = c => product(legs(c,1));

const ceilingFor = cap => 14 * Math.min(cap, 6);
const CLEAR_LIMIT = 50, SURVIVOR_BONUS = 1.0;
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// Mirrors app.js: a quest is SPENT ON CLEAR only, so a quest you failed stays in
// the pool and can be drawn again. That is the whole question here.
function simulate(c, env, rng) {
  const ceiling = ceilingFor(c.stylesPerWeapon), m = multiplier(c);
  let losses=0, earned=0, hunts=0, clears=0, streak=0, owed=-1;
  const qf = new Int16Array(QUESTS.length), spent = new Uint8Array(QUESTS.length);
  let live = QUESTS.length;
  while (losses < ceiling && clears < CLEAR_LIMIT && hunts < 4000) {
    hunts++;
    let qi;
    if (c.lockQuest && owed >= 0) qi = owed;
    else { if (live <= 0) break; do { qi = (rng()*QUESTS.length)|0; } while (spent[qi]); }
    owed = -1;
    const cleared = rng() < env.p;
    const carted  = cleared ? rng() < env.cartOnClear : rng() < env.cartOnFail;
    let died = false;
    if (cleared) {
      earned += Math.round(QUESTS[qi].r * m); clears++; streak = 0;
      if (!spent[qi]) { spent[qi] = 1; live--; }
      if (c.kill === "cart" || c.kill === "both") died = carted;
    } else {
      streak++; qf[qi]++; owed = qi;
      if      (c.kill === "both" || c.kill === "fail") died = true;
      else if (c.kill === "cart")   died = carted;
      else if (c.kill === "streak") died = streak >= 2;
      else if (c.kill === "twice")  died = qf[qi] >= 2;
    }
    if (died) losses++;
  }
  const rate = Math.max(0, Math.min(1, (ceiling-losses)/ceiling));
  const bonus = earned > 0 ? Math.round(earned*rate*SURVIVOR_BONUS) : 0;
  return { final: earned+bonus, losses, clears, hunts, wiped: losses>=ceiling };
}
const median = a => a.slice().sort((x,y)=>x-y)[a.length>>1];
function score(c, env, T, seed) {
  const rng = mulberry(seed), rs = new Array(T);
  for (let i=0;i<T;i++) rs[i] = simulate(c, env, rng);
  return { final: median(rs.map(r=>r.final)), losses: median(rs.map(r=>r.losses)),
    clears: median(rs.map(r=>r.clears)), hunts: median(rs.map(r=>r.hunts)),
    wipedPct: rs.filter(r=>r.wiped).length/T,
    finishedPct: rs.filter(r=>r.clears>=CLEAR_LIMIT).length/T };
}
const BASE = { kill:"both", stylesPerWeapon:3, assign:"roll", loadout:"hold",
  lockQuest:true, reviveEnabled:false, reviveOnce:true, reviveCap:5, revivePrice:10000,
  rerollEnabled:false, rerollPrice:5000 };
const ENV = { p:0.72, cartOnClear:0.25, cartOnFail:0.85 };
const of = o => Object.assign({}, BASE, o);
const T = 4000, SEED = 20260810;

const cases = [
  ["reference (kill=both, lock on)",        of({})],
  ["two in a row, lock ON",                 of({kill:"streak"})],
  ["two in a row, lock off",                of({kill:"streak", lockQuest:false})],
  ["same quest twice, lock ON  (as solved)",of({kill:"twice"})],
  ["same quest twice, lock off (proposed)", of({kill:"twice", lockQuest:false})],
];
const ref = score(cases[0][1], ENV, T, SEED).final;
console.log("config".padEnd(42), "median".padEnd(9), "rel", "  deaths  clears  hunts  wiped  finished");
for (const [name, c] of cases) {
  const s = score(c, ENV, T, SEED);
  console.log(name.padEnd(42), (s.final/1e6).toFixed(2)+"M", " ",
    (s.final/ref).toFixed(3), " ", String(s.losses).padStart(5),
    String(s.clears).padStart(7), String(s.hunts).padStart(6),
    (s.wipedPct*100).toFixed(0).padStart(5)+"%", (s.finishedPct*100).toFixed(0).padStart(8)+"%");
}
console.log("\ndisplayed difficulty today:");
console.log("  twice + lock on  ->", difficulty(of({kill:"twice"})).toFixed(3));
console.log("  twice + lock off ->", difficulty(of({kill:"twice", lockQuest:false})).toFixed(3));

// ── Death distribution ──────────────────────────────────────────────────────
{
  const N = 6000;
  const dist = (c) => { const rng = mulberry(SEED), d = [];
    for (let i=0;i<N;i++) d.push(simulate(c, ENV, rng).losses);
    d.sort((a,b)=>a-b); const p = q => d[Math.floor(q*(d.length-1))];
    return { mean:(d.reduce((s,x)=>s+x,0)/d.length).toFixed(2), p10:p(.10), p25:p(.25),
      med:p(.50), p75:p(.75), p90:p(.90),
      zero:(d.filter(x=>x===0).length/d.length*100).toFixed(0)+"%" }; };
  console.log("\ndeaths per 50-clear run".padEnd(30), "mean  p10 p25 med p75 p90    zero-death runs");
  for (const [n,c] of [["two in a row, lock ON", of({kill:"streak"})],
                       ["same quest twice, lock ON", of({kill:"twice"})],
                       ["same quest twice, lock off", of({kill:"twice", lockQuest:false})]]) {
    const s = dist(c);
    console.log(n.padEnd(30), String(s.mean).padStart(4), String(s.p10).padStart(4),
      String(s.p25).padStart(3), String(s.med).padStart(3), String(s.p75).padStart(3),
      String(s.p90).padStart(3), "   ", s.zero);
  }
}
