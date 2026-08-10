// DEGENERACY AUDIT — the check that would have caught "same quest failed twice".
//
// Every previous sim compared FINAL SCORE, which the multiplier dominates. So an
// option whose rule did nothing still looked different from its neighbour, purely
// because we paid it differently. The audit then confirmed that ordering against
// the same assumption baked into the weights: self-consistent, and wrong.
//
// This compares GAMEPLAY instead. With revives and rerolls off the multiplier has
// no effect on play at all — it only scales earnings — so the death distribution
// is a pure function of the rules. Two options that produce the same distribution
// ARE the same rule, whatever we choose to pay for them.
//
// Reported per pair: the gap in mean deaths, and the Kolmogorov–Smirnov distance
// between the two death distributions. KS ~0 means indistinguishable.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);

const CLEAR_LIMIT = 50;
const ceilingFor = cap => 14 * Math.min(cap, 6);
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// Gameplay only. No multiplier, no earnings — those are what hid the problem.
function play(c, env, rng) {
  const ceiling = ceilingFor(c.stylesPerWeapon);
  let losses=0, hunts=0, clears=0, streak=0, owed=-1;
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
      clears++; streak = 0;
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
  return { losses, clears, hunts, wiped: losses >= ceiling };
}

const N = 8000, SEED = 20260810;
const ENV = { p: 0.72, cartOnClear: 0.25, cartOnFail: 0.85 };
const BASE = { kill:"both", stylesPerWeapon:3, assign:"roll", loadout:"hold",
  lockQuest:true, reviveEnabled:false, rerollEnabled:false };
const of = o => Object.assign({}, BASE, o);

function profile(c) {
  const rng = mulberry(SEED), d = [], cl = [], hu = []; let wiped = 0;
  for (let i=0;i<N;i++) { const r = play(c, ENV, rng); d.push(r.losses); cl.push(r.clears);
    hu.push(r.hunts); if (r.wiped) wiped++; }
  d.sort((a,b)=>a-b);
  const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
  return { deaths: d, meanDeaths: mean(d), meanClears: mean(cl), meanHunts: mean(hu),
           wipePct: wiped/N };
}
// KS distance between two sorted samples of equal length.
function ks(a, b) {
  const all = [...new Set([...a, ...b])].sort((x,y)=>x-y);
  const cdf = (s, v) => { let lo=0, hi=s.length; while (lo<hi){const m=(lo+hi)>>1;
    if (s[m] <= v) lo=m+1; else hi=m;} return lo/s.length; };
  return Math.max(...all.map(v => Math.abs(cdf(a,v) - cdf(b,v))));
}

const GROUPS = {
  "kill condition": [["carts and failures","both"],["cart","cart"],["quest failed","fail"],
                     ["two in a row","streak"],["same quest twice (RETIRED)","twice"]]
    .map(([n,v]) => [n, of({kill:v})]),
  "kill condition, quest lock OFF": [["carts and failures","both"],["cart","cart"],
      ["quest failed","fail"],["two in a row","streak"],["same quest twice (RETIRED)","twice"]]
    .map(([n,v]) => [n, of({kill:v, lockQuest:false})]),
  "styles per weapon": [1,2,3,4,5,6].map(n => [n+" styles", of({stylesPerWeapon:n})]),
  "quest lock (under kill=fail)":  [["on", of({kill:"fail"})],  ["off", of({kill:"fail",  lockQuest:false})]],
  "quest lock (under kill=both)":  [["on", of({kill:"both"})],  ["off", of({kill:"both",  lockQuest:false})]],
  "quest lock (under kill=cart)":  [["on", of({kill:"cart"})],  ["off", of({kill:"cart",  lockQuest:false})]],
  "quest lock (under kill=streak)":[["on", of({kill:"streak"})],["off", of({kill:"streak",lockQuest:false})]],
};

let flagged = 0;
for (const [group, opts] of Object.entries(GROUPS)) {
  console.log("\n" + group);
  const prof = opts.map(([n,c]) => [n, profile(c)]);
  for (const [n,p] of prof)
    console.log("   " + n.padEnd(28) + "deaths " + p.meanDeaths.toFixed(2).padStart(6) +
      "   clears " + p.meanClears.toFixed(1).padStart(5) +
      "   hunts " + p.meanHunts.toFixed(1).padStart(6) +
      "   wipe " + (p.wipePct*100).toFixed(0).padStart(3) + "%");
  for (let i=0;i<prof.length;i++) for (let j=i+1;j<prof.length;j++) {
    const D = ks(prof[i][1].deaths, prof[j][1].deaths);
    const gap = Math.abs(prof[i][1].meanDeaths - prof[j][1].meanDeaths);
    if (D < 0.02) { flagged++;
      console.log("   !! DEGENERATE: '" + prof[i][0] + "' and '" + prof[j][0] +
        "' are the same rule (KS " + D.toFixed(4) + ", mean deaths differ by " + gap.toFixed(3) + ")"); }
  }
}
console.log("\n" + flagged + " degenerate pair(s) found.");
console.log("Note: loadout and assignment are absent by design — the model treats every");
console.log("combo as equally winnable, so it cannot say anything about which one you hold.");

// ── Is the styles cap degenerate at the top, or only in deaths? ─────────────
// Deaths being equal is not the whole story: the survivor rate divides by the
// ceiling, so a slacker cap banks a bigger bonus off the same play.
{
  console.log("\nstyles cap — deaths vs what actually reaches the score");
  console.log("cap  ceiling  deaths  survivorRate  L = clears x (1+rate)   wipe");
  for (const n of [1,2,3,4,5,6]) {
    const rng = mulberry(SEED); let d=0, cl=0, rate=0, wiped=0;
    const ceiling = ceilingFor(n);
    for (let i=0;i<N;i++) { const r = play(of({stylesPerWeapon:n}), ENV, rng);
      const rt = Math.max(0, Math.min(1, (ceiling-r.losses)/ceiling));
      d+=r.losses; cl+=r.clears; rate+=rt; if (r.wiped) wiped++; }
    console.log(String(n).padStart(2), String(ceiling).padStart(8),
      (d/N).toFixed(2).padStart(8), (rate/N).toFixed(3).padStart(13),
      ((cl/N)*(1+rate/N)).toFixed(1).padStart(18), ((wiped/N)*100).toFixed(0).padStart(9)+"%");
  }
}
