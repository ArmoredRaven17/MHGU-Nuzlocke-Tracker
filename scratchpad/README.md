# Balance scripts

The simulations behind the weights in `docs/app.js`. Plain Node, no dependencies —
they read `docs/data.js` directly for the quest rewards.

```bash
node scratchpad/sim-degeneracy.js
```

| Script | What it answers |
|---|---|
| `sim-multiplicative.js` | Solves `factor` by fixed point from a target `effect`. Re-run after retuning any `effect`. |
| `sim-degeneracy.js` | Do any two options produce the *same run*? Compares death distributions rather than score. |
| `sim-questlock-sensitivity.js` | What is the quest lock worth if a retry has its own win rate? Sweeps it 0.50–0.90. |
| `sim-twice-lock.js` | The measurement that retired `same quest failed twice`. |

**Run `sim-degeneracy.js` before trusting a new weight.** Every earlier script compared
final score, which the multiplier dominates — so an option whose rule did nothing still
looked distinct from its neighbour, and the inversion audit then checked that against the
same assumption baked into the weights. Self-consistent, and wrong. With revives off the
multiplier has no effect on play, so the death distribution is a pure function of the
rules: two options producing the same distribution are the same rule, whatever we pay.

These are analysis tools, not tests — they print tables for a human to read. The `ENV`
constants (`p`, `cartOnClear`, `cartOnFail`) are estimates of player behaviour that
nobody has measured, so treat every absolute number as indicative and every *ratio*
between two configurations as the real output.
