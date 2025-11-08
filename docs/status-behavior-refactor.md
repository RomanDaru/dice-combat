# Status Behavior Refactor Tasklist

## Problem Statement

- Engine logic references specific status IDs like `chi` and `evasive` throughout hooks (`useAttackExecution`, `useAiDefenseResponse`, `usePlayerDefenseController`, `useAiController`, `GameController`, etc.).
- Adding a new hero with a spendable positive status or a pre-defense reaction requires hard-coded conditionals scattered across the UI/engine.
- Status rules are tied to names rather than capabilities (positive/negative, active/passive, timing windows), making it impossible to introduce alternate resources (e.g., "Rage", "Smoke Bombs") without touching multiple files.

## Goals

1. Describe every status via metadata (polarity, activation type, timing windows, behavior ID, attachment rules) so runtime logic can be fully generic.
2. Route all status spends through a registry of behavior handlers (e.g., `bonus_damage`, `bonus_block`, `negate_incoming`, `custom_script`).
3. Remove all explicit `if (statusId === "chi" | "evasive")` checks from hooks and controllers.
4. Keep GameController/UI agnostic to actual status names, only displaying presentation data supplied by the status definition.
5. Allow future statuses to bend or extend combat rules (extra rerolls, custom resolution steps, ownership swaps) purely through metadata + behavior handlers.

## Current Usage Inventory (non-exhaustive)

- **Chi**: gated by turn budgets (`turnChiAvailable`), spent by player/AI attack & defense flows, tracked in GameController, displayed in PlayerActionPanel.
- **Evasive**: both AI and player flows run a die animation, spend the status, potentially negate incoming damage, append spend summaries.
- **Aura/other statuses** (from `engine/status/defs.ts`): currently passive but still referenced by ID.

## Status Inventory Audit

| Status  | Polarity | Activation | Windows (micro-hooks)                        | Behavior sketch        | Notes                                                                 |
|---------|----------|------------|----------------------------------------------|------------------------|-----------------------------------------------------------------------|
| Chi     | positive | active     | `attack:roll`, `defense:afterRoll`           | `bonus_pool`           | Same stack funds both attack dmg and defense block; 1 stack = +1.     |
| Evasive | positive | active     | `preDefense:start`                           | `pre_defense_reaction` | Consumes 1 stack, rolls d6, negate on 5+. Needs dice animation prompt.|
| Burn    | negative | passive    | `upkeep:tick`                                | `damage_over_time`     | Applies tiered DoT, decays by 1 per tick, offers cleanse interaction. |

**Gaps / follow-ups**

- Chi mixes attack + defense spends; handler config must describe both windows even though we keep only one `behaviorId`.
- Pre-defense reactions (Evasive today) need the `preDefense:start` window encoded in the schema so other statuses can slot in beside it.
- Burn is only wired to `upkeep:tick` but future DoTs may also hook into `damage:postApply`, so schema should allow multiple windows even for passive statuses.

## Schema Draft

- `polarity`: `positive | negative`.
- `activation`: `active | passive`.
- `windows`: array of the micro-hook ids defined in `docs/holy-grail-combat-flow.md` (`upkeep:tick`, `attack:declare`, `preDefense:start`, `defense:afterRoll`, etc.).
- `behaviorId`: string enum pointing at handler module (initial set: `bonus_pool`, `pre_defense_reaction`, `damage_over_time`, `custom_script`).
- `behaviorConfig`: arbitrary JSON-ish blob consumed by that handler (e.g. Chi describes attack/defense payouts, Evasive stores DC).
- `attachment`: { transferable?: boolean } so we can tell whether the status may hop targets (token-level metadata like `originalOwnerId` will live on instances).

## Behavior Contract Draft

- `bonus_pool`: active spend behavior used by Chi-like resources. Config:
  - `attack.bonusDamagePerStack` (number) - optional per-stack damage boost when window includes attack roll.
  - `defense.bonusBlockPerStack` (number) - optional per-stack block boost.
  - `maxStacksPerWindow?` to cap spending per window (defaults infinite).
- `pre_defense_reaction`: active pre-defense reaction. Config:
  - `dieSize` (default 6) + `successThreshold`.
  - `negateOnSuccess` (bool), optional `bonusBlockOnFail`, `animationKey`.
  - Behavior decides whether to request a roll before continuing to defense phase.
- `damage_over_time`: passive tick handler. Config:
  - `tiers`: array describing damage per stack tier (index-based).
  - `decayPerTick`: stacks removed after each tick.
  - Optional `promptIfDamage` bool + `cleanseWindow` overrides.
- `custom_script`: escape hatch where definition supplies direct callbacks (used only for legacy tests until replaced).

## Proposed Architecture

1. **Status Definition Schema Update**
   - Add fields: `polarity` (`positive`, `negative`), `activation` (`active`, `passive`), `windows` (array of micro-hooks per holy grail doc), `behaviorId`, optional `behaviorConfig`, plus attachment metadata (`transferable?: boolean`) so we can tag whether the status is allowed to switch owners (original owner tracking stays on the token instance).
   - Ensure behaviors can override baseline rules (e.g., extra rerolls, custom damage formulas) via `behaviorConfig` so new statuses can bend core rules without touching engine code.

2. **Behavior Registry**
   - Map `behaviorId` to handler modules under `engine/status/behaviors/<id>.ts`.
   - Behaviors fall into categories that mirror our combat phases:
     - **Attack Modifiers** – numerical adjustments while attacking (e.g., `attack_bonus_pool`, `attack_onhit_status`, `attack_custom_script`).
     - **Defense Modifiers** – numerical adjustments while defending (e.g., `defense_bonus_block`, `defense_retaliate_boost`, `defense_custom_script`).
     - **Pre-Defense Reactions** – reactions that fire before the defense roll (e.g., `pre_defense_reaction` with sub-configs for negate, dice manipulation, force reroll).
     - **Passive Hooks** – triggered windows like `post_damage_apply`, `turn_upkeep`, etc.
   - Each handler receives `{context, spendRequest}` and returns normalized results (bonus damage/block, negate flags, dice instructions, extra events).
   - Existing chi/evasive logic becomes behaviors `attack_bonus_pool`, `defense_bonus_block`, `pre_defense_reaction` with configs describing their special steps.

3. **Runtime Adapter**
   - Update `spendStatus` and `aggregateStatusSpendSummaries` to use definitions + behavior registry, no hard-coded ID branches.
   - Extend `StatusSpendSummary` to store `behaviorId` + normalized output fields so hooks never inspect ID.

4. **Hook Integration**
   - Replace all `turnChiAvailable`-specific plumbing with a generic `turnResourceBudgets[statusId]`.
   - `useAttackExecution`/`usePlayerDefenseController`/`useAiDefenseResponse` request spends via the unified API, passing the proper timing window and leaving decisions (like dice count) to the status definition.
   - Expose presentation (icon/text) by reading status metadata rather than ID-specific strings.

## Work Plan

1. **Audit & Schema Update**
   - [x] Enumerate all statuses in `engine/status/defs.ts`, classify polarity/activation/windows, document gaps (new windows may be needed) in this file.
   - [x] Extend the `StatusDefinition` type with the new metadata and adjust every status entry.

2. **Behavior Registry Implementation**
   - [x] Create `engine/status/behaviors/index.ts` exporting handlers.
   - [x] Port chi/evasive logic into reusable behavior modules; ensure behavior output covers current needs (bonus dmg/block, negate, custom roll counts).

3. **Runtime Refactor**
   - [x] Update `spendStatus`/`createStatusSpendSummary`/`aggregateStatusSpendSummaries` to rely on behaviors rather than ID checks.
   - [x] Introduce a generic `turnStatusBudgets` structure (replacing `turnChiAvailable`) plus helper utilities to debit/credit budgets based on status metadata.

4. **Hook & Controller Cleanup**
   - [ ] `useAttackExecution`, `useAiDefenseResponse`, `usePlayerDefenseController`, `useAiController`, `GameController`, `PlayerActionPanel` consume the new budget helpers and behavior outputs; remove every explicit reference to `chi`/`evasive`.
   - [ ] Ensure logging/UI text pulls friendly names from status definitions.

5. **Validation**
   - [ ] Update/extend unit tests in `engine/status/__tests__` plus add integration coverage for the new behaviors.
   - [ ] Manual sanity run: verify both heroes can attack/defend/evasive under the new system.

## Deliverables

- Updated status schema and registry documentation.
- Refactored runtime + hooks with zero hard-coded status IDs.
- Tests demonstrating that different behaviors (e.g., “Chi-like” and “Evasive-like”) can be swapped in/out without code changes.
