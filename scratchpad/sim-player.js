// THE UNIFIED MODEL. One primitive: how likely you are to cart with a given
// weapon/style. Everything else is derived from it.
//
// The two earlier models each had half of this. sim-skill.js gave a player a
// WIN rate per combo but treated carting as decoration. sim-carts.js made three
// carts fail the quest but gave every combo the same cart chance. Neither could
// answer "does a harsh kill condition punish a specialist differently", because
// that needs both at once.
//
// Here a player is a cart probability per combo. A hunt runs until you clear,
// cart out three times, or fail some other way, so:
//
//   clear rate = (1 - q^3)(1 - t)      per combo, not a free parameter
//
// which means skill differences express themselves as CART differences, which is
// what they are in the game. The clear rate is no longer something we assert.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);

const WEAPONS = 14, STYLES = 6, CLEAR_LIMIT = 50;
const T_RATE = 0.05;       // failing without carting out: timeout, capture slain

function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const gauss = (rng) => { let u=0,v=0; while(!u) u=rng(); while(!v) v=rng();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
const clearRate = (q) => (1 - q*q*q) * (1 - T_RATE);

// Cart chance per combo, on two independent axes.
//
//   skill    how many combos you are comfortable on. A better player does not
//            merely cart less on their main -- they have MORE weapons they
//            rarely cart with. This shifts the whole distribution.
//   breadth  how concentrated that comfort is. A specialist has a couple of
//            weapons far ahead of the rest; a generalist is even across them.
//
// Skill is given as the clear rate the profile averages out to and solved for,
// because clear rate is downstream of carting here, not a free parameter.
function makeProfile(targetClear, breadth, cap, rng) {
  const wSkill = Array.from({length:WEAPONS}, () => gauss(rng) * breadth);
  const sSkill = Array.from({length:STYLES},  () => gauss(rng) * breadth * 0.4);
  const p = [];
  for (let w=0; w<WEAPONS; w++) for (let s=0; s<cap; s++)
    p.push({ raw: wSkill[w] + sSkill[s] + gauss(rng) * breadth * 0.25 });
  let lo = -8, hi = 8;                       // higher shift -> more carting -> fewer clears
  for (let i=0;i<80;i++) {
    const mid = (lo+hi)/2;
    const m = p.reduce((t,c) => t + clearRate(1/(1+Math.exp(-(c.raw+mid)))), 0) / p.length;
    if (m > targetClear) lo = mid; else hi = mid;
  }
  const shift = (lo+hi)/2;
  p.forEach(c => { c.q = 1/(1+Math.exp(-(c.raw+shift))); c.clear = clearRate(c.q); });
  return p;
}

// One hunt with one combo. Carts are counted, and three of them is the failure.
function hunt(q, rng) {
  let carts = 0;
  while (carts < 3 && rng() < q) carts++;
  if (carts >= 3) return { cleared: false, carts: 3 };
  if (rng() < T_RATE) return { cleared: false, carts };
  return { cleared: true, carts };
}

function simulate(profile, assign, loadout, kill, rng) {
  const alive = profile.map(() => true);
  const ceiling = profile.length;
  let losses=0, earned=0, hunts=0, clears=0, streak=0, carts=0, owed=-1, cur=-1;
  const spent = new Uint8Array(QUESTS.length); let live = QUESTS.length;
  const liveIdx = () => { const o=[]; for(let i=0;i<alive.length;i++) if(alive[i]) o.push(i); return o; };
  // Hunter's choice takes the combo you cart LEAST with. Rolling does not choose.
  const bestOf = (o) => o.reduce((b,i) => profile[i].q < profile[b].q ? i : b, o[0]);

  while (losses < ceiling && clears < CLEAR_LIMIT && hunts < 4000) {
    const opts = liveIdx();
    if (!opts.length) break;
    if (cur < 0 || !alive[cur])
      cur = assign === "pick" ? bestOf(opts) : opts[(rng()*opts.length)|0];
    hunts++;
    let qi;
    if (owed >= 0) qi = owed;
    else { if (live <= 0) break; do { qi = (rng()*QUESTS.length)|0; } while (spent[qi]); }
    owed = -1;

    const h = hunt(profile[cur].q, rng);
    carts += h.carts;
    let died = false;
    if (h.cleared) { earned += QUESTS[qi].r; clears++; streak = 0;
      if (!spent[qi]) { spent[qi]=1; live--; }
      if (kill === "both" || kill === "cart") died = h.carts > 0;
    } else { streak++; owed = qi;
      if (kill === "both" || kill === "fail") died = true;
      else if (kill === "cart")   died = h.carts > 0;
      else if (kill === "streak") died = streak >= 2; }

    if (died) { alive[cur] = false; losses++; cur = -1; }
    else if (loadout === "rotate") cur = -1;
    else if (loadout === "cycle" && h.cleared) cur = -1;
  }
  const rate = Math.max(0, Math.min(1, (ceiling-losses)/ceiling));
  return { earned, clears, losses, carts, hunts, L: clears * (1 + rate) };
}

const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const N = 700, CAP = 3;
// Two axes, swept together. Skill is how many combos you are comfortable on;
// breadth is how unevenly that comfort is spread.
const SKILLS   = [["weak", 0.60], ["typical", 0.72], ["strong", 0.85]];
const BREADTHS = [["generalist", 0.35], ["mixed", 0.9], ["specialist", 1.8]];
const SEEDS = [11, 23, 37, 51, 67, 83];
const COMFY = 0.45;      // cart chance at or below this is a combo you trust

// What the skill axis actually produces, which is the thing to sanity-check
// before trusting anything downstream of it.
console.log("How many of the 42 combos a player is comfortable on");
console.log("(comfortable = carts on " + COMFY.toFixed(2) + " or less of attempts)");
console.log("");
console.log("  skill     breadth       comfy combos   best q   median q   worst q");
for (const [sname, targetClear] of SKILLS) {
  for (const [bname, breadth] of BREADTHS) {
    const counts = [], best = [], med = [], worst = [];
    for (const sd of SEEDS) {
      const prof = makeProfile(targetClear, breadth, CAP, mulberry(sd));
      const qs = prof.map(c=>c.q).sort((a,b)=>a-b);
      counts.push(qs.filter(q=>q<=COMFY).length);
      best.push(qs[0]); med.push(qs[qs.length>>1]); worst.push(qs[qs.length-1]);
    }
    console.log("  " + sname.padEnd(10) + bname.padEnd(13) +
      mean(counts).toFixed(1).padStart(9) + " / 42" +
      mean(best).toFixed(3).padStart(10) + mean(med).toFixed(3).padStart(11) +
      mean(worst).toFixed(3).padStart(10));
  }
}
console.log("");

function measure(assign, loadout, kill) {
  const v = [];
  for (const [,targetClear] of SKILLS) for (const [,breadth] of BREADTHS) for (const sd of SEEDS) {
    const rng = mulberry(sd), prof = makeProfile(targetClear, breadth, CAP, rng), rs = [];
    for (let i=0;i<N;i++) rs.push(simulate(prof, assign, loadout, kill, rng));
    v.push({ L: mean(rs.map(r=>r.L)), losses: mean(rs.map(r=>r.losses)),
             carts: mean(rs.map(r=>r.carts)), clears: mean(rs.map(r=>r.clears)) });
  }
  return { L: mean(v.map(x=>x.L)), losses: mean(v.map(x=>x.losses)),
           carts: mean(v.map(x=>x.carts)), clears: mean(v.map(x=>x.clears)) };
}

console.log("KILL CONDITIONS   (roll + hold, averaged over the whole population)");
console.log("  condition   deaths   carts  clears      L    length vs both   factor now -> implied");
const PAY = { both:[1,1.00], cart:[0.709,0.75], fail:[0.400,0.50], streak:[0.250,0.38] };
const baseL = measure("roll","hold","both").L;
for (const kill of ["both","cart","fail","streak"]) {
  const m = measure("roll","hold",kill);
  const rel = m.L / baseL;
  console.log("  " + kill.padEnd(11) + m.losses.toFixed(1).padStart(6) +
    m.carts.toFixed(1).padStart(8) + m.clears.toFixed(1).padStart(8) +
    m.L.toFixed(1).padStart(8) + ("  " + rel.toFixed(3) + "x").padStart(15) +
    ("   " + PAY[kill][0].toFixed(3) + " -> " + (PAY[kill][1]/rel).toFixed(3)).padStart(24));
}
console.log("");
console.log("ASSIGN AND LOADOUT   (kill = both)");
console.log("  assign  loadout      L     implied   now");
const NOW = { hold:1.00, cycle:1.04, rotate:1.03 };
for (const a of ["roll","pick"]) for (const l of ["hold","cycle","rotate"]) {
  const m = measure(a,l,"both");
  const pay = NOW[l] * (a === "pick" ? 0.93 : 1);
  console.log("   " + a.padEnd(7) + l.padEnd(9) + m.L.toFixed(1).padStart(6) +
    ("  " + (baseL/m.L).toFixed(3)).padStart(10) + ("  " + pay.toFixed(3)).padStart(8));
}
