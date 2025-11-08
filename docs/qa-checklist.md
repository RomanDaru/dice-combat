# QA Checklist

Before merging any gameplay branch run through the following list. The goal is to cover the high‑risk flows (initiative, Chi spends, Evasive reactions) and confirm the automated test suite is green.

## Manual Scenarios

1. **Initiative – AI Starts**
   - Start a new battle and re-roll until the AI wins the standoff.
   - Observe the cue overlay: the AI should show a turn cue, the attack telegraph should fire, and the AI dice preview must animate automatically.
   - Confirm the player is placed in defense phase immediately (no manual interaction needed).

2. **Chi Spend / Bonus Damage**
   - Play as Shadow Monk against any opponent.
   - Build at least 1 Chi via offensive combos, then trigger an attack that spends Chi automatically.
   - Verify the attack telegraph displays the boosted damage and the defense summary cue includes the bonus stacks in the “Blocked/Damage” breakdown.

3. **Evasive Defense / Purifying Flame Transfer**
   - Allow the AI to apply Burn (e.g., fight Pyromancer) and gain a Purifying Flame stack via Ember Shield.
   - Trigger the Purifying Flame transfer prompt during upkeep:
     - Successful transfer → cue displays “Transfer success” and Burn reappears on the AI.
     - Failed transfer → cue shows failure, Burn remains on the player, and Purifying Flame is consumed.
   - For completeness, also spend an Evasive token and confirm the defense summary cue reports “Damage 0 • Blocked X”.

Record any anomalies in the combat log (screenshots if needed) before proceeding.

## Automated

Run the full Vitest suite:

```bash
npm run qa
```

This command executes the same tests invoked in CI (currently `vitest`). Do not merge if any test fails.
