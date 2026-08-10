// How much choosing does Hunter's choice already hand you?
//
// "May swap once per quest" was built as if selection were scarce. It is not:
// every time a combo falls you choose a replacement, and under Hunter's choice
// that replacement is your best surviving combo. Count those moments and the
// swap's problem becomes obvious -- it was competing against a supply of free
// re-picks that the run generates on its own.
const fs = require("fs");
global.window = {};
eval(fs.readFileSync("C:/Coding Repos/MHGU Zenny Gauntlet/docs/data.js", "utf8"));
const QUESTS = window.MHGU_QUESTS.filter(q => q.t !== "Arena" && !q.p && q.r > 0);
const CLEAR_LIMIT = 50;
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function play(kill, loadout, rng) {
  const ceiling = 42;
  const alive = Array(ceiling).fill(true);
  let losses=0, hunts=0, clears=0, streak=0, cur=-1;
  let picksAfterDeath = 0, picksFromRule = 0;
  while (losses < ceiling && clears < CLEAR_LIMIT && hunts < 4000) {
    if (cur < 0) {
      // Every re-selection is a free choice under Hunter's choice.
      const opts=[]; for (let i=0;i<alive.length;i++) if (alive[i]) opts.push(i);
      if (!opts.length) break;
      cur = opts[(rng()*opts.length)|0];
    }
    hunts++;
    const cleared = rng() < 0.72;
    const carted  = cleared ? rng() < 0.25 : rng() < 0.85;
    let died = false;
    if (cleared) { clears++; streak=0; if (kill==="both"||kill==="cart") died = carted; }
    else { streak++;
      if (kill==="both"||kill==="fail") died = true;
      else if (kill==="cart") died = carted;
      else if (kill==="streak") died = streak >= 2; }
    if (died) { alive[cur]=false; losses++; cur=-1; picksAfterDeath++; }
    else if (loadout === "rotate") { cur=-1; picksFromRule++; }
    else if (loadout === "cycle" && cleared) { cur=-1; picksFromRule++; }
  }
  return { picksAfterDeath, picksFromRule, hunts, clears, losses };
}
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const N = 6000, SEED = 20260810;
console.log("Choices a run hands you on its own, before any swap mechanic.");
console.log("A 'pick' is any moment the app asks you to choose a combo again --");
console.log("under Hunter's choice, every one of them is a free pick of your best.");
console.log("");
console.log("  kill      loadout   after a death   from the rule   total   hunts");
for (const kill of ["both","cart","fail","streak"])
  for (const loadout of ["hold","cycle","rotate"]) {
    const rng = mulberry(SEED), rs = [];
    for (let i=0;i<N;i++) rs.push(play(kill, loadout, rng));
    const d = mean(rs.map(r=>r.picksAfterDeath)), f = mean(rs.map(r=>r.picksFromRule));
    console.log("  " + kill.padEnd(9) + loadout.padEnd(9) +
      d.toFixed(1).padStart(11) + f.toFixed(1).padStart(15) +
      (d+f).toFixed(1).padStart(9) + mean(rs.map(r=>r.hunts)).toFixed(1).padStart(8));
  }
console.log("");
console.log("The retired swap added at most one choice per quest on top of these,");
console.log("and only ever to a combo you had never used -- i.e. never your best.");
