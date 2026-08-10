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
const MEAN_P_REF = { value: 0.72 };        // same average player as every other sim
Object.defineProperty(globalThis, "MEAN_P", { get: () => MEAN_P_REF.value });
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
//
// `free` is the subtle one and the first version of this got it wrong. It is MAY
// swap, not must: you keep your combo across quests and may change it once per
// quest if you want to. So the policy has to be a decision, not a reset — swap
// only when what you are holding is worse than what a swap is expected to get
// you. Under Hunter's choice that means your best surviving combo; under a roll
// it means the average of the survivors, since the draw is uniform.
//
// Modelled as a forced re-selection (as it was, and as the app itself used to
// behave) `free` is identical to `rotate` and comes out HARDER than holding.
// Modelled as an option it can never be worse than holding, because declining is
// always available.
function simulate(profile, assign, loadout, kill, swap, rng) {
  const alive = profile.map(() => true);
  const ceiling = profile.length;
  let losses=0, earned=0, hunts=0, clears=0, streak=0, owed=-1, cur=-1;
  const spent = new Uint8Array(QUESTS.length); let live = QUESTS.length;
  const usedC = profile.map(() => false);          // hunted with, for the free swap
  const liveIdx = () => { const o=[]; for(let i=0;i<alive.length;i++) if(alive[i]) o.push(i); return o; };
  const bestOf = (o) => o.reduce((b,i) => profile[i].p > profile[b].p ? i : b, o[0]);
  const drawFor = (o) => assign === "pick" ? bestOf(o) : o[(rng()*o.length)|0];

  while (losses < ceiling && clears < CLEAR_LIMIT && hunts < 4000) {
    const opts = liveIdx();
    if (!opts.length) break;
    if (cur < 0 || !alive[cur]) cur = drawFor(opts);
    else if (loadout === "free") {
      // The one swap this quest allows, and it may only go to a combo you have
      // NEVER hunted with. That constraint is what gives the option teeth: under
      // Hunter's choice your best combos are exactly the ones you have already
      // used, so a swap can only take you somewhere untested — you are trading a
      // known hand for an unknown one, not upgrading.
      const fresh = opts.filter(i => !usedC[i]);
      if (fresh.length) {
        // Nobody plays this perfectly, so `swap` carries two rates: how often you
        // take a swap that helps, and how often you take one that does not.
        const expected = assign === "pick"
          ? profile[bestOf(fresh)].p
          : fresh.reduce((t,i) => t + profile[i].p, 0) / fresh.length;
        const good = profile[cur].p < expected;
        if (rng() < (good ? swap.onGood : swap.onBad))
          cur = assign === "pick" ? bestOf(fresh) : fresh[(rng()*fresh.length)|0];
      }
    }
    hunts++;
    let qi;
    if (owed >= 0) qi = owed;
    else { if (live <= 0) break; do { qi = (rng()*QUESTS.length)|0; } while (spent[qi]); }
    owed = -1;

    usedC[cur] = true;                             // you have now hunted with it
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
    else if (loadout === "rotate") cur = -1;                 // hands it in, win or lose
    else if (loadout === "cycle" && cleared) cur = -1;        // clears hand it in
    // hold and free keep it; free may choose to swap at the top of the next hunt
  }
  const rate = Math.max(0, Math.min(1, (ceiling-losses)/ceiling));
  return { earned, clears, losses, L: clears * (1 + rate) };
}

const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
function measure(profileSeed, breadth, cap, assign, loadout, kill, swap, N) {
  const rng = mulberry(profileSeed);
  const prof = makeProfile(breadth, cap, rng);
  const rs = [];
  for (let i=0;i<N;i++) rs.push(simulate(prof, assign, loadout, kill, swap, rng));
  return { L: mean(rs.map(r=>r.L)), earned: mean(rs.map(r=>r.earned)),
           clears: mean(rs.map(r=>r.clears)), losses: mean(rs.map(r=>r.losses)) };
}

const N = 900, CAP = 3;
const PROFILES = [["generalist", 0.35], ["typical", 0.9], ["specialist", 1.8]];
const SEEDS = [11, 23, 37, 51, 67, 83];
const KILLS = ["both", "cart", "streak"];
// Nobody plays the optional swap perfectly. Range over how well they do.
const SWAPS = [
  ["never",   { onGood: 0.00, onBad: 0.00 }],   // holds regardless
  ["casual",  { onGood: 0.50, onBad: 0.15 }],   // sometimes takes it, sometimes wrongly
  ["sharp",   { onGood: 1.00, onBad: 0.00 }],   // takes every swap that helps
  ["fidgety", { onGood: 1.00, onBad: 1.00 }],   // swaps whenever allowed
];
const PAY = { hold:1.00, cycle:1.15, rotate:1.35, free:0.85 };

const avg = (f) => { const v=[]; for (const k of KILLS) for (const [,b] of PROFILES)
  for (const sd of SEEDS) v.push(f(k,b,sd)); return mean(v); };

console.log("Averaged over " + KILLS.length + " kill conditions x " + PROFILES.length +
            " skill profiles x " + SEEDS.length + " seeds x " + N + " runs.");
console.log("Mean win rate is pinned at " + MEAN_P + " everywhere, so what varies is the");
console.log("SHAPE of a player's skill and how well they use the optional swap.");
console.log("");
console.log("implied = L(roll,hold) / L(rule): the weight that makes a rule score the");
console.log("same as the baseline. That is the whole calibration.");
console.log("");

const base = avg((k,b,sd) => measure(sd,b,CAP,"roll","hold",k,SWAPS[0][1],N).L);
const implied = {};
console.log("  assign  loadout   swap-play      L      implied   we pay");
for (const a of ["roll","pick"]) for (const l of ["hold","cycle","rotate","free"]) {
  // Only `free` cares how the swap is played; the rest are unaffected by it.
  const rates = l === "free" ? SWAPS : [["n/a", SWAPS[0][1]]];
  const per = [];
  for (const [sname, sw] of rates) {
    const L = avg((k,b,sd) => measure(sd,b,CAP,a,l,k,sw,N).L);
    per.push([sname, L]);
    console.log("   " + a.padEnd(6) + "  " + l.padEnd(8) + "  " + sname.padEnd(9) +
      L.toFixed(1).padStart(6) + "    " + (base/L).toFixed(3) + "     " +
      (PAY[l] * (a==="pick"?0.85:1)).toFixed(3));
  }
  implied[a+"/"+l] = base / mean(per.map(x=>x[1]));   // across swap styles
}

console.log("");
console.log("── Recommended weights ──────────────────────────────────────────");
console.log("Loadout is read off the roll rows, since under Hunter's choice all four");
console.log("rules measure identical -- picking your best and holding your best are the");
console.log("same thing -- so `pick` carries that effect on its own.");
console.log("");
const round = x => Math.round(x*100)/100;
for (const l of ["hold","cycle","rotate","free"])
  console.log("  loadout " + l.padEnd(7) + " -> " + round(implied["roll/"+l]).toFixed(2));
console.log("  assign  pick    -> " + round(implied["pick/hold"]).toFixed(2));
console.log("");
console.log("Paste-ready, normalised so hold is exactly 1.00:");
const h = implied["roll/hold"];
const fmt = l => { const v = round(implied["roll/"+l]/h); return v.toFixed(3); };
console.log("    loadout: { hold: [1, 1], cycle: [" + fmt("cycle") + ", " + fmt("cycle") + "],");
console.log("               rotate: [" + fmt("rotate") + ", " + fmt("rotate") + "], free: [" +
            fmt("free") + ", " + fmt("free") + "] },");
console.log("    assign:  { roll: [1, 1], pick: [" + round(implied["pick/hold"]/h).toFixed(3) +
            ", " + round(implied["pick/hold"]/h).toFixed(3) + "] },");
console.log("");
console.log("These are provisional by construction. Re-run this after any rule change:");
console.log("    node scratchpad/sim-skill.js");

// ── How much of a score is the settings, and how much is just skill? ───────
// The weights only matter to the extent they move a score more than the player
// does. Pin the configuration and vary how GOOD the player is (not the shape of
// their skill, the level of it) to see which dominates.
{
  console.log("");
  console.log("############ skill level vs settings ############");
  console.log("Reference configuration throughout; only the player changes.");
  console.log("");
  console.log("  mean win rate   deaths   clears   survivor rate   L      vs 0.72 player");
  const at = (mp) => {
    const saved = MEAN_P_REF.value; MEAN_P_REF.value = mp;
    const v = [];
    for (const sd of SEEDS) v.push(measure(sd, 0.9, CAP, "roll", "hold", "both", SWAPS[0][1], N));
    MEAN_P_REF.value = saved;
    return { L: mean(v.map(r=>r.L)), losses: mean(v.map(r=>r.losses)),
             clears: mean(v.map(r=>r.clears)) };
  };
  const mid = at(0.72);
  for (const mp of [0.55, 0.65, 0.72, 0.80, 0.88, 0.94]) {
    const r = at(mp);
    const rate = (42 - r.losses) / 42;
    console.log("      " + mp.toFixed(2) + "        " + r.losses.toFixed(1).padStart(5) +
      "    " + r.clears.toFixed(1).padStart(5) + "        " + rate.toFixed(3) +
      "      " + r.L.toFixed(1).padStart(5) + "     " + (r.L/mid.L).toFixed(2) + "x");
  }
  console.log("");
  console.log("Compare that spread with the settings: the entire loadout group spans");
  console.log("1.00-1.04, and the widest single lever in the app (styles per weapon)");
  console.log("spans 0.60-1.60.");
}
