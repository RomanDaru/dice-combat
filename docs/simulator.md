# Simulator CLI

Run automated Pyromancer vs Shadow Monk matchups without the UI. The simulator uses the existing hero boards, dice logic, and status behaviors (burn, chi, evasive, purify) to approximate combat outcomes.

## Quick start

```bash
npm run sim -- --games 2000 --seed 1337 --sample
```

### Options

| Flag | Description | Default |
| --- | --- | --- |
| `--games <n>` | Number of simulations to run. | `1000` |
| `--seed <n>` | Base RNG seed (each game offsets by +i). | Current timestamp |
| `--you <heroId>` | Hero ID for the player side. | `Pyromancer` |
| `--ai <heroId>` | Hero ID for the opponent. | `Shadow Monk` |
| `--first <side>` | Force first player (`you`, `ai`, or `random`). | `random` |
| `--sample` | Print the first game's winner and last turn summary. | Off |
| `--json <path>` | Emit the full results as JSON (`-` to print to stdout). | _(none)_ |
| `--help` | Show usage info. | - |

Example output:

```
Simulations: 2000
You wins: 1247
AI wins: 721
Draws: 32
Win rate (you): 62.35%
Avg rounds: 6.41
Win rate 95% CI: [60.1%, 64.6%]
Initiative metrics, DPR, mitigation, statuses, convergence curve, and elasticity table follow...
```

### Reported metrics

- Initiative winrate with 95% Wilson CI per starting hero.
- Initiative split stats (DPR, mitigation, status impact) for first vs second player.
- TTK (average, median, IQR) plus a round histogram.
- DPR (attack-only vs actual) for both sides.
- Damage swing stats and lethal-from-HP probabilities.
- Mitigation breakdown (blocked/prevented) and defense success vs the most common attacks.
- Status analytics: frequency, damage/mitigation contribution, and average lifetime.
- Ability tiering: pick/opportunity rate, EV (actual − expected), win-rate uplift, and trap/overtuned callouts.
- Winrate convergence curve to judge stability.
- Elasticity sweep showing Δ winrate / Δ lethal≥5HP for ±1 damage/block tweaks.

> ⚠️ The headless simulator mirrors the high-level rules (dice combos, burn ticks, chi/evasive spending), but it is not a perfect reproduction of every UI timing nuance. Use it to compare strategies and gather matchup trends, not as an authoritative replay of the main game.
