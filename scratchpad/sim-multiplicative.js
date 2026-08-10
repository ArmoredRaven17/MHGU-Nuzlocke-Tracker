// Multiplicative rewrite.
//
// The key identity: score = L(config) x avgReward x mult(config), where
// L = clears x (1 + survivorRate) is pure gameplay and knows nothing about the
// multiplier. So if you want a configuration's SCORE to land on a target T,
//
//     factor = T / relativeLength
//
// Under the letter system nobody sees the factor, so it is free to be whatever
// makes the scores land where they should. The letters describe T — the real
// effect — and the difficulty rating is the product of the Ts, which means the
// rating genuinely predicts relative score. That is the thing a visible number
// could never do.
//
// L depends on the factors (revive costs scale with mult), so this is a fixed
// point: guess factors, measure L, resolve, repeat.
const E = require("./engine.js");
const { QUESTS, mulberry, ceilingFor, median, CLEAR_LIMIT, SURVIVOR_BONUS } = E;
const ENV = { p: 0.72, cartOnClear: 0.25, cartOnFail: 0.85, rerollRate: 0.08 };
const REF_MULT = 1;   // the reference config is x1.00 in the new scheme

// ── Design targets: what each option should do to your FINAL SCORE ──────────
// Reference run = carts+fails, 3 styles, both locks on, rolled loadout,
// no revives, no rerolls = exactly 1.00.
const TARGET = {
  kill:   { both: 1.00, cart: 0.75, fail: 0.50, streak: 0.38, twice: 0.26 },
  cap:    { 1: 1.60, 2: 1.35, 3: 1.00, 4: 0.85, 5: 0.72, 6: 0.60 },
  pick:   0.85,
  loadoutOff: 0.85,
  questOff:   0.85,
  reviveOn:   0.82,        // having a safety net at all
  reviveOnce: 1.06,        // ...but only one per combo, so some back
  revivePrice: { 5000: 0.94, 10000: 1, 20000: 1.03, 30000: 1.05 },
  reviveCap:   { 1: 1.05, 3: 1.02, 5: 1, 10: 0.97, 20: 0.94 },
  rerollOn:    0.86,
  rerollPrice: { 2500: 0.96, 5000: 1, 10000: 1.02, 20000: 1.04 },
};

// Factors start equal to the targets and are corrected by measured length.
let F = JSON.parse(JSON.stringify(TARGET));

const target = (c) =>
  TARGET.kill[c.kill] * TARGET.cap[c.stylesPerWeapon] *
  (c.assign === "pick" ? TARGET.pick : 1) *
  (c.lockLoadout ? 1 : TARGET.loadoutOff) *
  (c.lockQuest ? 1 : TARGET.questOff) *
  (c.reviveEnabled ? TARGET.reviveOn * (c.reviveOnce ? TARGET.reviveOnce : 1) *
    TARGET.revivePrice[c.revivePrice] * TARGET.reviveCap[c.reviveCap] : 1) *
  (c.rerollEnabled ? TARGET.rerollOn * TARGET.rerollPrice[c.rerollPrice] : 1);

const factor = (c) =>
  F.kill[c.kill] * F.cap[c.stylesPerWeapon] *
  (c.assign === "pick" ? F.pick : 1) *
  (c.lockLoadout ? 1 : F.loadoutOff) *
  (c.lockQuest ? 1 : F.questOff) *
  (c.reviveEnabled ? F.reviveOn * (c.reviveOnce ? F.reviveOnce : 1) *
    F.revivePrice[c.revivePrice] * F.reviveCap[c.reviveCap] : 1) *
  (c.rerollEnabled ? F.rerollOn * F.rerollPrice[c.rerollPrice] : 1);

// Costs double and scale with the multiplier, so a buy-back is always the same
// share of a hunt regardless of how hard the run is set. Without this, revives
// are nearly free exactly where they are strongest.
const cost = (price, used, m) => price * Math.pow(2, used) * Math.max(0.25, m / REF_MULT);

function simulate(c, rng) {
  const ceil = ceilingFor(c.stylesPerWeapon), m = factor(c);
  let L = 0, e = 0, h = 0, cl = 0, st = 0, rv = 0, rr = 0, owed = -1, deaths = 0;
  const qf = new Int16Array(QUESTS.length), once = new Uint8Array(ceil + 2);
  const done = new Uint8Array(QUESTS.length);          // quests are spent on clear
  while (L < ceil && cl < CLEAR_LIMIT && h < 4000) {
    h++;
    // A reroll buys a combo you'd rather use. Nobody pays more for that than a
    // hunt is worth, so the doubling curve stops them rather than bankrupting
    // them - without this the model keeps paying 160,000z for a coin flip.
    if (c.rerollEnabled && rng() < ENV.rerollRate) {
      const k = cost(c.rerollPrice, rr, m);
      const huntWorth = ENV.p * 26000 * m;
      if (k < e && k < huntWorth) { e -= k; rr++; }
    }
    let qi;
    if (c.lockQuest && owed >= 0) qi = owed;
    else { let guard = 0; do { qi = (rng() * QUESTS.length) | 0; } while (done[qi] && ++guard < 50); }
    owed = -1;
    const ok = rng() < ENV.p, ca = ok ? rng() < ENV.cartOnClear : rng() < ENV.cartOnFail;
    let d = false;
    if (ok) {
      e += Math.round(QUESTS[qi].r * m); cl++; st = 0; done[qi] = 1;
      if (c.kill === "cart" || c.kill === "both") d = ca;
    } else {
      st++; qf[qi]++; owed = qi;
      if      (c.kill === "both" || c.kill === "fail") d = true;
      else if (c.kill === "cart")   d = ca;
      else if (c.kill === "streak") d = st >= 2;
      else if (c.kill === "twice")  d = qf[qi] >= 2;
    }
    if (d) {
      L++; deaths++;
      if (c.reviveEnabled && rv < c.reviveCap) {
        const blocked = c.reviveOnce && once[L];
        const k = cost(c.revivePrice, rv, m);
        const worth = (1 / Math.max(deaths / h, 0.01)) * ENV.p * 26000 * m;
        if (!blocked && k < e && k < worth) { e -= k; rv++; L--; once[L + 1] = 1; }
      }
    }
  }
  const rate = Math.max(0, Math.min(1, (ceil - L) / ceil));
  const bonus = e > 0 ? Math.round(e * rate * SURVIVOR_BONUS) : 0;
  // len is the gameplay term: how much scoring opportunity this run produced.
  return { final: e + bonus, len: cl * (1 + rate) };
}

const BASE = { kill: "both", stylesPerWeapon: 3, assign: "roll", lockLoadout: true,
  lockQuest: true, reviveEnabled: false, reviveOnce: true, reviveCap: 5,
  revivePrice: 10000, rerollEnabled: false, rerollPrice: 5000 };
const of = (o) => Object.assign({}, BASE, o);
const T = 2500;
function measure(c) {
  const rng = mulberry(424242);
  const fin = new Array(T), len = new Array(T);
  for (let i = 0; i < T; i++) { const r = simulate(c, rng); fin[i] = r.final; len[i] = r.len; }
  return { final: median(fin), len: median(len) };
}

// ── Fixed-point solve ───────────────────────────────────────────────────────
// Each lever option is corrected by the length it produces relative to the
// reference: factor = target / relativeLength.
const KNOBS = [
  ...["cart", "fail", "streak", "twice"].map(k => ({ get: () => F.kill[k],
    set: v => F.kill[k] = v, t: TARGET.kill[k], cfg: of({ kill: k }) })),
  ...[1, 2, 4, 5, 6].map(n => ({ get: () => F.cap[n], set: v => F.cap[n] = v,
    t: TARGET.cap[n], cfg: of({ stylesPerWeapon: n }) })),
  { get: () => F.pick, set: v => F.pick = v, t: TARGET.pick, cfg: of({ assign: "pick" }) },
  { get: () => F.loadoutOff, set: v => F.loadoutOff = v, t: TARGET.loadoutOff, cfg: of({ lockLoadout: false }) },
  { get: () => F.questOff, set: v => F.questOff = v, t: TARGET.questOff, cfg: of({ lockQuest: false }) },
  { get: () => F.reviveOn, set: v => F.reviveOn = v, t: TARGET.reviveOn * TARGET.reviveOnce,
    cfg: of({ reviveEnabled: true }), div: () => TARGET.reviveOnce },
  { get: () => F.rerollOn, set: v => F.rerollOn = v, t: TARGET.rerollOn,
    cfg: of({ rerollEnabled: true }) },
];
console.log("Fixed-point solve (factor = target / relative length)\n");
for (let iter = 1; iter <= 4; iter++) {
  const ref = measure(of({}));
  let worst = 0;
  for (const k of KNOBS) {
    const m = measure(k.cfg);
    const relLen = m.len / ref.len;
    const wanted = k.t / relLen / (k.div ? k.div() : 1);
    const moved = Math.abs(wanted / k.get() - 1);
    if (moved > worst) worst = moved;
    k.set(Math.round(wanted * 1000) / 1000);
  }
  console.log(`  pass ${iter}: largest factor move ${(worst * 100).toFixed(1)}%`);
}

console.log("\n" + "=".repeat(76));
console.log("SOLVED FACTORS (internal, never displayed) vs TARGETS (what the letters say)");
console.log("=".repeat(76));
const show = (label, f, t) => console.log("  " + label.padEnd(30) +
  f.toFixed(3).padStart(8) + t.toFixed(2).padStart(9));
console.log("  " + "lever option".padEnd(30) + "  factor".padStart(8) + "   target".padStart(9));
["cart", "fail", "streak", "twice"].forEach(k => show("kill: " + k, F.kill[k], TARGET.kill[k]));
[1, 2, 4, 5, 6].forEach(n => show(`cap: ${n} style${n > 1 ? "s" : ""}`, F.cap[n], TARGET.cap[n]));
show("loadout: hunter's choice", F.pick, TARGET.pick);
show("weapon/style lock off", F.loadoutOff, TARGET.loadoutOff);
show("quest lock off", F.questOff, TARGET.questOff);
show("revives allowed", F.reviveOn, TARGET.reviveOn);
show("rerolls allowed", F.rerollOn, TARGET.rerollOn);

console.log("\n" + "=".repeat(76));
console.log("VERIFY — does the measured score now land on the target?");
console.log("=".repeat(76));
const ref = measure(of({}));
console.log("  option                          measured   target    gap");
const check = (label, cfg) => {
  const s = measure(cfg).final / ref.final, t = target(cfg);
  const gap = s / t - 1;
  console.log("  " + label.padEnd(30) + (s.toFixed(2) + "x").padStart(10) +
    (t.toFixed(2) + "x").padStart(9) + ((gap >= 0 ? "+" : "") + (gap * 100).toFixed(0) + "%").padStart(7) +
    (Math.abs(gap) > 0.12 ? "  <<" : ""));
};
["cart", "fail", "streak", "twice"].forEach(k => check("kill: " + k, of({ kill: k })));
[1, 2, 4, 5, 6].forEach(n => check(`cap: ${n} styles`, of({ stylesPerWeapon: n })));
check("hunter's choice", of({ assign: "pick" }));
check("weapon/style lock off", of({ lockLoadout: false }));
check("quest lock off", of({ lockQuest: false }));
check("revives 5 @ 10k once", of({ reviveEnabled: true }));
check("revives 20 @ 5k repeat", of({ reviveEnabled: true, reviveCap: 20, revivePrice: 5000, reviveOnce: false }));
check("rerolls @ 5k", of({ rerollEnabled: true }));
console.log("\n  combinations:");
check("1 style + both locks off", of({ stylesPerWeapon: 1, lockLoadout: false, lockQuest: false }));
check("twice + 6 styles + revives", of({ kill: "twice", stylesPerWeapon: 6, reviveEnabled: true }));
check("cart + 2 styles + pick", of({ kill: "cart", stylesPerWeapon: 2, assign: "pick" }));
check("everything easiest", of({ kill: "twice", stylesPerWeapon: 6, assign: "pick",
  lockLoadout: false, lockQuest: false, reviveEnabled: true, reviveOnce: false,
  reviveCap: 20, revivePrice: 5000, rerollEnabled: true, rerollPrice: 2500 }));

// ── New distribution ───────────────────────────────────────────────────────
console.log("\n" + "=".repeat(76));
console.log("NEW DISTRIBUTION of the overall rating (product of targets)");
console.log("=".repeat(76));
const vals = [];
for (const kill of ["both", "cart", "fail", "streak", "twice"])
for (const cap of [1, 2, 3, 4, 5, 6])
for (const assign of ["roll", "pick"])
for (const ll of [true, false]) for (const lq of [true, false])
for (const rvOn of [false, true])
for (const once of [true, false]) for (const rp of [5000, 10000, 20000, 30000]) for (const rc of [1, 3, 5, 10, 20])
for (const rrOn of [false, true]) for (const rrp of [2500, 5000, 10000, 20000]) {
  if (!rvOn && (!once || rp !== 10000 || rc !== 5)) continue;
  if (!rrOn && rrp !== 5000) continue;
  vals.push(target(of({ kill, stylesPerWeapon: cap, assign, lockLoadout: ll, lockQuest: lq,
    reviveEnabled: rvOn, reviveOnce: once, revivePrice: rp, reviveCap: rc,
    rerollEnabled: rrOn, rerollPrice: rrp })));
}
vals.sort((a, b) => a - b);
const q = p => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
console.log(`  ${vals.length} reachable configurations`);
console.log(`  min ${vals[0].toFixed(2)}   max ${vals[vals.length - 1].toFixed(2)}   ` +
  `below 1.00: ${(vals.filter(v => v < 1).length / vals.length * 100).toFixed(0)}%   ` +
  `below zero: ${vals.filter(v => v < 0).length}`);
[.05, .10, .25, .50, .75, .90, .95].forEach(p =>
  console.log(`  ${(p * 100).toFixed(0).padStart(3)}th   ${q(p).toFixed(2)}`));

console.log("\n  five equal-population bands (quintiles):");
[0, .2, .4, .6, .8].forEach((lo, i) => {
  const hi = i === 4 ? 1 : lo + .2;
  console.log(`    band ${i + 1}   ${q(lo).toFixed(2)} .. ${(i === 4 ? vals[vals.length - 1] : q(hi)).toFixed(2)}`);
});
console.log("\n  ...against round thresholds, and how many land in each:");
const bands = [[0, .4], [.4, .7], [.7, 1.1], [1.1, 1.6], [1.6, Infinity]];
for (const [lo, hi] of bands) {
  const n = vals.filter(v => v > lo && v <= hi).length;
  console.log(`    ${lo.toFixed(2)} .. ${(hi === Infinity ? "max" : hi.toFixed(2)).padEnd(4)} ` +
    String(n).padStart(6) + "  " + "#".repeat(Math.round(n / vals.length * 46)));
}
