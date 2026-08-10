// PRICING THE LOADOUT AND ASSIGNMENT LEVERS — the model that can finally see them.
//
// Every earlier simulation gave all 84 combos the same win chance. Under that
// assumption there is no such thing as a good combo, so there is nothing for
// "hold" to protect, nothing for "Hunter's choice" to choose, and nothing that
// "changes each quest" takes away. That is precisely why those levers sat in
// LEVER PLACEHOLDER, priced by judgement.
//
// Give a player a SKILL PROFILE — a win rate per combo — and all of it becomes
// measurable, because the rules now differ in which combos you actually end up
// playing:
//
//   hold    you keep whatever you were given until it dies, good or bad
//   cycle   a clear hands the combo in, a failure keeps it. Note what that
//           means with real skill: it discards the combos that WORK and keeps
//           the ones that do not. Expect this to be genuinely punishing.
//   rotate  a fresh combo every quest, so you play the pool average
//   free    with Hunter's choice, you take your best surviving combo, every time
//
// Profiles are parameterised by BREADTH. A specialist is strong on a couple of
// weapons and poor on the rest; a generalist is close to even. Every profile is
// renormalised to the same mean win rate, so the comparison isolates the SHAPE
// of a player's skill rather than how good they are overall.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);

const WEAPONS = 14, STYLES = 6, CLEAR_LIMIT = 50, SURVIVOR_BONUS = 1.0;
const MEAN_P = 0.72;                       // same average player as every other sim
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const gauss = (rng) => {                   // Box-Muller
  let u=0,v=0; while(!u) u=rng(); while(!v) v=rng();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };

// A profile is a win rate per combo. Skill is mostly about the WEAPON, with a
// smaller style component and a little noise — you are a hammer main who happens
// to get on with Adept, not someone with 84 independent competences.
function makeProfile(breadth, cap, rng) {
  const wSkill = Array.from({length:WEAPONS}, () => gauss(rng) * breadth);
  const sSkill = Array.from({length:STYLES},  () => gauss(rng) * breadth * 0.4);
  const p = [];
  for (let w=0; w<WEAPONS; w++) for (let s=0; s<cap; s++)
    p.push({ w, s, raw: wSkill[w] + sSkill[s] + gauss(rng) * breadth * 0.25 });
  // Squash to a probability, then renormalise so every profile shares MEAN_P.
  // Without this a wider profile would just look like a worse player.
  let lo = -6, hi = 6;
  for (let i=0;i<60;i++){ const mid=(lo+hi)/2;
    const m = p.reduce((t,c)=>t + 1/(1+Math.exp(-(c.raw+mid))), 0) / p.length;
    if (m > MEAN_P) hi = mid; else lo = mid; }
  const shift = (lo+hi)/2;
  p.forEach(c => { c.p = 1/(1+Math.exp(-(c.raw+shift))); });
  return p;
}

// One run. `assign` and `loadout` decide which combo you are on each hunt, which
// is the whole point — everything else matches the reference configuration.
function simulate(profile, assign, loadout, kill, rng) {
  const alive = profile.map(() => true);
  const ceiling = profile.length;
  let losses=0, earned=0, hunts=0, clears=0, streak=0, owed=-1, cur=-1;
  const spent = new Uint8Array(QUESTS.length); let live = QUESTS.length;
  const liveIdx = () => { const o=[]; for(let i=0;i<alive.length;i++) if(alive[i]) o.push(i); return o; };

  while (losses < ceiling && clears < CLEAR_LIMIT && hunts < 4000) {
    if (cur < 0 || !alive[cur]) {
      const opts = liveIdx();
      if (!opts.length) break;
      // Hunter's choice plays to win: the best surviving combo. Rolling does not.
      cur = assign === "pick"
        ? opts.reduce((b,i) => profile[i].p > profile[b].p ? i : b, opts[0])
        : opts[(rng()*opts.length)|0];
    }
    hunts++;
    let qi;
    if (owed >= 0) qi = owed;
    else { if (live <= 0) break; do { qi = (rng()*QUESTS.length)|0; } while (spent[qi]); }
    owed = -1;

    const cleared = rng() < profile[cur].p;
    const carted  = cleared ? rng() < 0.25 : rng() < 0.85;
    let died = false;
    if (cleared) { earned += QUESTS[qi].r; clears++; streak = 0;
      if (!spent[qi]) { spent[qi]=1; live--; }
      if (kill === "both" || kill === "cart") died = carted;
    } else { streak++; owed = qi;
      if (kill === "both" || kill === "fail") died = true;
      else if (kill === "cart") died = carted;
      else if (kill === "streak") died = streak >= 2; }

    if (died) { alive[cur] = false; losses++; cur = -1; }
    else if (loadout === "rotate") cur = -1;                       // always hands in
    else if (loadout === "cycle" && cleared) cur = -1;             // clears hand in
    else if (loadout === "free") cur = -1;                         // re-picked each hunt
    // hold: keep it
  }
  const rate = Math.max(0, Math.min(1, (ceiling-losses)/ceiling));
  return { earned, clears, losses, L: clears * (1 + rate) };
}

const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
function measure(profileSeed, breadth, cap, assign, loadout, kill, N) {
  const rng = mulberry(profileSeed);
  const prof = makeProfile(breadth, cap, rng);
  const rs = [];
  for (let i=0;i<N;i++) rs.push(simulate(prof, assign, loadout, kill, rng));
  return { L: mean(rs.map(r=>r.L)), earned: mean(rs.map(r=>r.earned)),
           clears: mean(rs.map(r=>r.clears)), losses: mean(rs.map(r=>r.losses)) };
}

const N = 1200, CAP = 3;
const PROFILES = [["generalist", 0.35], ["typical", 0.9], ["specialist", 1.8]];
const SEEDS = [11, 23, 37, 51, 67, 83, 97, 113];
const PAY = { hold:1.00, cycle:1.15, rotate:1.35, free:0.85 };

console.log("Mean win rate is held at " + MEAN_P + " for every profile, so what varies");
console.log("is the SHAPE of the player's skill, not how good they are.");
console.log("");
console.log("L = clears x (1 + survivor rate) - the gameplay term, before any multiplier.");
console.log("'implied' is the weight that makes a rule score the same as roll+hold for");
console.log("that player: L(roll,hold) / L(rule). Compare with what we actually pay.");
console.log("");
console.log("The kill condition matters. Under 'both' a failure always takes the combo,");
console.log("so cycle's \"a failure keeps it\" can never fire and it collapses onto rotate.");
console.log("It only separates where a failure is survivable.");
console.log("");

for (const KILL of ["both", "cart", "streak"]) {
  console.log("############ kill = " + KILL + " ############");
  for (const [pname, breadth] of PROFILES) {
    const base = mean(SEEDS.map(s => measure(s, breadth, CAP, "roll", "hold", KILL, N).L));
    console.log("  " + pname + " (breadth " + breadth + ")");
    console.log("    assign  loadout      L     vs base   implied   we pay   verdict");
    for (const a of ["roll","pick"]) for (const l of ["hold","cycle","rotate","free"]) {
      const L = mean(SEEDS.map(s => measure(s, breadth, CAP, a, l, KILL, N).L));
      const implied = base / L;
      const pay = PAY[l] * (a === "pick" ? 0.85 : 1);
      const off = pay / implied;
      const verdict = Math.abs(off-1) < 0.06 ? "ok" :
        (off > 1 ? "OVERPAID x" + off.toFixed(2) : "underpaid x" + off.toFixed(2));
      console.log("     " + a.padEnd(6) + "  " + l.padEnd(8) +
        L.toFixed(1).padStart(6) + "   " + (L/base).toFixed(3) + "x" +
        "   " + implied.toFixed(3) + "     " + pay.toFixed(3) + "   " + verdict);
    }
    console.log("");
  }
}

// ── How much exposure does any one combo actually get? ─────────────────────
// The static-skill assumption is only wrong if a run gives you enough reps to
// improve. Count them: distinct combos touched, and hunts per combo.
{
  console.log("############ exposure per combo ############");
  console.log("If a run cannot give you enough reps on a weapon to get better at it,");
  console.log("static skill is the right model and 'they would learn' is not a caveat.");
  console.log("");
  console.log("  assign  loadout   distinct combos used   hunts each   most-used combo");
  for (const a of ["roll","pick"]) for (const l of ["hold","cycle","rotate","free"]) {
    let distinct = 0, hunts = 0, top = 0, runs = 0;
    for (const seed of SEEDS) {
      const rng = mulberry(seed);
      const prof = makeProfile(0.9, CAP, rng);
      for (let i = 0; i < 300; i++) {
        const use = new Map();
        // Re-run the loop, tallying which combo each hunt was spent on.
        const alive = prof.map(() => true); const ceiling = prof.length;
        let losses=0, h=0, clears=0, streak=0, cur=-1;
        while (losses < ceiling && clears < CLEAR_LIMIT && h < 4000) {
          if (cur < 0 || !alive[cur]) { const opts=[];
            for (let k=0;k<alive.length;k++) if (alive[k]) opts.push(k);
            if (!opts.length) break;
            cur = a === "pick" ? opts.reduce((b,i)=>prof[i].p>prof[b].p?i:b, opts[0])
                               : opts[(rng()*opts.length)|0]; }
          h++; use.set(cur, (use.get(cur)||0)+1);
          const cleared = rng() < prof[cur].p;
          let died = false;
          if (cleared) { clears++; streak=0; died = rng() < 0.25; }
          else { streak++; died = true; }
          if (died) { alive[cur]=false; losses++; cur=-1; }
          else if (l==="rotate" || l==="free" || (l==="cycle" && cleared)) cur=-1;
        }
        distinct += use.size; hunts += h; top += Math.max(...use.values()); runs++;
      }
    }
    console.log("   " + a.padEnd(6) + "  " + l.padEnd(8) +
      (distinct/runs).toFixed(1).padStart(14) + "        " +
      (hunts/distinct).toFixed(2).padStart(6) + "       " +
      (top/runs).toFixed(1) + " hunts");
  }
}
