# MHGU Nuzlocke Tracker

A Nuzlocke run tracker for Monster Hunter Generations Ultimate.

**Live:** https://ArmoredRaven17.github.io/MHGU-Nuzlocke-Tracker/

## What it is

A Nuzlocke borrows the Pokémon ruleset — permadeath — and applies it to **weapon +
style combos**. Lose a hunt and the loadout you took is gone for the rest of the run.

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
2. **Name the quest** you're hunting, from a searchable list of all 1297.
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

| Condition | | Difficulty |
|---|---|---|
| Carts and quest failures | Either one takes the loadout | ×3 |
| Cart | Carts only — you can lose a quest and keep the combo | ×2 |
| Quest failed | Failures only — you can cart your way to a clear for free | ×1 |
| Two quest failures in a row | The first is forgiven; a clear resets the streak | ×0.75 |
| Same quest failed twice | Cumulative, not necessarily consecutive | ×0.5 |

**Styles per weapon** — how many styles a weapon may lose before the whole weapon
retires and its surviving styles leave the pool. This is the only lever that *scales*
your whole total rather than nudging it, because it decides how much of the board you
ever get to spend.

| Styles | Loadouts in the run | Difficulty |
|---|---|---|
| 1 | 15 | ×3.5 |
| 2 | 30 | ×1.75 |
| 3 *(default)* | 45 | ×1 |
| 4 | 60 | ×0.75 |
| 5 | 75 | ×0.6 |
| 6 | 90 | ×0.5 |

**Other levers:**

- **Loadout** — the app rolls one, or you pick from what's left
- **Loadout lock** — you can't swap weapon or style at all until that combo falls
- **Quest lock** — a quest that beat you is owed one retry; your next hunt has to be
  that quest, win or lose
- **Revive** — buy a fallen loadout back, once each or repeatedly
- **Reroll** — refuse a combo you were handed and draw another; the refused one goes
  back in the pool

### Buying a loadout back

With revives on, click a struck-through cell on the board. The cost climbs by the
price you set every time — at the 10,000z default the first buy-back is 10,000z, the
second 20,000z — and it comes straight out of your earned zenny, so rescuing a run
costs you score. A per-run cap bounds how far that can go.

Both locks are on by default: locked is the baseline the difficulty scale is measured
against, and turning one off is a discount.

**Arena quests don't count.** Their weapons are handed to you, so nothing is at stake.

## Scoring

Clearing a quest earns its **real in-game zenny reward**, pulled from the game's own
quest data — 300z for `Find the Ferns`, 78,600z for `Path of the Hunter`. Points only
go up; a failure already costs you a loadout.

That's then scaled by how hard you set the run. Your kill condition sets the base (see
the table above), every other lever adds to or subtracts from it, and the styles cap
scales the lot:

| Lever | |
|---|---|
| You pick your own loadout | −0.25 |
| Loadout lock off | −0.25 |
| Quest lock off | −0.25 |
| Revives allowed | −0.25 |
| …but only once per combo | +0.10 back |
| Rerolls allowed | −0.20 |

So the harshest run with everything at baseline is ×3.00; unlocking both locks brings
it to ×2.50, and dropping to one style per weapon takes ×3.00 up to ×10.50. The total
is shown while you set up and locks in when you press Start Run. It can go negative —
stack enough discounts on a gentle kill condition and the run scores as a penalty.

**Finishing with combos in hand pays again.** Whatever share of your allowance you
still hold at the end is paid as a bonus on your earnings — keep 5 of 15 and it scores
like keeping 15 of 45. It's a bonus only, never applied to a negative total.

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
