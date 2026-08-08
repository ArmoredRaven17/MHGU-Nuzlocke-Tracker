# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project

**MHGU Nuzlocke Tracker** — a static GitHub Pages site tracking a Nuzlocke run in
Monster Hunter Generations Ultimate. No build step, no framework, no dependencies.

Live at https://ArmoredRaven17.github.io/MHGU-Nuzlocke-Tracker/, served from `docs/`.

**To develop:** `python -m http.server 5580 --directory docs`, or use the
`mhgu-nuzlocke` entry in the Randomizer repo's `.claude/launch.json`. Open over
`http://` rather than `file://` — localStorage is isolated on `file://`.

## Files

| File | |
|---|---|
| `docs/index.html` | Markup, sidebar panels, modals |
| `docs/styles.css` | All styling; theme CSS variables are set at runtime |
| `docs/app.js` | All logic (one IIFE, no modules) |
| `docs/data.js` | `window.MHGU_QUESTS` — 1297 slimmed quest records |

**Critical:** the Pages CDN caches by full URL. Every push touching `styles.css`,
`app.js` or `data.js` **must** increment the `?v=N` on its tag in `index.html`, or
users keep the stale copy until they hard-refresh.

## Core concept

The unit of loss is a **weapon + style combo**, stored as `{weapon, style}` and keyed
`"weapon|style"`. **Prowler is a weapon whose 8 biases occupy the style slot**, so the
store is uniform and Prowler needs no special case. 14 × 6 + 8 = **92**.

**`cfg.stylesPerWeapon` caps how many styles a weapon may lose before the whole weapon
retires**, taking its surviving styles out of the pool. This is the main control on run
length: 92 loadouts is a long run, so the default cap of 3 brings it to 45 (cap 1 = 15,
cap 6 = 90). A retired weapon's live styles render `.retired` — faded and dotted,
visibly distinct from `.dead`, because they were never lost.

`stylesLost()` counts from `run.deaths`, so a revive (which *removes* a death) can
un-retire a weapon. That falls out of the design rather than needing special handling.

Note cap 6 gives 90, not 92: Prowler has 8 biases and the cap applies uniformly, so it
retires two short. Uniformity is worth more than the two loadouts.

## Architecture

**`cfg`** holds the rule toggles and outlives individual runs. **`run`** holds the
run itself and is wiped by Start Run. `deadKeys` is a derived `Set` rebuilt on load,
never persisted. Both persist to one localStorage key, `mhgu-nuzlocke`.

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

**Arena quests are inert.** `isArena(q)` gates the whole scoring path: no death, no
streak change, no tally. Locks stay engaged across an Arena hunt.

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

**If you add or retune a color, re-check contrast** — that's the failure mode here, not
the hue. All 18 currently clear the 4.5:1 floor for white text; worst case is
Crystalbeard's `--hover` at 6.8:1.

A stored hex that's no longer in `COLORS` falls back to the default rather than
half-applying (no tile selected, no title icon).

## Scoring

Clearing a quest earns its **real in-game zenny reward** (`q.r`) times the run's
difficulty multiplier. Points only ever go up — a failure costs you a loadout, which
is the punishment. Arena earns nothing, consistent with it costing nothing.

The multiplier comes from two tables at the top of `app.js`, and **tuning the
difficulty curve means editing those and nothing else**:

- `KILL_WEIGHT` — the chosen condition sets the base. Quest-failed is the 1× anchor;
  carts-and-failures 3×, cart 2×, two-in-a-row 0.75×, same-quest-twice 0.5×.
- `LEVER_WEIGHT` — every other lever, written as the multiplier it reads as.
- `STYLE_CAP_WEIGHT` — the styles-per-weapon cap. 3 is the reference and costs nothing;
  1 is ×3 (+2.00) and 6 is ×0.25 (−0.75). It swings hardest of any lever because it
  decides how many hunts the run gets at all.

**Levers combine additively, not multiplicatively.** Each is written as e.g. `0.75`
and contributes its *distance from 1×* — so a 0.75 lever is −0.25 off the total, not
the total × 0.75. The 1× reference run is: app rolls your loadout, both locks on, no
revives; each of those is exactly 1× and costs nothing. The sidebar spells the
arithmetic out (`3 − 0.25 − 0.25 = 2.50`).

**Known rough edge:** the discounts total −1.00, which the two gentle conditions
cannot absorb — `twice` (0.5) with everything unlocked lands at −0.50, and `streak`
(0.75) at −0.25. `MULT_FLOOR` catches these at 0.1 and the sidebar says so, but the
real fix is either raising the lenient base weights or shrinking the deltas. That's a
balance decision, not a code one.

**The kill conditions are a radio group, not checkboxes** — `cfg.kill` is one of
`both | cart | fail | streak | twice`.

Note what `both` exists for: **a quest can fail without carting** (time out, blow the
sub-objective) and you can cart twice and still clear, so cart and quest-failed are
genuinely independent triggers — neither subsumes the other. `both` is their union and
is offered explicitly, which is what lets a radio still work. Everything below
quest-failed *is* subsumed by it, so no other combination is meaningful. Because a
radio always has a selection, there is no "at least one condition" guard to maintain.

The only other radio is `assign`; the rest are plain booleans. `CFG_RADIOS` maps a cfg
key to its value→element-id table; `CFG_BOXES` covers the booleans.

**Both locks default on — locked is the 1× reference, unlocking is the discount.**

- **Loadout lock**: you keep the combo until it dies, through *clears* as well as
  failures. There is no separate `lockCombo` state — it is simply whether `run.combo`
  is carried over at the end of `report()`. A cart can kill the held combo without
  ending the attempt, so `run.combo` may briefly point at a dead combo; the status
  chip and outcome hint detect that (`isAlive`) and say "fallen" rather than "until it
  falls". It self-clears on the next resolution.
- **Quest lock**: a single-retry obligation. `report()` clears `run.lockQuest` at the
  top of any resolution — reaching an outcome discharges the debt — and the fail
  branch immediately re-owes it, so consecutive failures still pin you to the quest.

The multiplier is snapshotted into `run.mult` at Start Run. Since the rules freeze for
the run anyway this is belt-and-braces, but it keeps an imported or restored run scored
the way it was played. Range runs from the ×0.10 floor up to ×3.00.

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

Click a struck-through cell on the board to buy that loadout back. Cost climbs in flat
steps — `REVIVE_BASE + REVIVE_STEP * revivesUsed`, currently 5,000z each — and tuning
the curve means editing those two constants.

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
