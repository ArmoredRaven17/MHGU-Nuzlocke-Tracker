// Does it matter that the model never counts carts?
//
// Every sim so far drew the outcome first and the cart flag second:
//
//   cleared = rng() < 0.72
//   carted  = cleared ? rng() < 0.25 : rng() < 0.85
//
// Clear and cart are independent draws there, and "carted" is one boolean. But
// in MHGU three carts IS the failure — the two are the same event seen twice,
// not two rolls. So the question is whether pricing the kill conditions on the
// independent model got them wrong.
//
// CART-DRIVEN model: each hunt runs until you clear, cart out, or time out.
//   q = chance a given attempt ends in a cart
//   t = chance of failing some other way (timeout, capture target slain)
// Three carts fails the quest. q and t are solved so the overall clear rate
// still lands on 0.72, which keeps the two models comparable.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);

const CLEAR_LIMIT = 50, CEILING = 42;
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// P(clear) under the cart-driven model, for a given per-attempt cart chance.
const clearRate = (q, t) => (1 - q*q*q) * (1 - t);
// Solve q for a target clear rate at a fixed timeout rate.
function solveQ(target, t) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (clearRate(mid, t) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// One hunt. Returns how many carts it took and whether it cleared.
function hunt(model, rng) {
  if (model.kind === "independent") {
    const cleared = rng() < model.p;
    const carted = cleared ? rng() < model.cartOnClear : rng() < model.cartOnFail;
    return { cleared, carts: carted ? 1 : 0 };
  }
  // Cart-driven: up to three carts, and a separate way to fail outright.
  let carts = 0;
  while (carts < 3 && rng() < model.q) carts++;
  if (carts >= 3) return { cleared: false, carts: 3 };
  if (rng() < model.t) return { cleared: false, carts };
  return { cleared: true, carts };
}

function run(model, kill, rng) {
  const alive = new Array(CEILING).fill(true);
  let losses = 0, hunts = 0, clears = 0, streak = 0, cur = -1, carts = 0;
  const spent = new Uint8Array(QUESTS.length); let live = QUESTS.length;
  while (losses < CEILING && clears < CLEAR_LIMIT && hunts < 4000) {
    if (cur < 0) { const o = []; for (let i=0;i<CEILING;i++) if (alive[i]) o.push(i);
      if (!o.length) break; cur = o[(rng()*o.length)|0]; }
    hunts++;
    let qi; if (live <= 0) break;
    do { qi = (rng()*QUESTS.length)|0; } while (spent[qi]);
    const h = hunt(model, rng);
    carts += h.carts;
    let died = false;
    if (h.cleared) { clears++; streak = 0; if (!spent[qi]) { spent[qi]=1; live--; }
      if (kill === "both" || kill === "cart") died = h.carts > 0;
    } else { streak++;
      if (kill === "both" || kill === "fail") died = true;
      else if (kill === "cart") died = h.carts > 0;
      else if (kill === "streak") died = streak >= 2; }
    if (died) { alive[cur] = false; losses++; cur = -1; }
  }
  const rate = Math.max(0, Math.min(1, (CEILING - losses) / CEILING));
  return { losses, clears, carts, hunts, L: clears * (1 + rate) };
}

const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const N = 8000, SEED = 20260810;
const IND = { kind:"independent", p:0.72, cartOnClear:0.25, cartOnFail:0.85 };
const T_RATE = 0.05;                                  // fail without carting out
const Q = solveQ(0.72, T_RATE);
const CART = { kind:"cartdriven", q:Q, t:T_RATE };

console.log("Cart-driven model solved to the same 0.72 clear rate:");
console.log("  per-attempt cart chance q = " + Q.toFixed(3) +
            ", other-failure rate t = " + T_RATE);
console.log("  P(at least one cart) = " + Q.toFixed(3) +
            "   vs the independent model's " +
            (0.72*0.25 + 0.28*0.85).toFixed(3));
console.log("");
console.log("kill        model         deaths   carts   clears     L      vs 'both'");
const base = {};
for (const [mname, model] of [["independent", IND], ["cart-driven", CART]]) {
  for (const kill of ["both", "cart", "fail", "streak"]) {
    const rng = mulberry(SEED), rs = [];
    for (let i=0;i<N;i++) rs.push(run(model, kill, rng));
    const L = mean(rs.map(r=>r.L));
    if (kill === "both") base[mname] = L;
    console.log("  " + kill.padEnd(9) + mname.padEnd(14) +
      mean(rs.map(r=>r.losses)).toFixed(1).padStart(6) +
      mean(rs.map(r=>r.carts)).toFixed(1).padStart(8) +
      mean(rs.map(r=>r.clears)).toFixed(1).padStart(9) +
      L.toFixed(1).padStart(8) +
      ("  " + (L/base[mname]).toFixed(3) + "x").padStart(12));
  }
  console.log("");
}
console.log("The last column is what the weights are solved against: each kill");
console.log("condition's run length relative to the harshest. If the two models");
console.log("agree there, counting carts would not have changed the weights.");
