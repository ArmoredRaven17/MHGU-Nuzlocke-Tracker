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
struck off the board for good. The run ends when nothing is left standing.

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
retires and its surviving styles leave the pool. This is what sets run length, and it
pays the most of any lever: fewer styles means fewer hunts and fewer chances.

| Styles | Loadouts in the run | Difficulty |
|---|---|---|
| 1 | 15 | ×3 |
| 2 | 30 | ×2 |
| 3 *(default)* | 45 | ×1 |
| 4 | 60 | −0.25 |
| 5 | 75 | −0.50 |
| 6 | 90 | −0.75 |

**Other levers:**

- **Loadout** — the app rolls one, or you pick from what's left
- **Loadout lock** — you can't swap weapon or style at all until that combo falls
- **Quest lock** — a quest that beat you is owed one retry; your next hunt has to be
  that quest, win or lose
- **Revive** — buy a fallen loadout back, once each or repeatedly. Leave it off for a
  run with no safety net

### Buying a loadout back

With revives on, click a struck-through cell on the board. You get three ways to pay,
each a bundle of one to three real materials priced at their actual in-game sell
value, and taking one puts that loadout back on the board.

The cost climbs 5,000z every time — the first buy-back is 5,000z, the second 10,000z,
and so on — so a run can only be rescued so often. Nothing is verified: sell the
materials in game and take the option you paid, same honour system as the hunt
results.

Both locks are on by default: locked is the baseline the difficulty scale is measured
against, and turning one off is a discount.

**Arena quests don't count.** Their weapons are handed to you, so nothing is at stake.

## Scoring

Clearing a quest earns its **real in-game zenny reward**, pulled from the game's own
quest data — 300z for `Find the Ferns`, 78,600z for `Path of the Hunter`. Points only
go up; a failure already costs you a loadout.

That's then scaled by how hard you set the run. Your kill condition sets the base (see
the table above) and every other lever adds to or subtracts from it:

| Lever | |
|---|---|
| You pick your own loadout | −0.25 |
| Loadout lock off | −0.25 |
| Quest lock off | −0.25 |
| Revives allowed | −0.25 |
| …but only once per combo | +0.10 back |

So the harshest run with everything at baseline is ×3.00, and unlocking both locks
brings it to ×2.50. The multiplier is shown while you set up — with the arithmetic
spelled out — and locks in when you press Start Run.

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
