# Status Harness (Variant C)

⚠️ **Scope**: Defense v2 only. The harness works exclusively with the schema pipeline (`buildPendingDefenseBuffsFromGrants`, `buildDefensePlan`, `resolveAttack`) and should not be wired into the legacy defense board.

## Goal
Automate regression coverage for status lifecycles without hardcoding specific status IDs. The harness stitches together the existing engine modules so every status follows the same cycle: grant → pending buff → trigger → spend/consume → telemetry.

## Entry Point
`src/sim/statusHarness.ts`

```ts
import { runStatusHarnessScenario } from "../sim/statusHarness";

const result = runStatusHarnessScenario({
  id: "bonus_pool:example",
  attackDamage: 12,
  defenseBaseBlock: 2,
  defenderTokens: { [statusId]: 3 },
  defenseSpendRequests: { [statusId]: 3 },
  pendingGrants: [
    {
      grant: {
        status: statusId,
        target: "self",
        stacks: 1,
        usablePhase: "nextDefenseCommit",
        source: { ruleId: "schema_rule", effectId: "effect_1" },
      },
      triggerPhase: "nextDefenseCommit",
    },
  ],
  defenseReactions: [{ statusId, roll: 6 }],
});
```

### Options
- `attackDamage`: incoming base damage for the simulated attack.
- `defenderTokens`: optional token snapshot before the defense.
- `defenseSpendRequests`: mirrors `GameController` requests; values represent stacks requested for a given status.
- `pendingGrants`: (optional) converts schema-style grants into pending buffs, then replays triggers (`preDefenseRoll`, `nextDefenseCommit`, etc.) before the defense.
- `defenseReactions`: runs manual `spendStatus` reactions (used for `pre_defense_reaction` behaviors such as Evasive or Prevent Half).
- `attackStatusSpends` / request maps: useful when reproducing combined attack + defense interactions.

### Result
`StatusHarnessResult` returns:
- `resolution`: full `AttackResolution` from `resolveAttack`.
- `defensePlan`: output from `buildDefensePlan`.
- `lifecycleEvents`: every `StatusLifecycleEvent` emitted while the scenario ran (grant/spend/consume).
- `virtualTokens`: derived `Token` views per side, matching the GameController virtual-token logic.
- `pendingDefenseBuffs` + `expiredDefenseBuffs`: leftover buffs after processing the configured triggers.
- `reactionSummaries`: any pre-resolved reaction spends added ahead of `buildDefensePlan`.

Use these artefacts inside Vitest assertions (see `src/engine/status/__tests__/statusHarness.test.ts`) instead of reimplementing bespoke plumbing per status.

## Running the regression suite
```
pnpm vitest run src/engine/status/__tests__/statusHarness.test.ts
```

The suite generates scenarios by iterating over the registered status definitions (`listStatuses()`) and grouping them by behavior. When new statuses are added:
1. Implement (or extend) a scenario builder that derives expectations from the definition metadata (behavior config, spend contract, usable phases).
2. Add the scenario to the shared Vitest suite so CI covers it automatically.
3. Update this document (and `docs/status-core-plan.md`) with any new lifecycle considerations.

## Best Practices
- Keep the harness generic—derive behavior from `StatusDef` metadata, never from ad-hoc status ID switches.
- Prefer deterministic inputs (fixed dice, fixed rolls) to keep the Vitest suite stable.
- Each new status that participates in defense-v2 must ship with at least one harness scenario (grant before spend + direct spend without grant when applicable).
- Document any new helper flows inside `docs/sim/status-harness.md` so future contributors can expand Variant C without reverse engineering the code.
