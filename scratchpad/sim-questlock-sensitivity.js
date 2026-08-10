// What is the quest lock actually worth?
//
// The degeneracy audit says: nothing measurable. That is because the model gives
// every quest the same win chance, so a forced retry is the same draw as a fresh
// quest. Reality is not so tidy, and it is not one-sided either:
//
//   selection  the quest that beat you is probably harder than average FOR YOU,
//              which pushes the retry win rate DOWN
//   learning   you have now seen the fight and can re-prep for it, which pushes
//              the retry win rate UP
//
// Nobody knows the net. So instead of guessing one number, sweep it: give the
// retry its own win rate and see what the lock is worth across the whole range.
// That turns "unmeasurable" into "bounded", which is the most honest thing
// available without real player data.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);

const CLEAR_LIMIT = 50;
const ceilingFor = cap => 14 * Math.min(cap, 6);
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function play(c, env, rng) {
  const ceiling = ceilingFor(c.stylesPerWeapon);
  let losses=0, hunts=0, clears=0, streak=0, owed=-1;
  const spent = new Uint8Array(QUESTS.length);
  let live = QUESTS.length;
  while (losses < ceiling && clears < CLEAR_LIMIT && hunts < 4000) {
    hunts++;
    let qi, isRetry = false;
    if (c.lockQuest && owed >= 0) { qi = owed; isRetry = true; }
    else { if (live <= 0) break; do { qi = (rng()*QUESTS.length)|0; } while (spent[qi]); }
    owed = -1;
    // The whole point of this script: a retry is not the same coin as a fresh quest.
    const p = isRetry ? env.pRetry : env.p;
    const cleared = rng() < p;
    const carted  = cleared ? rng() < env.cartOnClear : rng() < env.cartOnFail;
    let died = false;
    if (cleared) {
      clears++; streak = 0;
      if (!spent[qi]) { spent[qi] = 1; live--; }
      if (c.kill === "cart" || c.kill === "both") died = carted;
    } else {
      streak++; owed = qi;
      if      (c.kill === "both" || c.kill === "fail") died = true;
      else if (c.kill === "cart")   died = carted;
      else if (c.kill === "streak") died = streak >= 2;
    }
    if (died) losses++;
  }
  const rate = Math.max(0, Math.min(1, (ceiling-losses)/ceiling));
  return { losses, clears, hunts, rate, L: clears * (1 + rate) };
}

const N = 8000, SEED = 20260810;
const BASE = { kill:"both", stylesPerWeapon:3, lockQuest:true };
const of = o => Object.assign({}, BASE, o);
const mean = (c, env, key) => { const rng = mulberry(SEED); let t = 0;
  for (let i=0;i<N;i++) t += play(c, env, rng)[key]; return t/N; };

console.log("The lock only binds after a failure, so its bite scales with how often");
console.log("you fail. p = 0.72 for a fresh quest throughout.\n");

for (const kill of ["both", "fail", "streak"]) {
  console.log("kill = " + kill);
  console.log("  retry p   deaths(lock)  deaths(free)   L(lock)  L(free)   lock is worth");
  for (const pRetry of [0.50, 0.60, 0.65, 0.72, 0.80, 0.90]) {
    const env = { p:0.72, pRetry, cartOnClear:0.25, cartOnFail:0.85 };
    const envFree = { p:0.72, pRetry:0.72, cartOnClear:0.25, cartOnFail:0.85 };
    const dLock = mean(of({kill}), env, "losses");
    const dFree = mean(of({kill, lockQuest:false}), envFree, "losses");
    const lLock = mean(of({kill}), env, "L");
    const lFree = mean(of({kill, lockQuest:false}), envFree, "L");
    const worth = lLock / lFree;
    const tag = pRetry === 0.72 ? "   <- what the model assumes today" : "";
    console.log("   " + pRetry.toFixed(2) + "      " + dLock.toFixed(2).padStart(7) +
      "      " + dFree.toFixed(2).padStart(7) + "   " + lLock.toFixed(1).padStart(7) +
      "  " + lFree.toFixed(1).padStart(7) + "     " + worth.toFixed(3) + tag);
  }
  console.log("");
}
console.log("Read the last column as: how much the run is worth WITH the lock relative");
console.log("to without it. The app currently pays 0.850 for turning the lock OFF, i.e.");
console.log("it assumes the lock is worth about 1/0.85 = 1.18x. Compare.");
