"use strict";
(function () {
  const QUESTS = window.MHGU_QUESTS || [];
  const $ = (id) => document.getElementById(id);
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ── Static config (carried over from the Randomizer) ─────────────────────
  const WEAPONS = ["Great Sword","Long Sword","Sword & Shield","Dual Blades",
    "Hammer","Hunting Horn","Lance","Gunlance","Switch Axe","Charge Blade",
    "Insect Glaive","Light Bowgun","Heavy Bowgun","Bow"];

  const WEAPON_COLORS = {
    "Great Sword":"#ff505b","Long Sword":"#9beaf1","Sword & Shield":"#dfd65f",
    "Dual Blades":"#6ac083","Hammer":"#c3a3d2","Hunting Horn":"#f89a64",
    "Lance":"#9fbcff","Gunlance":"#f4baf5","Switch Axe":"#aaaaaa",
    "Charge Blade":"#fc5800","Insect Glaive":"#f5f5f5","Light Bowgun":"#acd56b",
    "Heavy Bowgun":"#f8899c","Bow":"#55edc4","Prowler":"#c29930",
  };

  const STYLES = ["Guild","Striker","Adept","Aerial","Valor","Alchemy"];

  const WEAPON_ABBREV = {
    "Great Sword":"GS","Long Sword":"LS","Sword & Shield":"SnS","Dual Blades":"DB",
    "Hammer":"Hammer","Hunting Horn":"HH","Lance":"Lance","Gunlance":"GL",
    "Switch Axe":"SA","Charge Blade":"CB","Insect Glaive":"IG",
    "Light Bowgun":"LBG","Heavy Bowgun":"HBG","Bow":"Bow",
  };

  const BIASES = [
    ["Charisma",  "FourthGen-Palico_Icon_Blue.webp"],
    ["Fighting",  "Palico_Weapon_Cutting_Icon_Red.webp"],
    ["Protection","FourthGen-Down_Arrow_Icon_Blue.webp"],
    ["Assisting", "MH4G-Trap_Icon_Purple.webp"],
    ["Healing",   "MH4G-Horn_Icon_Green.webp"],
    ["Bombing",   "MH4G-Barrel_Icon_Brown.webp"],
    ["Gathering", "MH4G-Boomerang_Icon_Blue.webp"],
    ["Beast",     "FourthGen-Claw_Icon_Dark_Red.webp"],
  ];
  const BIAS_FILE = Object.fromEntries(BIASES);
  const BIAS_NAMES = BIASES.map(b => b[0]);

  // Prowler is a weapon whose biases occupy the style slot: 8 lives against a
  // normal weapon's 6. 14 x 6 + 8 = 92.
  const ALL_WEAPONS = WEAPONS.concat(["Prowler"]);
  const stylesFor = (w) => (w === "Prowler" ? BIAS_NAMES : STYLES);
  const TOTAL_COMBOS = WEAPONS.length * STYLES.length + BIAS_NAMES.length;

  // ── Icon path helpers ────────────────────────────────────────────────────
  const FALLBACK_ICON = "assets/MonsterIcons/MHGU-Question_Mark_Icon.webp";
  const monsterIcon = (name) => name
    ? "assets/MonsterIcons/MHGU-" + name.replace(/ /g, "_") + "_Icon.webp"
    : FALLBACK_ICON;
  const weaponIcon = (w) => "assets/WeaponIcons/icon_" +
    w.toLowerCase().replace(/ & /g, "_and_").replace(/ /g, "_") + "_tinted.png";
  const prowlerIcon = (f) => "assets/ProwlerIcons/" + f;
  // Training Codex — stands in for a padlock on anything the run has locked.
  const LOCK_ICON = '<img class="lock-icon" src="assets/ItemIcons/MH4G-Book_Icon_Red.webp" alt="Locked">';
  const comboIcon = (w, s) => (w === "Prowler" ? prowlerIcon(BIAS_FILE[s] || "") : weaponIcon(w));

  // ── State ────────────────────────────────────────────────────────────────
  // cfg outlives individual runs, so starting a new one doesn't mean re-ticking
  // every box. run is wiped by Start Run.
  // Both locks default on: locked is the 1x reference run, unlocking is the
  // discount. See LEVER_WEIGHT.
  const DEFAULT_CFG = {
    kill: "both",                        // "both" | "cart" | "fail" | "streak" | "twice"
    assign: "roll",                      // "roll" | "pick"
    lockLoadout: true,
    lockQuest: true,
    stylesPerWeapon: 3,                  // 1-6; styles a weapon may lose before it retires
    reviveEnabled: false, reviveOnce: true,
    reviveCap: 5,                        // buy-backs allowed per run; see REVIVE_CAP_WEIGHT
    revivePrice: 10000,                  // zenny for the first buy-back; see REVIVE_PRICE_WEIGHT
    rerollEnabled: false,
    rerollPrice: 5000,                   // zenny for the first reroll; see REROLL_PRICE_WEIGHT
  };
  let cfg = Object.assign({}, DEFAULT_CFG);

  // ── Difficulty multiplier ────────────────────────────────────────────────
  // Quest failed is the 1x base; harsher conditions sit above it, gentler ones
  // below. Tuning the difficulty curve means editing these two tables and
  // nothing else.
  // One condition, not a combination. A quest can fail WITHOUT carting — time
  // out, or blow the sub-objective — so cart and quest-failed are genuinely
  // independent triggers rather than one subsuming the other. "both" is their
  // union and is offered explicitly, which is why a radio still works: every
  // meaningful combination has its own entry, and the gentler rules below
  // quest-failed can never fire while it is selected.
  const KILL_WEIGHT = {
    both:   3,      // a cart OR a quest failure takes it — nothing is forgiven
    cart:   2,      // carts only; you can still lose a quest and keep the combo
    fail:   1,      // failures only; carting your way to a clear costs nothing
    streak: 0.75,   // the first failure is forgiven
    twice:  0.5,    // needs the same quest to beat you twice
  };
  const killBase = (c) => KILL_WEIGHT[c.kill] || 0;

  // The kill condition sets the base; every other lever is written as the
  // multiplier it reads as and contributes its distance from 1x, ADDITIVELY.
  // A 0.75x lever is -0.25 off the total, not the total times 0.75.
  //
  // The 1x reference run is: the app rolls your loadout, both locks on, no
  // revives — each of those is exactly 1x and so costs nothing.
  const LEVER_WEIGHT = {
    pickOwnLoadout:   0.75,   // choosing beats being handed one       -0.25
    loadoutUnlocked:  0.75,   // free to swap weapon/style whenever    -0.25
    questUnlocked:    0.75,   // free to walk away from a quest        -0.25
    reviveAllowed:    0.75,   // a safety net at all                   -0.25
    reviveOnce:       1.10,   // ...but only one each, so some of it back  +0.10
  };
  // How many styles a weapon may lose before the whole weapon retires. This one
  // MULTIPLIES the total rather than adding to it, and it is the only lever
  // that does.
  //
  // That is not an inconsistency for its own sake — it is what the mechanic is.
  // Score accrues per hunt and a run lasts until its pool is spent, so the pool
  // scales earnings proportionally: 15 combos lasts ~34 hunts against ~102 for
  // 45. The relationship is a ratio (45/15 = 3), and no additive constant can
  // express a ratio across five different kill-condition bases — calibrate it
  // for x3 and it over-rewards by 3x on x1, which is exactly what happened.
  //
  // So the loose end is the honest pool ratio, and the restrictive end carries
  // ~17% on top so that restriction is high risk, high reward rather than
  // merely break-even. Simulation over 4,000 runs per configuration.
  const STYLE_CAP_MULT = { 1: 3.5, 2: 1.75, 3: 1, 4: 0.75, 5: 0.6, 6: 0.5 };

  // A completed run is its hunt limit, and finishing with combos still in hand
  // is the point — so surviving pays.
  //
  // Awarded as a share of what you earned, not a flat pot per combo. A flat pot
  // pays most to the loosest settings, which finish with 46 of 90 standing
  // simply because they had 90 and gentle rules; as a proportion, keeping 5 of
  // 15 scores exactly like keeping 15 of 45. Simulation also showed survival
  // tracks play quality at a fixed setting — 0/45 at a 55% win rate against
  // 16/45 at 95% — so it measures something real.
  //
  // At 1.0 a flawless run doubles and a wipe adds nothing.
  const SURVIVOR_BONUS = 1.0;

  // What the first buy-back costs, and what charging that is worth. A cheap
  // safety net makes the run easier; a dear one barely helps. 10,000z is the
  // reference and costs nothing. Only applies when revives are switched on.
  //
  // The top bonus is deliberately small. Having no safety net at all must beat
  // having an expensive one, and "no revives" contributes exactly 0 — so the
  // best revive case (allowed -0.25, once-only +0.10, dearest price) has to
  // stay below zero. That caps the dearest price under +0.15; +0.10 leaves the
  // best possible revive run at -0.05. Raising it past +0.15 would invert the
  // intent, so check REVIVE_NEVER_BEATS_OFF if you retune these.
  const REVIVE_PRICE_WEIGHT = { 5000: 0.85, 10000: 1, 20000: 1.05, 30000: 1.10 };

  // How many buy-backs a run gets. Measured against no revives at all: 3 lands
  // at 1.03x, 5 at 1.04x, 10 at 1.09x, 20 at 1.17x — so the weights track the
  // advantage each allowance actually confers. 5 is the reference.
  const REVIVE_CAP_WEIGHT = { 1: 1.10, 3: 1.03, 5: 1, 10: 0.95, 20: 0.88 };

  // Rerolling lets you refuse a combo you were handed, so allowing it is a
  // discount for the same reason revives are. Same shape: charging more for it
  // claws some back, capped so that forbidding rerolls always beats allowing
  // them at any price. Placeholder values pending balance.
  const REROLL_ALLOWED_WEIGHT = 0.80;   // -0.20 for having the escape hatch at all
  const REROLL_PRICE_WEIGHT = { 2500: 0.90, 5000: 1, 10000: 1.05, 20000: 1.10 };

  // The total is deliberately unbounded below. This is a bonus multiplier, so a
  // run soft enough to net out at zero earns nothing, and one softer still is
  // penalised — both are legitimate outcomes rather than something to clamp.

  const leverDeltas = (c) => {
    const L = LEVER_WEIGHT, d = [];
    if (c.assign === "pick") d.push(L.pickOwnLoadout);
    if (!c.lockLoadout)      d.push(L.loadoutUnlocked);
    if (!c.lockQuest)        d.push(L.questUnlocked);
    // Two independent values that stack: allowing revives at all is -0.25,
    // and capping them at one per combo gives +0.10 of it back.
    if (c.reviveEnabled) {
      d.push(L.reviveAllowed);
      if (c.reviveOnce) d.push(L.reviveOnce);
      const price = REVIVE_PRICE_WEIGHT[c.revivePrice];
      if (price != null && price !== 1) d.push(price);
      const capW = REVIVE_CAP_WEIGHT[c.reviveCap];
      if (capW != null && capW !== 1) d.push(capW);
    }
    if (c.rerollEnabled) {
      d.push(REROLL_ALLOWED_WEIGHT);
      const price = REROLL_PRICE_WEIGHT[c.rerollPrice];
      if (price != null && price !== 1) d.push(price);
    }
    return d;
  };

  // Kill condition sets the base, the other levers add to or subtract from it,
  // then the styles cap scales the lot.
  function multiplier(c) {
    const summed = leverDeltas(c).reduce((sum, w) => sum - (1 - w), killBase(c));
    const cap = STYLE_CAP_MULT[c.stylesPerWeapon];
    return Math.round(summed * (cap == null ? 1 : cap) * 100) / 100;
  }

  // Invariant: no safety net must always beat having one, however dearly it is
  // priced. Checked rather than assumed, because it depends on three separate
  // weights and is easy to break by nudging any of them.
  (function assertReviveNeverBeatsOff() {
    const base = { kill: "fail", assign: "roll", lockLoadout: true, lockQuest: true,
                   stylesPerWeapon: 3 };
    const off = multiplier(Object.assign({}, base, { reviveEnabled: false }));
    const best = Math.max(...Object.keys(REVIVE_PRICE_WEIGHT).map(p =>
      Math.max(...[true, false].map(once =>
        multiplier(Object.assign({}, base,
          { reviveEnabled: true, reviveOnce: once, revivePrice: +p }))))));
    if (best >= off) {
      console.warn("Revive weights inverted: best revive run scores " + best +
        ", which is not below the " + off + " for allowing none. " +
        "Lower the dearest REVIVE_PRICE_WEIGHT or LEVER_WEIGHT.reviveOnce.");
    }
  })();
  // Typographic minus, not a hyphen — "×-0.75" reads as a typo.
  const fmtMult = (m) => "×" + m.toFixed(2).replace("-", "−");

  // ── Revive economy ───────────────────────────────────────────────────────
  // Cost climbs in flat steps of the chosen price: the Nth buy-back of a run
  // costs N x price. The price itself is a lever — see REVIVE_PRICE_WEIGHT.
  const reviveCost = (used) => cfg.revivePrice * (Math.max(0, used) + 1);

  const emptyRun = () => ({
    active: false, finished: false,
    startedAt: 0, endedAt: 0,
    deaths: [],            // {weapon, style, reason, quest, n, reviveCount}
    failStreak: 0,         // run-global; carts never touch it
    questFails: {},        // "Type|Name" -> cumulative failures
    lockQuest: null,       // the quest you owe a retry on
    combo: null,           // the loadout for the hunt in progress
    quest: null,           // the quest for the hunt in progress
    attemptCarts: 0,
    hunts: 0,              // resolved hunts; carts don't end one so don't count
    cleared: 0,            // successful hunts; this is what CLEAR_LIMIT bounds
    failed: 0, carts: 0, revives: 0, rerolls: 0,
    revived: {},           // comboKey -> times bought back (survives the death being removed)
    reviveLog: [],         // {weapon, style, cost} for the summary
    rerollLog: [],         // {weapon, style, cost}
    zennySpent: 0,         // paid out of score rather than materials
    earned: 0,             // zenny rewards of quests cleared, x the run's multiplier
    mult: 1,               // snapshotted at Start Run; rules are frozen anyway
    maxLosses: 0,          // likewise — the rules unlock again once the run ends,
                           // so the summary can't ask cfg what the cap was
    cfg: null,             // the whole lever set, for the summary's Rules panel
  });
  let run = emptyRun();

  // Derived index over run.deaths — O(1) lookups when building the pool.
  // Never persisted; rebuilt on load.
  let deadKeys = new Set();
  const rebuildDeadKeys = () => { deadKeys = new Set(run.deaths.map(d => comboKey(d.weapon, d.style))); };

  // How many buy-backs a whole run gets. This bound is not optional: without
  // it a run has no terminal state at all, because you can always pay for one
  // more combo. Simulation ran past 4,000 hunts even at 100,000z a revive —
  // ten times any sane run — where a cap of 5 lands at 1.04x the no-revive
  // score. Price alone cannot fix an unbounded loop.
  const reviveAllowance = () => cfg.reviveCap;

  // A fallen combo can be bought back while the run has allowance left, unless
  // the "once per combo" lever is on and it has already come back once.
  // run.revived survives the death entry being removed, which is what makes
  // that second check possible.
  const canRevive = (w, s) =>
    cfg.reviveEnabled && run.active && !run.finished && deadKeys.has(comboKey(w, s)) &&
    run.revives < reviveAllowance() &&
    !(cfg.reviveOnce && (run.revived[comboKey(w, s)] || 0) >= 1);

  // Settling by zenny comes straight off the score. It may take the total
  // negative — that's allowed, same as a negative multiplier.
  // The only payment route: straight off the run's score. May take the total
  // negative, same as a negative multiplier can.
  function settle(option) {
    run.earned -= option.total;
    run.zennySpent += option.total;
  }

  function doRevive(w, s, option) {
    const key = comboKey(w, s);
    if (!canRevive(w, s)) return;
    run.deaths = run.deaths.filter(d => comboKey(d.weapon, d.style) !== key);
    run.revived[key] = (run.revived[key] || 0) + 1;
    run.reviveLog.push({ weapon: w, style: s, cost: option.total });
    run.revives++;
    settle(option);
    rebuildDeadKeys();
    save(); renderAll();
  }

  // Refuse the combo you were handed and draw another. The refused one is not
  // lost — it goes back in the pool — you have simply paid to not take it now.
  const canReroll = () => cfg.rerollEnabled && cfg.assign === "roll" &&
    run.active && !run.finished && !!run.combo &&
    isAlive(run.combo.weapon, run.combo.style) && legalCombos().length > 1;

  const rerollCost = (used) => cfg.rerollPrice * (Math.max(0, used) + 1);

  function doReroll(option) {
    if (!canReroll()) return;
    const from = run.combo;
    // Draw a genuinely different combo rather than possibly the same one back.
    let next = null;
    for (let i = 0; i < 50 && !next; i++) {
      const c = rollCombo();
      if (c && comboKey(c.weapon, c.style) !== comboKey(from.weapon, from.style)) next = c;
    }
    if (!next) return;
    run.rerollLog.push({ weapon: from.weapon, style: from.style, cost: option.total });
    run.rerolls++;
    run.combo = next;
    settle(option);
    save(); renderAll();
  }

  // ── Pool ─────────────────────────────────────────────────────────────────
  // Typographic minus so a negative total matches the multiplier's formatting.
  const zenny = (n) => n.toLocaleString("en-US").replace("-", "−") + "z";
  // A long run can earn seven figures, which will not fit a summary tile at
  // full width. Abbreviate past a million; the tile keeps the exact figure in
  // its tooltip.
  const zennyShort = (n) => n >= 1e6
    ? (n / 1e6).toFixed(n < 1e7 ? 2 : 1) + "Mz"
    : zenny(n);
  // Step the type down as the string grows so nothing overflows its tile.
  const fitClass = (s) => s.length <= 4 ? "" : s.length <= 6 ? " fit-s"
    : s.length <= 8 ? " fit-xs" : " fit-xxs";
  const comboKey = (w, s) => w + "|" + s;
  const questKey = (q) => q.t + "|" + q.n;
  const isArena = (q) => !!q && q.t === "Arena";
  const isAlive = (w, s) => !deadKeys.has(comboKey(w, s));

  // A weapon only gets so many styles before the whole thing retires, taking
  // its surviving styles out of the pool with it. Counted from run.deaths, so a
  // revive (which removes a death) can bring a retired weapon back.
  const stylesLost = (w) => run.deaths.reduce((n, d) => n + (d.weapon === w ? 1 : 0), 0);
  const isRetired  = (w) => stylesLost(w) >= cfg.stylesPerWeapon;

  const legalStyles  = (w) => isRetired(w) ? [] : stylesFor(w).filter(s => isAlive(w, s));
  const legalWeapons = () => ALL_WEAPONS.filter(w => legalStyles(w).length > 0);
  function legalCombos() {
    const out = [];
    legalWeapons().forEach(w => legalStyles(w).forEach(s => out.push({ weapon: w, style: s })));
    return out;
  }
  // Longest a run can possibly last: every weapon spends its full allowance.
  const maxLosses = () => ALL_WEAPONS.reduce(
    (n, w) => n + Math.min(cfg.stylesPerWeapon, stylesFor(w).length), 0);
  // The run's own ceiling, snapshotted at Start Run. Falls back to the live
  // figure for runs saved before it was recorded.
  const runMax = () => run.maxLosses || maxLosses();
  // Each cap yields a distinct ceiling (15/30/45/60/75/90), so a run that kept
  // no rules snapshot can still have this one rule read back off its ceiling.
  const capForCeiling = (ceiling) => [1, 2, 3, 4, 5, 6].find(c =>
    ALL_WEAPONS.reduce((n, w) => n + Math.min(c, stylesFor(w).length), 0) === ceiling);

  // Weapon-first: uniform among surviving weapons, then uniform among that
  // weapon's surviving styles. Preserves the Randomizer's distribution rather
  // than flattening across all 92 (which would shrink a weapon's share as its
  // styles die).
  function rollCombo() {
    const weapons = legalWeapons();
    if (!weapons.length) return null;
    const weapon = pick(weapons);
    const styles = legalStyles(weapon);
    if (!styles.length) return null;   // unreachable by construction
    return { weapon, style: pick(styles) };
  }

  // Run-over is derived, not latched, so it recomputes after every death and
  // after any revive.
  // A run closes on exhaustion, on the clear limit, or when you end it manually.
  //
  // The limit counts SUCCESSFUL hunts, not attempts, and is fixed rather than
  // chosen. Both of those are load-bearing.
  //
  // It exists to stop the gentle kill conditions winning on sheer length —
  // unbounded, "same quest twice" ran a median 1,384 hunts against 102 for the
  // default and inverted the entire difficulty ordering. So it cannot be a
  // scored lever (it only binds when a run would otherwise outlast it, so a
  // short configuration could take the tightest limit, never reach it, and
  // collect the bonus for free) and it cannot be opted out of.
  //
  // Counting clears rather than attempts is what keeps the ordering honest. A
  // failure never positively contributes, so it must not extend the clock in a
  // way that benefits you either. Under an attempt cap it did: the gentle
  // conditions spent their whole allowance earning while the harsh ones wiped
  // early and stopped, and combined with the survivor bonus that put "two in a
  // row" ABOVE the stricter "quest failed" at a 65% win rate. Counting clears
  // hands every run the same 50 payouts unless it wipes first, so the
  // multiplier is what separates them.
  const CLEAR_LIMIT = 50;
  const clearsUsed = () => run.cleared || 0;

  // What you finished holding, as a share of what this run could have lost.
  const survivorRate = () => {
    const ceiling = runMax();
    if (!ceiling) return 0;
    return Math.max(0, Math.min(1, (ceiling - run.deaths.length) / ceiling));
  };
  // Only ever a bonus. Scaling a negative total by survival would punish
  // keeping combos, which is the opposite of the intent.
  const survivorBonus = () =>
    run.earned > 0 ? Math.round(run.earned * survivorRate() * SURVIVOR_BONUS) : 0;
  const finalScore = () => run.earned + survivorBonus();
  const clearCapHit = () => clearsUsed() >= CLEAR_LIMIT;
  const runOver = () => run.active &&
    (run.finished || clearCapHit() || legalCombos().length === 0);

  // ── Persistence ──────────────────────────────────────────────────────────
  const STORE_KEY = "mhgu-nuzlocke";

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, cfg, run }));
    } catch (e) {}
  }
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) {}
    // Only keys DEFAULT_CFG still knows about, so settings that were replaced
    // (the old per-condition kill booleans) don't linger in storage.
    if (d && d.cfg) {
      cfg = Object.assign({}, DEFAULT_CFG);
      Object.keys(DEFAULT_CFG).forEach(k => { if (k in d.cfg) cfg[k] = d.cfg[k]; });
      if (!KILL_WEIGHT[cfg.kill]) cfg.kill = DEFAULT_CFG.kill;
    }
    if (d && d.run) run = Object.assign(emptyRun(), d.run);
    rebuildDeadKeys();
    // A run saved before run.cfg existed has no rules snapshot. If it is still
    // going, the live cfg IS its snapshot — the rules are frozen for the
    // duration of a run, so they cannot have diverged — and adopting it now
    // means the panel is correct for the rest of the run. A run that already
    // ENDED gets nothing: the rules unlocked when it finished, so the live cfg
    // is no evidence of what was played. renderSummary says so rather than
    // reporting numbers it cannot stand behind.
    if (run.active && !run.cfg && !runOver()) {
      run.cfg = Object.assign({}, cfg);
      save();
    }
  }

  // ── Config <-> DOM ───────────────────────────────────────────────────────
  const CFG_BOXES = {
    lockLoadout: "l_loadout",
    lockQuest: "l_quest",
    reviveEnabled: "r_enabled", reviveOnce: "r_once",
    rerollEnabled: "rr_enabled",
  };
  // Radio groups: cfg key -> value -> element id.
  const CFG_RADIOS = {
    kill:   { both: "k_both", cart: "k_cart", fail: "k_fail", streak: "k_streak", twice: "k_twice" },
    stylesPerWeapon: { 1: "c_1", 2: "c_2", 3: "c_3", 4: "c_4", 5: "c_5", 6: "c_6" },
    revivePrice: { 5000: "p_5000", 10000: "p_10000", 20000: "p_20000", 30000: "p_30000" },
    reviveCap: { 1: "rc_1", 3: "rc_3", 5: "rc_5", 10: "rc_10", 20: "rc_20" },
    rerollPrice: { 2500: "rp_2500", 5000: "rp_5000", 10000: "rp_10000", 20000: "rp_20000" },
    assign: { roll: "a_roll", pick: "a_pick" },
  };

  // How a radio's chosen value reads, taken from the sidebar label itself rather
  // than a second table — the summary's Rules panel then can't drift from the
  // control it is reporting on. The difficulty badge is dropped; the panel is a
  // record of what was played, and the weights are already on the tiles.
  function ruleLabel(key, value) {
    const id = (CFG_RADIOS[key] || {})[value];
    const input = id && $(id);
    if (!input || !input.closest("label")) return String(value);
    const label = input.closest("label").cloneNode(true);
    const w = label.querySelector(".w");
    if (w) w.remove();
    return label.textContent.trim();
  }

  function writeCfgToDom() {
    Object.entries(CFG_BOXES).forEach(([k, id]) => { $(id).checked = !!cfg[k]; });
    // Object keys are strings, but some cfg values are numbers (stylesPerWeapon),
    // so compare as strings and convert back on the way in.
    Object.entries(CFG_RADIOS).forEach(([k, maping]) => {
      Object.entries(maping).forEach(([val, id]) => { $(id).checked = String(cfg[k]) === val; });
    });
    applyCfgLockState();
  }
  const RADIO_NUMERIC = { stylesPerWeapon: true, revivePrice: true, rerollPrice: true,
    reviveCap: true };
  function readCfgFromDom() {
    if (cfgLocked()) return;                    // settings are frozen for the run
    Object.entries(CFG_BOXES).forEach(([k, id]) => { cfg[k] = $(id).checked; });
    Object.entries(CFG_RADIOS).forEach(([k, maping]) => {
      const hit = Object.entries(maping).find(([, id]) => $(id).checked);
      if (hit) cfg[k] = RADIO_NUMERIC[k] ? +hit[0] : hit[0];
    });
    applyCfgLockState();
  }

  // The rules are fixed for the duration of a run — otherwise the difficulty
  // you picked means nothing, since any condition could be switched off the
  // moment it was about to cost you something.
  const cfgLocked = () => run.active && !runOver();

  const CFG_INPUTS = () => Object.values(CFG_BOXES).map($)
    .concat(Object.values(CFG_RADIOS).flatMap(m => Object.values(m).map($)));

  function applyCfgLockState() {
    const locked = cfgLocked();
    CFG_INPUTS().forEach(el => { el.disabled = locked; });
    if (!locked) syncDependentBoxes();
    $("cfgLockNote").classList.toggle("hidden", !locked);
  }
  // Sub-options only mean something when their parent is on.
  function syncDependentBoxes() {
    // Everything under Revive is meaningless until revives are switched on.
    const off = !cfg.reviveEnabled;
    $("r_once").disabled = off;
    Object.values(CFG_RADIOS.revivePrice).forEach(id => { $(id).disabled = off; });
    Object.values(CFG_RADIOS.reviveCap).forEach(id => { $(id).disabled = off; });
    const rrOff = !cfg.rerollEnabled;
    Object.values(CFG_RADIOS.rerollPrice).forEach(id => { $(id).disabled = rrOff; });
  }

  // ── Kill / revive ────────────────────────────────────────────────────────
  // Idempotent: several conditions firing on one failure record a single death,
  // tagged with the first matching reason.
  function kill(combo, reason) {
    const key = comboKey(combo.weapon, combo.style);
    if (deadKeys.has(key)) return false;
    deadKeys.add(key);
    const prior = run.deaths.filter(d => comboKey(d.weapon, d.style) === key).length;
    run.deaths.push({
      weapon: combo.weapon, style: combo.style, reason,
      quest: run.quest ? run.quest.n : "",
      n: run.deaths.length + 1, reviveCount: prior,
    });
    return true;
  }

  // ── The report handler ───────────────────────────────────────────────────
  function report(outcome) {
    if (!run.active || run.finished) return;
    if (!run.combo || !run.quest) return;

    const combo = run.combo;
    // Arena quests hand you a weapon, so nothing is at stake on them: no death,
    // no streak change, no tally. Locks stay engaged across an Arena detour.
    const counts = !isArena(run.quest);

    if (outcome === "cart") {
      run.carts++; run.attemptCarts++;
      if (counts && (cfg.kill === "cart" || cfg.kill === "both")) kill(combo, "Carted");
      // Deliberately does not end the attempt — Cleared/Failed stay available.
      afterMutation();
      return;
    }

    // The quest lock is a single-retry obligation. Reaching any resolution on
    // the locked quest discharges it — win or lose, the retry was served, so
    // failing it again must NOT re-lock you or the debt could never be paid.
    // Only a failure on a quest you weren't already locked to owes a new one.
    const wasRetry = !!run.lockQuest && questKey(run.lockQuest) === questKey(run.quest);
    run.lockQuest = null;

    // One hunt = one resolution. Carting doesn't end the attempt, so it isn't
    // one; an Arena hunt still is, since it consumed real playing time.
    run.hunts = (run.hunts || 0) + 1;

    if (outcome === "clear") {
      run.cleared++;
      if (counts) {
        // Points only ever go up — a failure costs you a loadout, which is the
        // punishment. Arena pays nothing, same as it costs nothing.
        run.earned += Math.round((run.quest.r || 0) * run.mult);
        run.failStreak = 0;
      }
    } else {                                        // "fail"
      run.failed++;
      if (counts) {
        const qk = questKey(run.quest);
        run.failStreak++;                           // before the streak check
        run.questFails[qk] = (run.questFails[qk] || 0) + 1;

        if      (cfg.kill === "fail" || cfg.kill === "both")          kill(combo, "Quest failed");
        else if (cfg.kill === "streak" && run.failStreak >= 2)        kill(combo, "Two failures in a row");
        else if (cfg.kill === "twice"  && run.questFails[qk] >= 2)    kill(combo, "Quest failed twice");

        if (cfg.lockQuest && !wasRetry) run.lockQuest = run.quest;
      }
    }

    // Roll over into the next hunt. The loadout lock means exactly one thing:
    // you keep the combo until it dies — through clears as well as failures.
    run.attemptCarts = 0;
    run.combo = (cfg.lockLoadout && isAlive(combo.weapon, combo.style))
      ? { weapon: combo.weapon, style: combo.style } : null;
    run.quest = run.lockQuest || null;
    afterMutation();
  }

  function afterMutation() {
    save();
    renderAll();
  }

  // ── Run lifecycle ────────────────────────────────────────────────────────
  function startRun() {
    run = emptyRun();
    run.active = true;
    run.startedAt = Date.now();
    run.mult = multiplier(cfg);
    run.maxLosses = maxLosses();
    run.cfg = Object.assign({}, cfg);
    rebuildDeadKeys();
    save(); renderAll();
  }
  function endRun() {
    run.finished = true;
    run.endedAt = Date.now();
    save(); renderAll();
  }

  // ── Quest picker ─────────────────────────────────────────────────────────
  let searchResults = [];
  function renderQuestResults(term) {
    const box = $("questResults");
    const t = term.trim().toLowerCase();
    if (!t) { box.classList.add("hidden"); return; }
    searchResults = QUESTS.filter(q => q.n.toLowerCase().includes(t)).slice(0, 40);
    if (!searchResults.length) {
      box.innerHTML = '<p class="qr-none">No quest matches that.</p>';
    } else {
      // Buttons rather than divs so the list is reachable by keyboard and
      // announced properly — it's the only way to set a quest.
      box.innerHTML = searchResults.map((q, i) =>
        `<button type="button" data-i="${i}">${escapeHtml(q.n)}` +
        `<span class="qr-type"> &middot; ${escapeHtml(q.t)}${q.m ? " &middot; " + escapeHtml(q.m) : ""}</span>` +
        `<span class="qr-worth">${q.t === "Arena" ? "&mdash;" : zenny(q.r || 0)}</span></button>`
      ).join("");
    }
    box.classList.remove("hidden");
  }
  function chooseQuest(q) {
    run.quest = q;
    $("questSearch").value = "";
    $("questResults").classList.add("hidden");
    save(); renderAll();
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  function renderBoard() {
    const board = $("board");
    if (!run.active || runOver()) { board.classList.add("hidden"); return; }
    board.classList.remove("hidden");

    const cur = run.combo;
    const isCurrent = (w, s) => cur && cur.weapon === w && cur.style === s;
    const cellClass = (w, s) => {
      if (!isAlive(w, s)) {
        return "cell dead" + (canRevive(w, s) ? " revivable" : "");
      }
      // Alive, but its weapon spent its style allowance — out of the pool
      // without ever having been lost. A different thing from fallen.
      if (isRetired(w)) return "cell retired";
      // Back from the dead — worth marking, it cost something.
      const back = (run.revived[comboKey(w, s)] || 0) > 0;
      return "cell alive" + (back ? " revived" : "") + (isCurrent(w, s) ? " current" : "");
    };
    const cellTitle = (w, s) => canRevive(w, s)
      ? ` title="Buy back for ${zenny(reviveCost(run.revives))}"` : "";

    let html = '<div class="board-grid">';
    html += '<div class="bh corner"></div>';
    STYLES.forEach(s => { html += `<div class="bh">${escapeHtml(s)}</div>`; });
    WEAPONS.forEach(w => {
      html += `<div class="brow-label" style="color:${WEAPON_COLORS[w]}">` +
              `<img src="${weaponIcon(w)}" alt="">${escapeHtml(WEAPON_ABBREV[w] || w)}</div>`;
      STYLES.forEach(s => {
        html += `<div class="${cellClass(w, s)}"${cellTitle(w, s)} data-w="${escapeHtml(w)}" data-s="${escapeHtml(s)}"></div>`;
      });
    });
    html += "</div>";

    html += '<div class="board-grid prowler">';
    html += '<div class="bh corner"></div>';
    BIAS_NAMES.forEach(b => { html += `<div class="bh">${escapeHtml(b)}</div>`; });
    html += `<div class="brow-label" style="color:${WEAPON_COLORS.Prowler}">` +
            `<img src="${prowlerIcon(BIAS_FILE.Charisma)}" alt="">Prowler</div>`;
    BIAS_NAMES.forEach(b => {
      html += `<div class="${cellClass("Prowler", b)}"${cellTitle("Prowler", b)} data-w="Prowler" data-s="${escapeHtml(b)}"></div>`;
    });
    html += "</div>";

    html += '<div class="board-legend"><span>Solid = available</span>' +
            '<span style="color:var(--dead)">Struck through = fallen</span>' +
            '<span>Faded = weapon retired, allowance spent</span>' +
            '<span>Outlined = current combo</span></div>';
    board.innerHTML = html;
  }

  function renderStatus() {
    const strip = $("statusStrip");
    if (!run.active || runOver()) { strip.classList.add("hidden"); return; }
    strip.classList.remove("hidden");

    const lost = run.deaths.length;
    const alive = legalCombos().length;
    let html =
      `<span class="stat dead">Lost <b>${lost}/${runMax()}</b></span>` +
      `<span class="stat">Available <b>${alive}</b></span>` +
      `<span class="stat">Hunts <b>${run.hunts || 0}</b></span>` +
      `<span class="stat">Cleared <b>${clearsUsed()}/${CLEAR_LIMIT}</b></span>` +
      `<span class="stat">Failed <b>${run.failed}</b></span>` +
      `<span class="stat">Carts <b>${run.carts}</b></span>` +
      `<span class="stat earned">Earned <b>${zenny(run.earned)}</b></span>` +
      `<span class="stat${run.mult < 0 ? " dead" : ""}">` +
      `${run.mult < 0 ? "Penalty" : "Bonus"} <b>${fmtMult(run.mult)}</b></span>` +
      (cfg.reviveEnabled
        ? `<span class="stat">Next revive <b>${zenny(reviveCost(run.revives))}</b></span>` : "");
    if (cfg.kill === "streak") html += `<span class="stat">Streak <b>${run.failStreak}</b></span>`;

    if (cfg.lockLoadout && run.combo) {
      // A cart can kill the combo without ending the attempt, so the held
      // loadout may already be dead — say so rather than "until it falls".
      const dead = !isAlive(run.combo.weapon, run.combo.style);
      html += `<span class="lock-chip${dead ? " fallen" : ""}">${LOCK_ICON} ` +
        `${escapeHtml(WEAPON_ABBREV[run.combo.weapon] || run.combo.weapon)} + ` +
        `${escapeHtml(run.combo.style)} &mdash; ` +
        (dead ? "fallen; finish the hunt to move on" : "until it falls") + `</span>`;
    }
    if (run.lockQuest) {
      html += `<span class="lock-chip">${LOCK_ICON} ${escapeHtml(run.lockQuest.n)} &mdash; owed a retry</span>`;
    }
    strip.innerHTML = html;
  }

  function renderHuntBar() {
    const bar = $("huntBar");
    if (!run.active || runOver()) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");

    // Locked to a live combo: you can't swap, so the pickers would be a lie.
    const locked = cfg.lockLoadout && !!run.combo;
    const pickMode = cfg.assign === "pick" && !locked;

    $("hlPick").classList.toggle("hidden", !pickMode);
    $("hlRolled").classList.toggle("hidden", pickMode);
    $("rollBtn").classList.toggle("hidden", pickMode);

    if (pickMode) {
      const wSel = $("pickWeapon"), sSel = $("pickStyle");
      // A cart can kill the held combo without ending the attempt, so the
      // current loadout may be dead. Show it as it is — rendering must never
      // reassign it, or the hunt silently continues on a different combo and
      // the failure report kills that one too.
      const held = run.combo;
      const heldDead = held && !isAlive(held.weapon, held.style);
      const weapons = legalWeapons();
      if (heldDead && !weapons.includes(held.weapon)) weapons.unshift(held.weapon);
      const curW = held && weapons.includes(held.weapon) ? held.weapon : weapons[0];
      wSel.innerHTML = weapons.map(w =>
        `<option value="${escapeHtml(w)}"${w === curW ? " selected" : ""}>${escapeHtml(w)}</option>`).join("");

      const styles = curW ? legalStyles(curW).slice() : [];
      if (heldDead && held.weapon === curW && !styles.includes(held.style)) styles.unshift(held.style);
      const curS = held && styles.includes(held.style) ? held.style : styles[0];
      sSel.innerHTML = styles.map(s =>
        `<option value="${escapeHtml(s)}"${s === curS ? " selected" : ""}>${escapeHtml(s)}</option>`).join("");

      // Only seed a loadout when there isn't one; never overwrite an existing.
      if (!run.combo && curW && curS) run.combo = { weapon: curW, style: curS };
      // Nothing to swap to until the hunt is reported.
      wSel.disabled = sSel.disabled = !!heldDead;
    } else {
      const c = run.combo;
      $("hlText").textContent = c
        ? (c.weapon + "  ·  " + c.style)
        : "—";
      const icon = $("hlIcon");
      if (c) { icon.src = comboIcon(c.weapon, c.style); icon.classList.remove("hidden"); }
      else icon.classList.add("hidden");
      // Blocked while a hunt is outstanding — otherwise the mode is opt-out per
      // roll and the locks mean nothing.
      $("rollBtn").disabled = !!run.combo;
      $("rollBtn").textContent = run.combo ? "Combo set" : "Roll Combo";
      const rr = canReroll();
      $("rerollBtn").classList.toggle("hidden", !rr);
      if (rr) $("rerollBtn").textContent = "Reroll — " + zenny(rerollCost(run.rerolls));
    }

    const q = run.quest;
    const qLocked = !!run.lockQuest;
    const chosen = $("questChosen");
    chosen.classList.toggle("hidden", !q);
    chosen.classList.toggle("locked", qLocked);
    if (q) {
      chosen.innerHTML =
        (qLocked ? LOCK_ICON + " " : "") +
        escapeHtml(q.n) +
        (isArena(q)
          ? ' <span class="qc-arena">Arena &mdash; nothing at stake</span>'
          : ` <span class="qc-worth">${zenny(q.r || 0)}</span>`) +
        (qLocked ? '<span class="qc-note">Locked &mdash; you owe this quest a retry</span>' : "");
    }
    // The search box would be a lie while the quest is locked — you can't pick.
    $("questSearch").classList.toggle("hidden", qLocked);
    if (qLocked) $("questResults").classList.add("hidden");

    const ready = !!(run.combo && run.quest);
    $("oClear").disabled = !ready;
    $("oCart").disabled  = !ready;
    $("oFail").disabled  = !ready;

    let hint = "";
    if (!run.combo) hint = "Get a weapon/style first.";
    else if (!run.quest) hint = "Name the quest you're hunting.";
    else if (isArena(run.quest)) hint = "Arena quest — reporting here won't cost you anything.";
    else if (run.combo && !isAlive(run.combo.weapon, run.combo.style))
      hint = "This combo has already fallen — report the hunt to draw a new one.";
    else if (run.attemptCarts) hint = run.attemptCarts + " cart(s) this attempt.";
    $("outcomeHint").textContent = hint;
  }

  function renderDeaths() {
    $("lostCount").textContent = run.deaths.length;
    $("aliveCount").textContent = run.active ? legalCombos().length : TOTAL_COMBOS;
    const el = $("deathList");
    if (!run.deaths.length) {
      el.innerHTML = '<p class="hint" style="margin:0">Nothing lost yet.</p>';
      return;
    }
    el.innerHTML = run.deaths.slice().reverse().map(d =>
      `<div class="bl-tag nuz-tag">` +
      `<span class="nuz-combo">${escapeHtml(WEAPON_ABBREV[d.weapon] || d.weapon)} + ${escapeHtml(d.style)}</span>` +
      `<span class="nuz-reason">${escapeHtml(d.reason)}</span></div>`
    ).join("");
  }

  function renderSummary() {
    const el = $("summary");
    if (!runOver()) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");

    const exhausted = legalCombos().length === 0;
    // Report the same quantity the survivor bonus is paid on — unspent
    // allowance — not the raw board count, which includes combos belonging to
    // retired weapons and so reads higher.
    const standing = runMax() - run.deaths.length;
    // Three ways to finish now, and which one it was is the headline.
    const why = exhausted
      ? "Every available combo has fallen."
      : clearCapHit()
        ? `You went the distance — ${CLEAR_LIMIT} successful hunts, with ${standing} combo${
            standing === 1 ? "" : "s"} still standing.`
        : `Ended manually with ${standing} still standing.`;
    const tile = ([val, label, cls, exact]) =>
      `<div class="sum-stat${cls ? " " + cls : ""}"${exact ? ` title="${escapeHtml(exact)}"` : ""}>` +
      `<b class="fit${fitClass(val)}">${escapeHtml(val)}</b><span>${label}</span></div>`;
    // Three rows, and the order is the point: the score is the headline, what
    // built it comes next, then how the run went, then what it cost you.
    // "Lost" is absent deliberately — Survived carries the same information.
    const scoring = [
      [fmtMult(run.mult), "Difficulty"],
      [zennyShort(run.earned), "Earned", "", zenny(run.earned)],
      [(runMax() - run.deaths.length) + "/" + runMax(), "Survived", "",
        Math.round(survivorRate() * 100) + "% of the run's combos still standing"],
      [zennyShort(survivorBonus()), "Survivor", "", zenny(survivorBonus())],
    ];
    const tally = [
      [clearsUsed() + "/" + CLEAR_LIMIT, "Cleared"],
      [String(run.hunts || 0), "Hunts"],
      [String(run.failed), "Failed"],
    ];
    // Each log lists what was bought and for how much; zero is still worth
    // showing, since "I never paid" is part of the record.
    const spend = ([n, log]) => log.map(r =>
      (WEAPON_ABBREV[r.weapon] || r.weapon) + " + " + r.style + " — " + zenny(r.cost)
    ).join("\n") || "None";
    const costs = [
      [String(run.carts), "Carts"],
      [String(run.rerolls || 0), "Rerolls", "", spend([run.rerolls, run.rerollLog || []])],
      [String(run.revives || 0), "Revives", "", spend([run.revives, run.reviveLog || []])],
    ];
    const final = zennyShort(finalScore());
    // The rules unlock the moment a run ends, so this panel reads ONLY the
    // snapshot taken at Start Run — never the live cfg. Falling back to cfg
    // would make a finished run's rules follow the sidebar around, which is the
    // one thing a record of what was played must not do.
    const rcfg = run.cfg;
    const rules = rcfg ? [
      ["Kill condition",    ruleLabel("kill", rcfg.kill)],
      ["Weapons/Styles",    ruleLabel("stylesPerWeapon", rcfg.stylesPerWeapon)],
      ["Loadout",           ruleLabel("assign", rcfg.assign)],
      ["Weapon/Style lock", rcfg.lockLoadout ? "On" : "Off"],
      ["Quest lock",        rcfg.lockQuest ? "On" : "Off"],
      ["Revives",           rcfg.reviveEnabled
        ? [zenny(rcfg.revivePrice), rcfg.reviveCap + " max",
           rcfg.reviveOnce ? "one per combo" : "repeatable"].join(" · ")
        : "Off"],
      ["Rerolls",           rcfg.rerollEnabled ? zenny(rcfg.rerollPrice) : "Off"],
    ] : [
      // No snapshot: only the styles cap survives, read back off the ceiling.
      ["Weapons/Styles", ruleLabel("stylesPerWeapon", capForCeiling(runMax())) ],
    ];
    const roll = run.deaths.map(d =>
      `<div class="bl-tag nuz-tag"><span class="sr-n">#${d.n}</span>` +
      `<span class="nuz-combo">${escapeHtml(WEAPON_ABBREV[d.weapon] || d.weapon)} + ${escapeHtml(d.style)}</span>` +
      `<span class="nuz-reason">${escapeHtml(d.reason)}${d.quest ? " · " + escapeHtml(d.quest) : ""}</span></div>`
    ).join("");
    el.innerHTML =
      `<h2>Run Over</h2>` +
      `<p class="sub">${escapeHtml(why)}</p>` +
      `<div class="sum-cols">` +
        `<section class="sum-panel"><h3>Rules</h3><div class="sum-rules">` +
          rules.map(([k, v]) =>
            `<div class="sr-row"><span>${k}</span><b>${escapeHtml(v)}</b></div>`).join("") +
        `</div>` +
        (rcfg ? "" : `<p class="hint">This run finished before the tracker started ` +
          `recording rules, so the rest weren't saved.</p>`) +
        `</section>` +
        `<section class="sum-panel sum-center">` +
          `<div class="sum-hero" title="${escapeHtml(zenny(finalScore()))}">` +
            `<b class="fit${fitClass(final)}">${escapeHtml(final)}</b><span>Final</span></div>` +
          `<div class="sum-stats cols-4">` + scoring.map(tile).join("") + `</div>` +
          `<div class="sum-stats cols-3">` + tally.map(tile).join("") + `</div>` +
          `<div class="sum-stats cols-3 last">` + costs.map(tile).join("") + `</div>` +
        `</section>` +
        `<section class="sum-panel"><h3>Quest Log</h3>` +
          (roll ? `<div class="sum-roll">${roll}</div>`
                : `<p class="hint">No combos lost.</p>`) +
        `</section>` +
      `</div>` +
      `<div class="row end gap"><button id="sumNew" class="btn tiny accent">Start New Run</button></div>`;

    $("sumNew").addEventListener("click", startRun);
  }

  function renderAll() {
    const running = run.active && !runOver();
    $("placeholder").classList.toggle("hidden", run.active);
    $("startBtn").classList.toggle("hidden", run.active && !runOver());
    $("endBtn").classList.toggle("hidden", !running);
    $("startBtn").textContent = run.deaths.length || run.active ? "Start New Run" : "Start Run";

    // Live while you're tuning; frozen to the run's snapshot once it starts.
    // May legitimately be zero or negative, so format it unconditionally.
    const m = cfgLocked() ? run.mult : multiplier(cfg);
    $("multValue").textContent = fmtMult(m);
    // A soft enough run nets out below zero, at which point it stops being a
    // bonus and starts costing you.
    $("multLabel").textContent = m < 0 ? "Difficulty Penalty" : "Difficulty Bonus";
    $("multBox").classList.toggle("negative", m < 0);
    $("multBox").classList.toggle("locked", cfgLocked());

    // Counts are on the labels now; this only explains the one number that
    // looks wrong — Prowler has 8 biases, so a cap of 6 retires it two short.
    $("poolNote").textContent = cfg.stylesPerWeapon === 6
      ? `Not quite all ${TOTAL_COMBOS}: Prowler has 8 biases, so it retires two short.`
      : "";

    applyCfgLockState();
    renderStatus();
    renderHuntBar();
    renderBoard();
    renderDeaths();
    renderSummary();
  }

  // ── Theme ────────────────────────────────────────────────────────────────
  // Themes are the 18 Deviants — this app's own identity, rather than the
  // Randomizer's classic monster palette. [label, hex, icon/full name]: the
  // label is the Deviant prefix so it fits the tile, the full name drives the
  // icon file and the tooltip.
  //
  // Most hexes are the right-hand stop of that Deviant's in-game pigment, which
  // is a two-color gradient. Several shift hue rather than shade across the
  // plate (Snowbaron white→purple, Boltreaver green→blue), so the right stop is
  // not simply a darker version of the left.
  //
  // Four are hand-picked rather than sampled: Dreadqueen takes Bloodbath's
  // purple left stop, Bloodbath takes the old Nightcloak navy, and Dreadking and
  // Nightcloak are deepened into a matched dark red / dark blue pair.
  //
  // These are tuned to look like the monster, not to spread evenly. Some
  // Deviants really are close to each other in game, and two similar plates is
  // the correct outcome when that's true — don't "fix" it by pushing them
  // apart. The one hard constraint is readability: white text must clear 4.5:1
  // on --bg, --bg2 and --hover, so re-check contrast after changing a hex.
  const COLORS = [
    ["Redhelm",     "#CE2A20", "Redhelm Arzuros"],
    ["Snowbaron",   "#8E6BC4", "Snowbaron Lagombi"],
    ["Stonefist",   "#E8776E", "Stonefist Hermitaur"],
    ["Dreadqueen",  "#4A2A66", "Dreadqueen Rathian"],
    ["Drilltusk",   "#D07A20", "Drilltusk Tetsucabra"],
    ["Silverwind",  "#7A858E", "Silverwind Nargacuga"],
    ["Crystalbeard","#CFAE44", "Crystalbeard Uragaan"],
    ["Deadeye",     "#3F7A2E", "Deadeye Yian Garuga"],
    ["Dreadking",   "#3E0C05", "Dreadking Rathalos"],
    ["Thunderlord", "#C79A1C", "Thunderlord Zinogre"],
    ["Grimclaw",    "#3070D0", "Grimclaw Tigrex"],
    ["Hellblade",   "#D25A18", "Hellblade Glavenus"],
    ["Nightcloak",  "#07143C", "Nightcloak Malfestio"],
    ["Rustrazor",   "#5E9CC8", "Rustrazor Ceanataur"],
    ["Soulseer",    "#DC6F9E", "Soulseer Mizutsune"],
    ["Boltreaver",  "#22D3DB", "Boltreaver Astalos"],
    ["Elderfrost",  "#B8C6CE", "Elderfrost Gammoth"],
    ["Bloodbath",   "#1E2440", "Bloodbath Diablos"],
  ];
  const COLORS_HEX = Object.fromEntries(COLORS.map(([n, h]) => [h.toUpperCase(), n]));
  const COLORS_ICON = Object.fromEntries(COLORS.filter(c => c[2]).map(([n, , i]) => [n, i]));

  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
    const l = (mx + mn) / 2;
    return [h / 6, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  }
  function hslToRgb([h, s, l]) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x]
      : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  }
  // shade/lighten only move lightness in HSL space, so the hue and saturation of
  // the chosen theme color are preserved — every derived shade stays in family.
  //
  // shade REMAPS the source lightness into [lo, hi] rather than multiplying and
  // clamping. The clamp it replaces was the reason every theme looked alike:
  // multiplying then capping at a single ceiling meant 17 of the 18 Deviants
  // landed on exactly that ceiling, so every background came out at the same
  // lightness and only a barely-visible hue told them apart. Remapping keeps the
  // pale Deviants pale relative to the dark ones while still bounding the top of
  // the range, so white text clears the 4.5:1 floor on every theme (worst case
  // is Crystalbeard's hover at 6.8:1).
  const shade = (rgb, lo, hi) => {
    const [h, s, l] = rgbToHsl(rgb);
    return hslToRgb([h, s, clamp01(lo + (hi - lo) * l)]);
  };
  const lighten = (rgb, b, minL) => {
    const [h, s, l] = rgbToHsl(rgb);
    return hslToRgb([h, s, clamp01(Math.max(l + (1 - l) * b, minL == null ? 0 : minL))]);
  };
  const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  function applyTheme(hex) {
    const c = hexRgb(hex), r = document.documentElement.style;
    r.setProperty("--bg",           css(shade(c, .10, .28)));
    r.setProperty("--bg1",          css(shade(c, .085, .23)));
    r.setProperty("--bg2",          css(shade(c, .07, .19)));
    r.setProperty("--hover",        css(shade(c, .17, .35)));
    r.setProperty("--accent",       css(shade(c, .10, .28)));
    r.setProperty("--accent-hover", css(lighten(c, .40, .62)));
    // A fallen combo used to be marked in a fixed red, which fought every theme
    // it wasn't Dreadking. These follow the theme instead, and sit above the
    // --bg2 band (which tops out at .19) so the tag still reads as marked —
    // the separation is lightness, not hue. The line-through on the combo name
    // carries the meaning regardless of color.
    r.setProperty("--fallen-line", css(shade(c, .28, .48)));
    r.setProperty("--fallen-fill", rgba(shade(c, .40, .62), .12));
    // Text on a fallen marker needs to clear the dark panel it sits on, so it
    // gets a floor rather than a band.
    r.setProperty("--fallen-text", css(lighten(c, .55, .72)));
    r.setProperty("--titlebar-overlay", "rgba(0,0,0,0.18)");
    r.setProperty("--text", "#ffffff");
    r.setProperty("--text-dim", "#fffffff5");
    r.setProperty("--line", "rgba(11,8,8,0.12)");
    r.setProperty("--card", "rgba(255,255,255,0.05)");
    try { localStorage.setItem("mhgu-nuzlocke-theme", hex); } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
    const ti = document.querySelector(".title-icon");
    if (ti) {
      const name = COLORS_HEX[hex.toUpperCase()];
      ti.src = name ? monsterIcon(COLORS_ICON[name] || name) : FALLBACK_ICON;
      ti.onerror = () => { ti.onerror = null; ti.src = FALLBACK_ICON; };
    }
  }
  function buildSwatches() {
    const wrap = $("swatches"); wrap.innerHTML = "";
    COLORS.forEach(([name, hex]) => {
      const full = COLORS_ICON[name] || name;
      const d = document.createElement("div");
      d.className = "swatch"; d.dataset.hex = hex; d.style.background = hex; d.title = full;
      d.innerHTML = `<img class="swatch-icon" src="${monsterIcon(full)}" alt=""><span>${escapeHtml(name)}</span>`;
      d.querySelector("img").onerror = function () { this.onerror = null; this.src = FALLBACK_ICON; };
      d.addEventListener("click", () => applyTheme(hex));
      wrap.appendChild(d);
    });
  }

  // ── Payment ──────────────────────────────────────────────────────────────
  // One modal serves both revives and rerolls, settled by deducting from what
  // the run has earned.
  //
  // Paying in materials was dropped deliberately. It looked free to the app but
  // wasn't to the player — selling a rare part hurts, selling ten Iron Ore
  // doesn't, and nothing here can tell the difference. An unmeasurable cost
  // can't be balanced, and simulation showed it acting as a free run
  // extension. Zenny is a cost the app can actually see and price.
  function askPayment({ title, sub, cost, onPaid }) {
    $("reviveTitle").textContent = title;
    $("reviveSub").textContent = sub;
    $("reviveOptions").innerHTML =
      `<button type="button" class="revive-opt pay-zenny" data-pay="1">` +
      `<span class="ro-line"><span class="ro-name">Deduct from earned zenny</span></span>` +
      `<span class="ro-total">&minus;${zenny(cost)}</span></button>`;
    $("reviveOptions").querySelector("[data-pay]").addEventListener("click", () => {
      $("reviveModal").classList.add("hidden");
      onPaid({ total: cost });
    });
    $("reviveModal").classList.remove("hidden");
  }

  function openRevive(w, s) {
    if (!canRevive(w, s)) return;
    const cost = reviveCost(run.revives);
    askPayment({
      title: (WEAPON_ABBREV[w] || w) + " + " + s,
      sub: `Revive #${run.revives + 1} of ${reviveAllowance()}.`,
      cost,
      onPaid: (option) => doRevive(w, s, option),
    });
  }

  function openReroll() {
    if (!canReroll()) return;
    const cost = rerollCost(run.rerolls);
    const c = run.combo;
    askPayment({
      title: "Reroll " + (WEAPON_ABBREV[c.weapon] || c.weapon) + " + " + c.style,
      sub: `Reroll #${run.rerolls + 1}.`,
      cost,
      onPaid: (option) => doReroll(option),
    });
  }

  // ── Confirm modal ────────────────────────────────────────────────────────
  let confirmAction = null;
  function askConfirm(title, body, fn) {
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body;
    confirmAction = fn;
    $("confirmModal").classList.remove("hidden");
  }

  // ── Export / import ──────────────────────────────────────────────────────
  function exportRun() {
    const blob = new Blob([JSON.stringify({ v: 1, cfg, run }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mhgu-nuzlocke.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importRun(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        if (d.cfg) cfg = Object.assign({}, DEFAULT_CFG, d.cfg);
        if (d.run) run = Object.assign(emptyRun(), d.run);
        rebuildDeadKeys(); writeCfgToDom(); save(); renderAll();
      } catch (e) {
        const b = $("importBtn"); const t = b.textContent;
        b.textContent = "Invalid file!";
        setTimeout(() => { b.textContent = t; }, 2000);
      }
    };
    fr.readAsText(file);
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  // Generic accordion — any .panel-head toggles its own panel.
  document.querySelectorAll(".panel-head").forEach(h => {
    h.addEventListener("click", () => {
      const p = h.parentElement;
      p.dataset.open = p.dataset.open === "true" ? "false" : "true";
    });
  });

  document.querySelector(".sidebar").addEventListener("change", (e) => {
    if (e.target.closest(".panel-body")) {
      readCfgFromDom();
      save(); renderAll();
    }
  });

  $("startBtn").addEventListener("click", () => {
    if (run.active && run.deaths.length) {
      askConfirm("Start a new run?",
        "This clears the current run — " + run.deaths.length + " fallen combo(s) and all progress.",
        startRun);
    } else startRun();
  });
  $("endBtn").addEventListener("click", () => {
    askConfirm("End this run?", "The run is closed out and you'll get the summary.", endRun);
  });

  $("rollBtn").addEventListener("click", () => {
    if (run.combo) return;
    const c = rollCombo();
    if (!c) { renderAll(); return; }
    run.combo = c; save(); renderAll();
  });

  // Only ever accept a combo that actually exists and is still alive — the
  // selects are empty while the app is rolling for you, and a change event
  // fired against them would otherwise produce a phantom "|" combo that can be
  // hunted with and killed.
  const setPickedCombo = (w, s) => {
    if (!ALL_WEAPONS.includes(w)) return;
    const styles = legalStyles(w);
    const style = styles.includes(s) ? s : styles[0];
    if (!style) return;
    run.combo = { weapon: w, style };
    save(); renderAll();
  };
  $("pickWeapon").addEventListener("change", () =>
    setPickedCombo($("pickWeapon").value, null));
  $("pickStyle").addEventListener("change", () =>
    setPickedCombo($("pickWeapon").value, $("pickStyle").value));

  $("questSearch").addEventListener("input", (e) => renderQuestResults(e.target.value));
  $("questResults").addEventListener("click", (e) => {
    const row = e.target.closest("[data-i]");
    if (row) chooseQuest(searchResults[+row.dataset.i]);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".hunt-quest")) $("questResults").classList.add("hidden");
  });

  $("oClear").addEventListener("click", () => report("clear"));
  $("oCart").addEventListener("click",  () => report("cart"));
  $("oFail").addEventListener("click",  () => report("fail"));

  $("helpBtn").addEventListener("click", () => $("helpModal").classList.remove("hidden"));
  $("helpClose").addEventListener("click", () => $("helpModal").classList.add("hidden"));
  $("themeBtn").addEventListener("click", () => $("themeModal").classList.remove("hidden"));
  $("themeClose").addEventListener("click", () => $("themeModal").classList.add("hidden"));
  $("linksBtn").addEventListener("click", () => $("linksModal").classList.remove("hidden"));
  $("linksClose").addEventListener("click", () => $("linksModal").classList.add("hidden"));
  [["helpModal"], ["themeModal"], ["linksModal"], ["confirmModal"]].forEach(([id]) => {
    $(id).addEventListener("click", (e) => { if (e.target.id === id) $(id).classList.add("hidden"); });
  });
  // Board is rebuilt on every render, so delegate rather than binding cells.
  $("board").addEventListener("click", (e) => {
    const cell = e.target.closest(".cell.revivable");
    if (cell) openRevive(cell.dataset.w, cell.dataset.s);
  });
  $("rerollBtn").addEventListener("click", openReroll);
  $("reviveCancel").addEventListener("click", () => $("reviveModal").classList.add("hidden"));
  $("reviveModal").addEventListener("click", (e) => {
    if (e.target.id === "reviveModal") $("reviveModal").classList.add("hidden");
  });

  $("confirmCancel").addEventListener("click", () => $("confirmModal").classList.add("hidden"));
  $("confirmOk").addEventListener("click", () => {
    $("confirmModal").classList.add("hidden");
    if (confirmAction) { const f = confirmAction; confirmAction = null; f(); }
  });

  $("exportBtn").addEventListener("click", exportRun);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importRun(e.target.files[0]);
    e.target.value = "";
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  buildSwatches();
  const DEFAULT_THEME = "#07143C";            // Nightcloak Malfestio
  let savedTheme = DEFAULT_THEME;
  try { savedTheme = localStorage.getItem("mhgu-nuzlocke-theme") || savedTheme; } catch (e) {}
  // A stored hex that's no longer in the palette would leave no tile selected and
  // no title icon, so fall back rather than half-applying it.
  if (!COLORS_HEX[savedTheme.toUpperCase()]) savedTheme = DEFAULT_THEME;
  applyTheme(savedTheme);

  load();
  writeCfgToDom();
  $("questSearch").placeholder = "Search " + QUESTS.length + " quests…";
  renderAll();
})();
