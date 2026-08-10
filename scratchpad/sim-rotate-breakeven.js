// What is "Changes each quest" actually worth, and what are we betting on?
//
// The simulator treats every combo as equally winnable, so `rotate` has NO
// gameplay effect in it — see LEVER PLACEHOLDER in app.js. Its score therefore
// scales exactly linearly with whatever weight we hand it, and no amount of
// simulating can tell us whether that weight is fair. Asking the model to price
// it is the same mistake that let "same quest failed twice" survive.
//
// So ask a question the model CAN answer. The bet behind paying rotate extra is
// that always being on an unfamiliar weapon makes you worse. Give that a number:
// let rotate players clear at a lower rate than everyone else, and find the rate
// at which the extra weight is exactly paid for. Below that break-even the
// setting is genuinely harder than it pays; above it, it is an advantage.
//
// That converts an unmeasurable into a stated bet, which is the honest form.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);

const CLEAR_LIMIT = 50, SURVIVOR_BONUS = 1.0;
const ceilingFor = cap => 14 * Math.min(cap, 6);
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// Only the levers that matter here; the rest are held at the reference.
function simulate(cfg, env, rng) {
  const ceiling = ceilingFor(3), m = cfg.mult;
  let losses=0, earned=0, hunts=0, clears=0, streak=0, owed=-1;
  const spent = new Uint8Array(QUESTS.length); let live = QUESTS.length;
  while (losses < ceiling && clears < CLEAR_LIMIT && hunts < 4000) {
    hunts++;
    let qi;
    if (owed >= 0) qi = owed;                       // quest lock on, as the reference has it
    else { if (live <= 0) break; do { qi = (rng()*QUESTS.length)|0; } while (spent[qi]); }
    owed = -1;
    const cleared = rng() < env.p;
    const carted  = cleared ? rng() < env.cartOnClear : rng() < env.cartOnFail;
    let died = false;
    if (cleared) { earned += Math.round(QUESTS[qi].r * m); clears++; streak = 0;
      if (!spent[qi]) { spent[qi] = 1; live--; }
      died = carted;                                 // kill = both
    } else { streak++; owed = qi; died = true; }
    if (died) losses++;
  }
  const rate = Math.max(0, Math.min(1, (ceiling-losses)/ceiling));
  return earned + (earned > 0 ? Math.round(earned*rate*SURVIVOR_BONUS) : 0);
}
const median = a => a.slice().sort((x,y)=>x-y)[a.length>>1];
const score = (mult, p, T, seed) => { const rng = mulberry(seed), rs = [];
  for (let i=0;i<T;i++) rs.push(simulate({mult}, {p, cartOnClear:0.25, cartOnFail:0.85}, rng));
  return median(rs); };

const T = 6000, SEED = 20260810, P0 = 0.72;
const base = score(1.00, P0, T, SEED);

console.log("Reference (Until it falls, clear rate " + P0 + "): " + (base/1e6).toFixed(3) + "M\n");
console.log("First, confirm the model really is blind to this lever —");
console.log("score should track the weight exactly, with no length effect of its own:\n");
console.log("  weight   median      vs reference");
for (const w of [1.00, 1.15, 1.30, 1.35, 1.40, 1.50]) {
  const s = score(w, P0, T, SEED);
  console.log("   " + w.toFixed(2) + "    " + (s/1e6).toFixed(3) + "M       " +
    (s/base).toFixed(3) + "x");
}

console.log("\nNow the bet. If always changing weapons costs you clear rate, where does");
console.log("each weight break even against just holding one combo?\n");
console.log("  weight   break-even clear rate   i.e. you must be this much worse");
for (const w of [1.15, 1.30, 1.35, 1.40, 1.50]) {
  let lo = 0.30, hi = P0, mid = 0;
  for (let i = 0; i < 26; i++) {                     // bisect on p
    mid = (lo + hi) / 2;
    if (score(w, mid, 2500, SEED) > base) hi = mid; else lo = mid;
  }
  const pp = (P0 - mid) * 100;
  console.log("   " + w.toFixed(2) + "        " + mid.toFixed(3) +
    "                 " + pp.toFixed(1) + " points of clear rate" +
    (pp < 3 ? "   <- cheap bet" : pp > 8 ? "   <- steep" : ""));
}
console.log("\nRead it as: at that clear rate the setting is exactly break-even. Clear");
console.log("better than that and it is a net advantage; worse and it costs you.");
