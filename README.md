# MHGU Zenny Gauntlet

A scored challenge run for Monster Hunter Generations Ultimate.

**Live:** https://ArmoredRaven17.github.io/MHGU-Zenny-Gauntlet/

## What it is

A gauntlet of **50 quests** with permadeath on **weapon + style combos**. Lose a hunt
and the loadout you took is gone for the rest of the run, and your score is the zenny
you walked away with.

There are **92** of them: 14 weapons across 6 styles, plus a Prowler with 8 biases.
The unit of loss is the combo rather than crafted gear, so permadeath costs you
nothing to set up — you already own every combo — while still forcing you onto
weapons you'd never otherwise touch.

## What it isn't

**It doesn't roll quests and has no filters.** Hunt whatever you like; this tracks
what happened and takes options away. For quest rolling, use the
[MHGU Quest Randomizer](https://ArmoredRaven17.github.io/MHGU-Quest-Randomizer/).

## Each hunt

1. **Get a loadout** — the app hands you a surviving combo, or you pick one yourself.
   Fallen combos are never offered.
2. **Name the quest** you're hunting, from a searchable list of 1,239 (Arena excluded).
3. **Report the result** — Cleared, Carted, or Failed. Carted can be pressed more than
   once; it doesn't end the attempt.

Your kill conditions are checked against that result. When one fires, the loadout is
struck off the board for good.

A run is **50 successful hunts**, or however far you get before nothing is left
standing. Only clears count towards the 50 — a failure costs you a combo, it doesn't
spend your run. Whatever you're still holding at the end pays a bonus on top of
everything you earned, so finishing untouched is worth double.

## Rules

Everything is a lever — set the run as gentle or as brutal as you like.

**Kill condition** — pick one. The harshest option covers both carts and failures
explicitly, and everything below quest-failed is already covered by it, so there's
nothing to gain from stacking them.

| Condition | | |
|---|---|---|
| Carts and quest failures | Either one takes the loadout | the baseline |
| Cart | Carts only — you can lose a quest and keep the combo | −M |
| Quest failed | Failures only — you can cart your way to a clear for free | −L |
| Two quest failures in a row | The first is forgiven; a clear resets the streak | −XL |
| Same quest failed twice | Cumulative, not necessarily consecutive | −XL |

**Styles per weapon** — how many styles a weapon may lose before the whole weapon
retires and its surviving styles leave the pool. This is the only lever that *scales*
your whole total rather than nudging it, because it decides how much of the board you
ever get to spend.

| Styles | Loadouts in the run | |
|---|---|---|
| 1 | 15 | +XL |
| 2 | 30 | +L |
| 3 *(default)* | 45 | the baseline |
| 4 | 60 | −M |
| 5 | 75 | −M |
| 6 | 90 | −L |

**Other levers:**

- **Loadout** — the app rolls one, or you pick from what's left
- **How long you hold it** — *until it falls* (the baseline), *until you clear* (a
  failure keeps it, so you can retry the quest that beat you with the same combo —
  harder than the baseline, and the only lever that scores **above** it), or *swap
  whenever you like*
- **Quest lock** — a quest that beat you is owed one retry; your next hunt has to be
  that quest, win or lose
- **Revive** — buy a fallen loadout back, once each or repeatedly
- **Reroll** — refuse a combo you were handed and draw another; the refused one goes
  back in the pool

**Arena quests aren't part of a run.** They hand you a fixed set of five weapons, so
there's no combo of yours to put at stake. They aren't listed.

**Clearing a quest spends it.** Fifty clears means fifty different quests, so a run is a
route rather than the same quest fifty times. Only clearing spends one — fail and it
stays on the board, which is what lets the quest lock send you back to it.

## Scoring

Clearing a quest earns its **real in-game zenny reward**, pulled from the game's own
quest data — 300z for `Find the Ferns`, 78,600z for `Path of the Hunter`. Points only
go up; a failure already costs you a loadout.

That total is then scaled by how hard you set the run. **Every lever is a ratio and
they multiply**, and the reference run — carts and quest failures, 3 styles, hold until
it falls, quest lock on, no revives or rerolls — is exactly 1.00, so it pays each
quest's real zenny untouched.

**You never see the number.** Each option carries a shirt size instead — the same
vocabulary as Attack Up (S/M/L) — and the run as a whole gets a rating:

| Rating | | |
|---|---|---|
| Very Hard | 1 or 2 styles per weapon | |
| Hard | **the defaults** | |
| Normal | | |
| Easy | | |
| Very Easy | | |

That's deliberate rather than coy. A displayed multiplier has to be arithmetic you can
add up, which forces it to report each lever's *nominal weight* — and the nominal
weight is not what the lever does to your score, because a harder setting also makes
the run shorter and so banks fewer clears. One style per weapon multiplies earnings by
4.48 and finishes at 1.60× the reference; showing either number alone would be a lie.
A letter is free to report the measured effect, so it does.

**Finishing with combos in hand pays again.** Whatever share of your allowance you
still hold at the end is paid as a bonus on your earnings — keep 5 of 15 and it scores
like keeping 15 of 45. Keep everything and your score doubles.

### Buying a loadout back

With revives on, click a struck-through cell on the board. **The cost doubles every
time and scales with your difficulty**, so at the 10,000z setting on a ×2 run the
buy-backs run 20,000z, 40,000z, 80,000z. It comes straight out of your earned zenny.

Both halves matter. Flat pricing never stops anyone — at one style per weapon a player
could buy twenty extra combos for pocket change and double their run — and a flat price
gets relatively cheaper exactly where earnings are highest. Doubling makes you stop of
your own accord; scaling keeps a buy-back the same share of a hunt at any difficulty.

## Development

Static site, no build step. Serve `docs/` and open it:

```bash
python -m http.server 5580 --directory docs
```

GitHub Pages serves from `docs/`. Bump the `?v=N` on the `styles.css` / `app.js` /
`data.js` tags in `index.html` on every push that touches them — the Pages CDN caches
by full URL, so without it nobody sees the update.

`docs/data.js` and `docs/materials.js` are **generated** — don't hand-edit them:

```bash
node scripts/build-data.js       # quests + their real zenny rewards
node scripts/build-materials.js  # sellable materials + their sell values
```

Both read extracted MHGU game files for values that exist in no other dataset. Pass the
`nativeNX` path as an argument if yours differs from the default in each script.

## Credits

Quest data, icons and the theme system come from the MHGU Quest Randomizer.
Monster Hunter is © Capcom.
