# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project

**MHGU Zenny Gauntlet** — a static GitHub Pages site running a scored challenge in
Monster Hunter Generations Ultimate: 50 quests, permadeath on weapon/style combos, and
zenny for a score.

Renamed from *MHGU Nuzlocke Tracker*. It stopped being a Nuzlocke once revives and a
tunable difficulty economy went in — a Nuzlocke is binary, you finish it or you don't,
whereas this is scored and its difficulty is a dial. Permadeath is now a mechanic
inside it rather than its identity. No build step, no framework, no dependencies.

Live at https://ArmoredRaven17.github.io/MHGU-Zenny-Gauntlet/, served from `docs/`.

**To develop:** `python -m http.server 5580 --directory docs`, or use the
`mhgu-zenny-gauntlet` entry in the Randomizer repo's `.claude/launch.json`. Open over
`http://` rather than `file://` — localStorage is isolated on `file://`.

## Files

| File | |
|---|---|
| `docs/index.html` | Markup, sidebar panels, modals |
| `docs/styles.css` | All styling; theme CSS variables are set at runtime |
| `docs/app.js` | All logic (one IIFE, no modules) |
| `docs/data.js` | `window.MHGU_QUESTS` — 1297 slimmed quest records; Arena and Prowler filtered at load |

**Critical:** the Pages CDN caches by full URL. Every push touching `styles.css`,
`app.js` or `data.js` **must** increment the `?v=N` on its tag in `index.html`, or
users keep the stale copy until they hard-refresh.

## Core concept

The unit of loss is a **weapon + style combo**, stored as `{weapon, style}` and keyed
`"weapon|style"`. 14 × 6 = **84**.

**Prowler was removed.** It was the one weapon whose slots were biases rather than
styles — 8 against everything else's 6 — which cost a second board grid, a `stylesFor`
special case, and a footnote explaining why a cap of 6 gave 90 rather than 92. Removing
it scaled every ceiling by exactly 14/15, because Prowler contributed `min(cap, 8)` and
for caps 1–6 that is just `cap`. Uniform scaling, so the balance ratios barely moved;
the factors were re-solved anyway and the largest shift was ~5% on the styles cap.

**`cfg.stylesPerWeapon` caps how many styles a weapon may lose before the whole weapon
retires**, taking its surviving styles out of the pool. This is the main control on run
length: 84 loadouts is a long run, so the default cap of 3 brings it to 42 (cap 1 = 14,
cap 6 = 84). A retired weapon's live styles render `.retired` — faded and dotted,
visibly distinct from `.dead`, because they were never lost.

`stylesLost()` counts from `run.deaths`, so a revive (which *removes* a death) can
un-retire a weapon. That falls out of the design rather than needing special handling.

## Architecture

**`cfg`** holds the rule toggles and outlives individual runs. **`run`** holds the
run itself and is wiped by Start Run. `deadKeys` is a derived `Set` rebuilt on load,
never persisted. Both persist to one localStorage key, `mhgu-zenny-gauntlet`.

**The pool is enumerated, never rejection-sampled.** `legalStyles` / `legalWeapons` /
`legalCombos` build the list of what survives, and `rollCombo` picks from it. There
are deliberately **no fallbacks** — no "reroll 50 times then use it anyway", no
default weapon or style. An empty pool is the run-end state, not an error to paper
over. Adding a fallback here would silently resurrect dead combos, which is the one
bug that would invalidate the whole app.

**Run-over is derived** (`legalCombos().length === 0`), not latched, so it recomputes
after every death and after any revive.

**Ordering in `report()` is load-bearing** — three things will break subtly if moved:

1. Deaths apply **before** locks engage, so a combo that just died is never locked to.
2. `kill()` is **idempotent** — several conditions firing on one failure record a
   single death, tagged with the first matching reason.
3. `failStreak++` happens **before** the streak check, so the second consecutive
   failure fires it rather than the third.

A clear resets the streak and discharges the quest lock. A clear never releases the
loadout lock — only the combo dying does.

**The rules freeze once a run starts.** `cfgLocked()` disables every config input
while a run is live and `readCfgFromDom()` no-ops, so the difficulty you committed to
can't be softened the moment a condition is about to cost you something. They unlock
again when the run ends.

**Arena and Prowler quests are filtered out of the pool** at the top of `app.js`, so
`QUESTS` is 1,136 rather than 1,297 — 58 Arena and 103 Prowler.
A Prowler quest is hunted as a Palico, so none of the 84 combos is at stake on one. An Arena quest hands you a fixed set of five weapons, so there
is no combo of yours to put at stake; honouring that would mean granting an attempt per
set, which is a different game. `isArena(q)` and the `counts` gate in `report()` survive
as a guard for runs saved before the filter existed — without them, restoring such a run
would score a quest that was played on the understanding it counted for nothing.

**Clearing a quest spends it for the run** (`run.questsDone`, keyed `Type|Name`).
Fifty clears means fifty different quests. Only a *clear* spends one, and that is
load-bearing rather than flavour: consuming on any attempt would make the quest lock
demand a retry of a quest that no longer exists. The rule exists because farming the best-paying quest fifty times was
worth **5.17×** playing at random — a larger score swing than any difficulty lever, and
invisible to every simulation, since they all picked quests uniformly. It costs an
ordinary player almost nothing: fifty draws from 1,136 collide about once per run.

## Theme

The palette is the **18 Deviants** — this app's own identity, not the Randomizer's
classic monster colors. `COLORS` entries are `[label, hex, full name]`: the label is
the Deviant prefix so it fits the square tile, the full name drives both the icon file
and the tooltip. The picker markup and CSS match the Randomizer's exactly.

`applyTheme` derives every CSS variable from the one hex by shifting lightness in HSL,
so hue and saturation carry through. **`shade(rgb, lo, hi)` remaps the source lightness
into a range** rather than multiplying and clamping — a plain multiply-then-clamp made
17 of the 18 Deviants land on the same ceiling, so every background came out the same
lightness with only a faint hue to tell them apart. Remapping keeps the pale Deviants
pale relative to the dark ones while still bounding the top.

**The hexes are tuned to look like the monster, not to spread evenly across the
palette.** Some Deviants really are close to each other in game, so two similar plates
is a correct outcome — don't push them apart to "fix" it. Colour choices are the
owner's call.

**The one hard constraint is readability: re-check contrast after changing a hex.**
White text must clear 4.5:1 on `--bg`, `--bg2` and `--hover`. All 18 currently do;
worst case is Crystalbeard's `--hover` at 6.8:1.

A stored hex that's no longer in `COLORS` falls back to the default rather than
half-applying (no tile selected, no title icon).

## Scoring

Clearing a quest earns its **real in-game zenny reward** (`q.r`) times the run's
difficulty multiplier. Points only ever go up — a failure costs you a loadout, which
is the punishment. Arena earns nothing, consistent with it costing nothing.

**Every lever is a ratio and they multiply.** `LEVERS` at the top of `app.js` is the
single table, and tuning the curve means editing it and nothing else. The reference run
— carts and quest failures, 3 styles, `loadout: "hold"`, quest lock on, no revives or
rerolls — is exactly `1.00`, which also means it pays each quest's real in-game zenny
untouched.

Each option carries **two** numbers and the gap between them is the point:

- `factor` — what earnings are multiplied by. Never displayed.
- `effect` — what the option does to your final **score**. This is what the XS…XL badge
  and the difficulty rating are built from.

They differ because a harder setting also makes the run shorter, so it banks fewer
clears. One style per weapon needs an internal ×4.48 to land on a ×1.60 score. The old
additive scheme showed that 4.48 to the player as a promise, which is exactly why it
kept lying: **no single displayed number can be both the per-clear rate and the
final-score ratio**, and that is mechanical, not a presentation choice.

`factor` is solved by fixed point — `factor = effect / measured relative length`,
iterated to stability — in `scratchpad/sim-multiplicative.js`. Re-run it if you retune
`effect`. Converges in two passes; every single-lever change then lands within 1% of
target, and the inversion rate over 720 configurations is 0.42% against 1.70% for the
additive scheme.

**Nothing numeric reaches the UI.** `badge(effect)` gives `+M` / `−XL` / `±0` using
Attack Up's shirt-size vocabulary, and `ratingFor(difficulty(cfg))` gives Very Easy …
Very Hard. `paintBadges()` writes every sidebar badge from `LEVERS` at init, so the
markup holds empty `<span class="w">` and cannot drift from the table the way hardcoded
numbers did.

Watch the `sizeOf` boundaries: they compare against the table's own values, and
`1.15 - 1` is `0.1499999999999999` in binary floating point, which silently demoted
cycling from M to S. Hence the `1e-9` epsilon.

**The badge can saturate; the rating cannot.** Size is the distance from 1, which on the
costly side can never exceed 1.00 however harsh an option is, while the rating is a
product with no ceiling. An XXL tier was added to separate the two harshest kill
conditions (0.62 and 0.74, both reading XL) and then removed again when retiring `same
quest failed twice` dissolved the collision instead. The largest size left is 0.62, so
XXL could never fire, and an unreachable band is worse than none. If a harsher lever
ever lands, the durable fix is `|ln(effect)|` — the natural metric where every lever is
a ratio, unbounded both ways — but it re-bands 18 of the 34 badges, so it is not worth
doing pre-emptively.

**Run the degeneracy audit before trusting a weight** (`scratchpad/sim-degeneracy.js`).
Every earlier simulation compared final score, which the multiplier dominates, so an
option whose rule did nothing still looked distinct from its neighbour — and the
inversion audit then checked that against the same assumption baked into the weights.
Self-consistent, and wrong. With revives off the multiplier has no effect on play, so
the death distribution is a pure function of the rules: two options that produce the
same distribution are the same rule, whatever we pay for them. That is what `twice`
was, and nothing else found it.

Two of its findings are *not* bugs and should not be "fixed":

- **Caps 4/5/6 have identical death counts** but are not degenerate. Above cap 3 the
  50-clear limit binds first, so the lever stops working through deaths and works
  through survivor rate instead — `L` still climbs 71.5 → 77.2 → 81.0.
- **The quest lock is indistinguishable from no lock** under every remaining kill
  condition (KS 0.008–0.016). That is the model being blind, not the lever being dead.
  The lock exists so you cannot dodge a difficult quest you chose and lost, and every
  quest in the simulator is equally winnable — so there is no difficult quest to dodge
  and nothing for the lock to prevent. Sweeping the retry win rate from 0.50 to 0.90
  (`scratchpad/sim-questlock-sensitivity.js`) moves it between 0.84× and 1.08×,
  straddling 1.00 and never reaching the 1.18× that charging 0.85 to remove it implies.
  Do not hunt for a net figure to replace 0.85. These levers push **both ways at once
  and for different reasons** — the retry is harder because that quest already beat you,
  and easier because you have now seen the fight and can prepare for it — so the net is
  whatever you assumed going in. The four LEVER PLACEHOLDER entries (`quest`, `assign`,
  `loadout`, `rerollOn`) are deliberately not priced on outcome. They pay for **accepting
  a restriction**, and what they are worth is what you gave up. That is a design
  decision, and no amount of simulation will produce it.

**The rating bands are set from the real distribution**, not round numbers. Across all
49,200 reachable configurations the median is 0.30 and **98% sit below the reference**,
because the app has one lever that tightens a run (`loadout: "cycle"`) and roughly ten
that loosen it. The defaults are genuinely Hard. That is a content fact, not a scaling
problem — more levers shaped like cycling are what would populate the top.

**The total can no longer go negative.** Under the additive scheme 28% of
configurations scored as penalties; a product of positive ratios cannot. The only route
below zero now is spending past your earnings on a buy-back, which `settle()` permits
deliberately: you wanted the combo, you paid the price, and now you hunt your way out
of the hole. Do not add an affordability gate.

`zenny` uses a typographic minus (−) rather than a hyphen, and so does `badge`, so a
`−M` in the sidebar and a negative total read as the same character.

**`autoRoll` is convenience, not a lever.** It decides whether the app hands you a combo
the moment one is needed or waits for the button, and it is deliberately absent from
`LEVERS` — it changes how many clicks a run costs, never what the run is worth. It lives
in the gear modal beside the theme, not in the sidebar, because the sidebar is rules.

It is also deliberately **not** in `CFG_BOXES`. Everything in there is a run rule and is
frozen for the duration by `applyCfgLockState`, and `readCfgFromDom` bails out entirely
while a run is on — a preference must stay changeable mid-run, so it has its own change
handler writing `cfg.autoRoll` directly, its own line in `writeCfgToDom`, and a disabled
state driven only by `cfg.assign !== "roll"`. It still persists, since `save()`
serialises the whole of `cfg`.

`maybeAutoRoll()` runs from `afterMutation()` rather than from a render, so state is
never mutated while drawing. It is idempotent — it returns early once `run.combo` is set
— and every path that clears `run.combo` goes through `afterMutation`, including
`startRun`, which is why starting a run deals the first combo too.

**The loadout rule has three options.** `hold` keeps a combo until it dies; `cycle`
hands it in on every clear but keeps it through a failure; `rotate` hands it in win or
lose. `cycle` and `rotate` share the clear path and differ on failure, where `cycle`
keeps.

**"May swap once per quest" was retired**, and the reasoning generalises. It let you
trade your combo once per quest for one you had never hunted with, and it went through
several repairs — forced to optional, then constrained to unused combos, then opt-in
behind a button with a Cancel — each fixing a real defect and none fixing the option.
Two things settled it:

- It measured at **1.00**, exactly `hold`, so it was never the easier option it claimed
  to be. Only a player using it perfectly gained anything (+1.6%); one who swapped
  whenever offered *lost* 2.8%. A choice that punishes the people most likely to take it.
- It strictly dominated the reroll lever. A reroll costs escalating zenny for a *random*
  combo; the swap was free and let you *choose*. Both enabled, the paid one was never
  worth using.

Saved configs on `free` migrate to `hold` in `load()` — the same difficulty, so nobody
is moved by losing it. Its whole apparatus went with it: `run.used`, `run.swapUsed`,
`swapPool()`, `canSwap()`, the disabled-option labelling, and the Swap/Cancel buttons.

Weights step evenly (1.00 / 1.15 / 1.30 / 0.85) because these are priced by the
restriction accepted, not by measured outcome — the simulator treats every combo as
equally winnable, so it can say nothing about which one you hold. Even steps also keep
all four badges distinct (±0 / +M / +L / −M), which matters given what happened the last
time two options shared a badge while moving the rating a whole band.

**The kill conditions are a radio group, not checkboxes** — `cfg.kill` is one of
`both | cart | fail | streak`.

**`same quest failed twice` was retired**, and how it survived as long as it did is the
more useful lesson. With the quest lock on, failing Q forces your next hunt to be Q, so
every failure is followed by a retry of that same quest and "two failures in a row" and
"the same quest twice" become the same event — and since a quest is spent on clear, a
failure banked against a quest you later cleared can never be collected. Provable, and
measured: identical death distributions at KS 0.0000 over 8,000 runs. It was paid 32%
less for an identical run, so it was strictly dominated. With the lock off it fires
almost never (0.17 mean deaths, 85% of runs lose nothing), because you would have to
redraw a quest you already failed out of 1,136 in ~69 hunts. There is no setting at
which the rule means anything of its own.

Saved configs holding `twice` migrate to `streak` in `load()`, not to the default — they
played identically, and falling through to the guard would have thrown someone on the
gentlest condition onto the harshest. `RETIRED_LABELS` keeps a name for it so a run
already finished under it still reports its own rules.

Note what `both` exists for: **a quest can fail without carting** — you can time out or
slay a capture target — and you can cart twice and still clear, so cart and quest-failed are
genuinely independent triggers — neither subsumes the other. `both` is their union and
is offered explicitly, which is what lets a radio still work. Everything below
quest-failed *is* subsumed by it, so no other combination is meaningful. Because a
radio always has a selection, there is no "at least one condition" guard to maintain.

The only other radio is `assign`; the rest are plain booleans. `CFG_RADIOS` maps a cfg
key to its value→element-id table; `CFG_BOXES` covers the booleans.

**The baseline is `loadout: "hold"` plus the quest lock — the 1× reference.**

- **`cfg.loadout`** is three-way, not a boolean, and it is simply whether `run.combo`
  survives the end of `report()`. There is no separate `lockCombo` state.
  - `hold` — kept until it dies, through *clears* as well as failures. The reference.
  - `cycle` — a **clear** hands it in; a **failure** keeps it. That asymmetry is the
    whole point: under a harsh kill condition the combo dies on a failure anyway, and
    under a gentle one keeping it lets you take the quest that beat you again with the
    same combo, which is exactly what the quest lock is asking for.
  - `free` — pick again every hunt.

  A cart can kill the held combo without ending the attempt, so `run.combo` may briefly
  point at a dead combo; the status chip and outcome hint detect that (`isAlive`) and
  say "fallen" rather than "until it falls"/"until you clear". It self-clears on the
  next resolution.

  `cycle` is **the only lever that scores above the reference** (+0.15). Everything else
  in the app either costs nothing or hands something back, which is why the difficulty
  distribution is one-sided — 98% of configurations sit below the default. More levers
  of this shape would fix that.

  **LEVER PLACEHOLDER**: +0.15 is judgement, not measurement, and cannot be otherwise.
  The simulator treats every combo as equally winnable — a deliberate design call, since
  players prefer combos that aren't objectively strongest — so a model where combos are
  interchangeable can never measure a rule about *which* combo you hold. `pickOwnLoadout`
  and `loadoutUnlocked` are unmeasurable for the same reason.

  Saves predating this are migrated by `migrateLoadout()`, keyed off whether the
  **source** has a `loadout` string. Do not key it off the target: `cfg` is seeded from
  `DEFAULT_CFG` and so always holds `"hold"` by then, which silently skips every
  migration. A run's own `run.cfg` snapshot is migrated too, so a finished run still
  reports the rules it was played under.
- **Quest lock**: a single-retry obligation. `report()` clears `run.lockQuest` at the
  top of any resolution — reaching an outcome discharges the debt — and the fail
  branch immediately re-owes it, so consecutive failures still pin you to the quest.

Both `run.mult` (what earnings are multiplied by) and `run.diff` (what the run rates
as) are snapshotted at Start Run, alongside `run.maxLosses` and `run.cfg`.
Since the rules freeze for the run anyway this is belt-and-braces, but the rules unlock
again the moment a run ends, so without it the summary would ask `cfg` about a
configuration that is no longer selected.

### Run length

**A run is `CLEAR_LIMIT` successful hunts (50), or exhaustion, whichever comes first.**
This is fixed, not a lever, and it counts clears rather than attempts. Both parts are
load-bearing and neither should be softened without re-simulating:

- **It cannot be optional.** Unbounded, the gentle kill conditions win on sheer length —
  the gentlest ran a median 1,384 hunts against 102 for the default and scored 2.27× it,
  inverting the whole difficulty ordering.
- **It cannot be a scored lever.** A limit only binds when a run would otherwise outlast
  it, so a short configuration could take the tightest limit, never reach it, and
  collect the bonus for free.
- **It counts clears, not attempts.** A failure never positively contributes, so it must
  not extend the clock in a way that benefits you either. Under an attempt cap it did:
  the gentle conditions spent their whole allowance earning while the harsh ones wiped
  early and stopped, which combined with the survivor bonus to put `two in a row` above
  the stricter `quest failed` at a 65% win rate. Counting clears hands every run the
  same 50 payouts unless it wipes first, so the multiplier is what separates them.

**The survivor bonus** pays `earned × survivorRate × SURVIVOR_BONUS`, where
`survivorRate` is unspent allowance over `run.maxLosses`. Proportional rather than flat
per combo, because a flat pot pays most to the loosest settings simply for having 90
combos and gentle rules; as a share, keeping 5 of 15 scores like keeping 15 of 45. It is
only ever a bonus — scaling a negative total by survival would punish keeping combos.

Report unspent allowance in the summary, not `legalCombos().length`. The board count
includes combos on retired weapons and reads higher than the figure the bonus is
actually paid on.

## Design principle

**Every rule is a lever.** Where a rule could reasonably go either way, it's a toggle
rather than a decision — players want everything from a gentle first run to the
harshest possible one.

When adding a rule, default to exposing it rather than picking a side.

## Data

`docs/data.js` is **generated** — do not hand-edit. Run:

```bash
node scripts/build-data.js [pathToNativeNX]
```

Keys are terse: `t` type, `n` name, `l` level, `m` main monster, `ms` all monsters,
`loc` locale, `p` Prowler, `r` zenny reward, `fee` contract fee.

It merges two sources: the Randomizer's `docs/data.js` for the quest list, and
**extracted MHGU game files** for the reward money, which exists in no other dataset —
not in any repo here, and not on the wikis. The game stores it in a 369-byte struct per
quest inside `loc/arc/quest/qNNNNNNN.arc`; **reward is a u32 LE at 0x39**, contract fee
at 0x41. Those offsets were derived empirically, not from a spec — 0x39 is the only u32
that is round, populated across all 1849 quests, and rises monotonically with rank
(including the Low→High Rank reset at Village 7 and Hub 4).

Names join on the `_eng` GMD inside the same archive. 1163 of 1297 match 1:1; the rest
share a title across ranks and are resolved by the quest id's rank prefix, itself
learned from the unambiguous matches rather than hardcoded.

The script has sanity gates and exits non-zero rather than writing suspect data: no
quest may lack a reward, and every non-Prowler reward must be a multiple of 300.
Prowler quests are deliberately exempt — they pay their own lower, non-300-aligned
scale (`Village 7★ // Conga Line` at 180z is correct, not a mapping error).

Quest identity is `Type|Name`. Five quests share a duplicate pair, so two distinct
quests can share a `questFails` tally — negligible in practice, noted rather than
fixed.

## Related repos

Siblings sharing assets and the theme system, but no state: MHGU Quest Randomizer,
MHGU Bingo, MHGU Hunting Log, MHGU Collection Tracker.

## Materials

`docs/materials.js` is **generated** — do not hand-edit. Run:

```bash
node scripts/build-materials.js [pathToNativeNX]
```

1658 sellable materials as `{i: id, n: name, v: sell price, t: tier, r: rarity}`,
extracted from `nativeNX/table/itemData.itm` (2991 fixed 44-byte records; the record
index *is* the item id, asserted at build time). Names come from mhgu-editor's
`items.json` — this dump has no English item GMD.

**Sell price is u32 LE at 0x13; buy price is at 0x17.** Not the other way round: 0x17
is exactly 10× 0x13 for 2223 of 2418 priced items, and every exception is a *buyable*
consumable whose real shop price breaks the ratio (Potion 7/66, Nutrients 25/760).
Unbuyable materials get the flat 10× placeholder — which is what you'd expect if 0x17
were the buy price.

Materials are isolated by stack size 99 at `0x06` (consumables stack lower) *and* a
non-zero tier at `0x1b` (which excludes books, ammo and tools — the stack test alone
lets ammo through).

Values run 1z to 40,000z, median 1,640z, p95 14,000z.

## Revive economy

Click a struck-through cell on the board to buy that combo back. The Nth buy-back of a
run costs `N × cfg.revivePrice`, and **the price is itself a lever** — the options and
what charging them is worth live in `REVIVE_PRICE_WEIGHT`. A cheap safety net makes the
run easier and scores lower; a dear one barely helps and scores higher.

`reviveOptions()` returns three distinct bundles of 1-3 materials totalling within
`REVIVE_TOLERANCE` of the target, seeded on (combo, revive number) so closing and
reopening the modal doesn't reroll the price mid-decision.

**Quantities are a last resort, not the mechanism.** Each slot only considers materials
dear enough that a small multiple covers its share (`SOFT_QTY`). Without that floor the
search returns things like "33x Hermitaur Scrap" — arithmetically correct, useless as a
price. The cap lifts once the target outgrows what three materials can cover (the
dearest is 40,000z), because past that point multiples are the only way there.

`run.revived` maps comboKey → times bought back and is what makes the "once per combo"
lever possible: it survives the death entry being *removed* from `run.deaths`, which a
revive does.

## Not built yet

Nothing structural outstanding. Monster attribution for materials remains unavailable
(see above), so revive pricing is by value only.

**Monster attribution is not available.** There is no monster→material mapping in the
extracted game files: `table/` has only the Prowler (`MonNyan*`) reward lots, the
`quest\rem\*` entries inside quest archives are quest reward lots rather than carves,
and `sa/NX/root.arc` is a packed shader cache. Pricing therefore has to be by value,
not by "bring me Rathalos parts", unless that mapping is sourced separately.
