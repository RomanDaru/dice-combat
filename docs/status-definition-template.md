# Status Definition Template

Use this template whenever you introduce a new status. It captures every field the runtime needs and shows how to wire behaviors/configs so hooks stay generic.

```ts
import { defineStatus } from "../engine/status";

defineStatus({
  id: "new_status_id",          // Unique ID used in tokens/requests
  name: "Display Name",         // UI/log friendly label
  icon: "🌟",                  // 1–2 char string (ASCII preferred)

  // Core metadata
  polarity: "positive",         // "positive" | "negative"
  activation: "active",         // "active" | "passive"
  windows: ["attack:roll"],     // Micro-hook windows from docs/holy-grail-combat-flow.md

  // Behavior wiring
  behaviorId: "bonus_pool",     // "bonus_pool" | "pre_defense_reaction" | "damage_over_time" | "custom_script"
  behaviorConfig: {
    attack: { bonusDamagePerStack: 2 },
    defense: { bonusBlockPerStack: 1 },
  },

  // Ownership rules
  attachment: {
    transferable: false,        // true if the status can hop to another hero
  },

  // Stack limits / ordering
  maxStacks: 6,
  priority: 50,                 // Only relevant for passive modifiers

  // Active spend definition (omit for pure passives)
  spend: {
    costStacks: 1,
    allowedPhases: ["attackRoll", "defenseRoll"],
    turnLimited: true,          // true => participates in per-turn budget tracking
    needsRoll: false,
    // apply: optional; leave undefined when behavior handles it
  },

  // Optional passive hooks
  onTick: undefined,
  cleanse: undefined,
  onModify: undefined,
});
```

## Behavior Reference

| Behavior ID              | Typical Usage                          | Key `behaviorConfig` fields                           |
|--------------------------|----------------------------------------|-------------------------------------------------------|
| `bonus_pool`             | Chi/Rage style damage/block boosts     | `attack.bonusDamagePerStack`, `defense.bonusBlockPerStack` |
| `pre_defense_reaction`   | Evasive / reaction dice                 | `successThreshold`, `dieSize`, `negateOnSuccess`, `successBlock`, `failBlock` |
| `damage_over_time`       | Burn/poison ticks                      | `tiers` (damage per stack), `decayPerTick`, `promptOnDamage` |
| `custom_script`          | Anything bespoke                       | Provide handler module under `engine/status/behaviors` |

## Implementation Steps

1. **Add the definition** (using the template) under `src/engine/status/defs.ts` or a dedicated module.
2. **Configure active abilities** (if a hero needs a button/trigger) via `src/game/activeAbilities/...`.
3. **Hook budgets**: set `turnLimited: true` on spends that should respect per-turn budgets — GameController already tracks them.
4. **Tests**: add coverage in `src/hooks/__tests__/statusSpends.test.ts` or a behavior-specific spec to lock in config/handler wiring.
