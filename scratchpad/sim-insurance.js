// What is Insurance worth? Same unified player model as sim-player.js -- a cart
// probability per combo, a hunt runs until you clear, cart out, or fail some
// other way -- with the cart limit as the one thing that moves.
//
// The interesting part is that the answer is not one number. Insurance buys the
// QUEST back, never the weapon: under `cart` or `both` the combo is already dead
// from the first cart, so the extra cart cannot save it. Under `fail` and
// `streak` the combo only dies when the quest is lost, so an extra cart is
// exactly a life. A single weight cannot say both.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);

const WEAPONS = 14, STYLES = 6, CLEAR_LIMIT = 50;
const T_RATE = 0.05;

function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const gauss = (rng) => { let u=0,v=0; while(!u) u=rng(); while(!v) v=rng();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
const clearRate = (q, lim) => (1 - Math.pow(q, lim)) * (1 - T_RATE);

function makeProfile(targetClear, breadth, cap, rng) {
  const wSkill = Array.from({length:WEAPONS}, () => gauss(rng) * breadth);
  const sSkill = Array.from({length:STYLES},  () => gauss(rng) * breadth * 0.4);
  const p = [];
  for (let w=0; w<WEAPONS; w++) for (let s=0; s<cap; s++)
    p.push({ raw: wSkill[w] + sSkill[s] + gauss(rng) * breadth * 0.25 });
  // Solved against the BASELINE limit of 3, so the profiles are the same players
  // in both arms and Insurance is the only thing that differs.
  let lo = -8, hi = 8;
  for (let i=0;i<80;i++) {
    const mid = (lo+hi)/2;
    const m = p.reduce((t,c) => t + clearRate(1/(1+Math.exp(-(c.raw+mid))), 3), 0) / p.length;
    if (m > targetClear) lo = mid; else hi = mid;
  }
  const shift = (lo+hi)/2;
  p.forEach(c => { c.q = 1/(1+Math.exp(-(c.raw+shift))); });
  return p;
}

function hunt(q, lim, rng) {
  let carts = 0;
  while (carts < lim && rng() < q) carts++;
  if (carts >= lim) return { cleared: false, carts };
  if (rng() < T_RATE) return { cleared: false, carts };
  return { cleared: true, carts };
}

function simulate(profile, kill, lim, rng) {
  const alive = profile.map(() => true);
  const ceiling = profile.length;
  let losses=0, hunts=0, clears=0, streak=0, owed=-1, cur=-1;
  const spent = new Uint8Array(QUESTS.length); let live = QUESTS.length;
  while (losses < ceiling && clears < CLEAR_LIMIT && hunts < 4000) {
    const opts = []; for (let i=0;i<alive.length;i++) if (alive[i]) opts.push(i);
    if (!opts.length) break;
    if (cur < 0 || !alive[cur]) cur = opts[(rng()*opts.length)|0];
    hunts++;
    let qi;
    if (owed >= 0) qi = owed;
    else { if (live <= 0) break; do { qi = (rng()*QUESTS.length)|0; } while (spent[qi]); }
    owed = -1;
    const h = hunt(profile[cur].q, lim, rng);
    let died = false;
    if (h.cleared) { clears++; streak = 0;
      if (!spent[qi]) { spent[qi]=1; live--; }
      if (kill === "both" || kill === "cart") died = h.carts > 0;
    } else { streak++; owed = qi;
      if (kill === "both" || kill === "fail") died = true;
      else if (kill === "cart")   died = h.carts > 0;
      else if (kill === "streak") died = streak >= 2; }
    if (died) { alive[cur] = false; losses++; cur = -1; }
  }
  const rate = Math.max(0, Math.min(1, (ceiling-losses)/ceiling));
  return { clears, losses, L: clears * (1 + rate) };
}

const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const N = 700, CAP = 3;
const SKILLS = [["weak",0.60],["typical",0.72],["strong",0.85]];
const BREADTHS = [["generalist",0.35],["mixed",0.9],["specialist",1.8]];
const SEEDS = [11,23,37,51,67,83];

function measure(kill, lim) {
  const v = [];
  for (const [,tc] of SKILLS) for (const [,b] of BREADTHS) for (const sd of SEEDS) {
    const rng = mulberry(sd), prof = makeProfile(tc, b, CAP, rng), rs = [];
    for (let i=0;i<N;i++) rs.push(simulate(prof, kill, lim, rng));
    v.push({ L: mean(rs.map(r=>r.L)), losses: mean(rs.map(r=>r.losses)),
             clears: mean(rs.map(r=>r.clears)) });
  }
  return { L: mean(v.map(x=>x.L)), losses: mean(v.map(x=>x.losses)), clears: mean(v.map(x=>x.clears)) };
}

console.log("Insurance = one more cart before the quest is lost (3 -> 4).");
console.log("");
console.log("  kill      limit   deaths   clears       L    vs no insurance");
for (const kill of ["both","cart","fail","streak"]) {
  const off = measure(kill, 3), on = measure(kill, 4);
  for (const [lbl, m] of [["3", off], ["4", on]])
    console.log("  " + (lbl === "3" ? kill.padEnd(9) : "         ") + lbl.padStart(5) +
      m.losses.toFixed(1).padStart(9) + m.clears.toFixed(1).padStart(9) + m.L.toFixed(1).padStart(9) +
      (lbl === "4" ? ("   " + (on.L/off.L).toFixed(3) + "x").padStart(18) : ""));
}
console.log("");
console.log("A lever whose value depends on another lever cannot be one number.");
console.log("If Insurance is to be priced, it has to be priced PER kill condition,");
console.log("or accepted as free under cart/both and paid for under fail/streak.");
