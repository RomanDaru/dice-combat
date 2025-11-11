# Defense System V2 Specification

## High-Level Goals
- Introduce a flexible, data-driven defense dice schema for every hero while keeping the path to retire the legacy v1 system once rollout completes.
- Ensure every defense outcome is deterministic (no player choice per rule) and fully logged for telemetry/debugging.
- Keep mitigation concepts separated: defense dice produce block/auxiliary effects, status systems own prevent-half/full, and reflect operates only on resolved damage.

## Versioning & Rollout
- `hero.defenseVersion`: `"v1"` or `"v2"` stored with each hero definition during rollout; defaults to `"v2"` once the hero is validated.
- Global kill-switch `enableDefenseV2` (env/config). When `false`, everyone runs v1 regardless of hero flag. When `true`, heroes obey their `defenseVersion`.
- Dev-only toggle (query param or dev panel) to override per session for A/B testing and QA.
- Reports/snapshots must include:
  - `defenseSchemaVersion`
  - `defenseDslVersion` (semver for matcher/effect DSL)
  - `enableDefenseV2`
  - `hero.defenseVersion`
  - Count of v1 vs. v2 turns for telemetry.
- Schema validation errors fail fast (build-time or load-time) and surface in telemetry/logs; there is no automatic runtime fallback to v1, so the kill-switch is the escape hatch if something catastrophic occurs.

## Defense Dice Schema
- Each hero defines a `defenseSchema` structure that drives their defense roll when `defenseVersion === "v2"`:
  - `dice`: number of defense dice rolled.
  - `fields`: partition of die faces into labeled groups (`{ id: string; faces: number[] }[]`). Validator enforces disjoint faces and ensures every rule-referenced face belongs to exactly one field.
  - `rules`: ordered list of rule definitions evaluated once per roll.
- Rule schema:
  - `id` / `label`: unique identifier for logs/UI.
  - `matcher`: JSON definition resolved via matcher registry (see below).
  - `effects`: array of effect definitions resolved via effect registry.
  - Optional metadata (e.g., `allowReroll`, `target`, `conditions`).
- All configuration is data-driven (JSON/TS config) so adding new matchers/effects is declarative.
- Coverage validator ensures every rule references valid fields/faces; invalid heroes fail validation and are blocked from loading into combat until fixed.
- Optional lint `allowIdleFaces` (default false) warns if a partition contains faces never referenced by any rule (useful for aggressive heroes who intentionally ignore some faces).

### Example
```ts
defenseSchema: {
  dice: 3,
  fields: [
    { id: "F1", faces: [1, 2] },
    { id: "F2", faces: [3, 4] },
    { id: "F3", faces: [5] },
    { id: "F4", faces: [6] },
  ],
  rules: [
    {
      id: "cinder_block",
      matcher: { type: "countField", fieldId: "F1" },
      effects: [{ type: "flatBlock", amount: 3 }],
    },
    {
      id: "smolder_status",
      matcher: {
        type: "pairsField",
        fieldId: "F2",
        pairs: 1,
      },
      effects: [{ type: "gainStatus", status: "prevent_half", stacks: 1 }],
    },
    {
      id: "scorch_ready",
      matcher: { type: "exactFace", face: 6, count: 2 },
      effects: [{ type: "gainStatus", status: "scorch", amount: 1 }],
    },
    {
      id: "ember_reflect",
      matcher: {
        type: "combo",
        fields: [
          { id: "F3", min: 1 },
          { id: "F1", min: 1 },
        ],
        allowExtra: true,
      },
      effects: [{ type: "reflect", amount: 1 }],
    },
  ],
}
```

## Matcher Registry
- Registry-based system; no hardcoded combos.
- All matchers operate on field partitions (with optional direct face inspection).
- Initial matcher kinds:
  - `countField(fieldId, per = 1, cap?)`: counts occurrences in a field, multiplies by `per`, optionally clamps to `cap`.
  - `pairsField(fieldId, pairs = 1, cap?)`: counts pairs inside a single field and requires at least `pairs` matches; `cap` limits how many pairs contribute to `matchCount`.
  - `exactFace(face, count)`: literal face matcher (useful for "two sixes" even if the face shares a field).
  - `combo(fields: { id: string; min: number }[], allowExtra = true)`: requires a recipe across fields for non-pair logic; when `allowExtra` is `false`, extra dice from those fields invalidate the match.
- Matchers emit structured payloads (`matchCount`, `fieldTotals`, `matchedDiceIndexes`, etc.) consumed by effects/logging.
- Validation & linting:
  - Field partitions must be disjoint.
  - Detect rules that would double-count the same dice (e.g., `countField(F1)` plus `combo` referencing `F1` with `allowExtra=false`).
  - Warn about conflicting caps / exclusivity settings to keep authoring predictable.
  - Warn when `exactFace` references a face not included in any field (allowed but highlighted).
  - If validation fails at runtime, halt the defense evaluation, surface the schema error, and prompt QA to flip the kill-switch; no silent fallback.
- Match evaluation never mutates or consumes dice; authors achieve exclusivity purely through partitions and matcher settings.
- Cache `fieldCounts`/derived values per roll so matcher evaluation stays `O(fields + rules)`.
- Determinism: store the dice snapshot (pre/post reroll) and `fieldsHash` in logs so audits can replay the evaluation without RNG.

## Effect Registry
- Strict enum of supported effects; no freeform scripting.
- Each effect declares:
  - `id`: unique name.
  - `target`: `self`, `opponent`, `ally` (ally reserved for future).
  - `owner`: who owns any resulting status/buff (`self` or `opponent`).
  - `apply`: effect-specific payload (block per face, gain status, etc.).
  - Optional conditions (e.g., requires opponent Burn).
- Initial effect types (enumerated, deterministic):
  - `dealPer(matchCount, amount)` with optional `cap`.
  - `flatBlock(amount, cap?)` for absolute mitigation plus `blockPer(matchCount, amount, cap?)` for match-scaled mitigation.
  - `reflect(amount)`.
  - `gainStatus` / `applyStatusToOpponent` (status metadata includes `stackCap`, `usablePhase`, `expires`, `statusKind`). Prevent-half and prevent-all live exclusively inside statuses or the dedicated `preventHalf` effect below.
  - `preventHalf(stacks, usablePhase = "preApplyDamage", expires)` shorthand for awarding prevent-half stacks right before damage locks in.
  - `buffNextAttack`.
  - `heal`, `cleanse`, `transferStatus`.
  - `rerollDice(count, fields?: fieldId[])`.
- Effects can have caps (e.g., block per face limited by dice count or status stacks).
- Conditions allow gating via a small, enumerated set (e.g., `requiresOpponentStatus`, `requiresSelfStatus`); rejected effects log the reason to keep telemetry deterministic.
- Reroll effects must specify dice-selection policy (`highestNonMatching`, `lowest`, `random(seed)`, etc.) so AI behavior stays deterministic.
- Limit reroll cascades via `maxRerollsPerDefense` (configurable) to prevent infinite loops.
- Effects exposing player choice must annotate `selectionPolicy`; AI uses deterministic policy, players act manually, RNG stream remains isolated for rerolls.

## Combat Pipeline (Defense Turn)
1. **Defense Roll**: roll hero-specific number of dice.
2. **Rule Evaluation**:
   - For each rule, evaluate matcher once (rerolls happen only if an effect explicitly requests it).
   - All matched rules trigger; no player choice between multiple outcomes.
   - Apply non-mitigation effects immediately (status gains, buffs, rerolls).
3. **Player Reaction Window**:
   - Players may spend statuses (Chi, Evasive, Prevent Half, Prevent All, etc.) using existing UI.
   - Default rule: newly gained statuses/buffs cannot be spent in the same roll unless the effect explicitly sets a `usablePhase` from the global status timetable (e.g., `preDefenseRoll`, `preApplyDamage`, `nextAttackCommit`).
   - `preApplyDamage` acts as the final interrupt window; if a player wants to spend Evasive or similar statuses after seeing block/prevent numbers, this is the deterministic place to do it.
4. **Mitigation Aggregation**:
   - Combine results following strict order:
     1. Raw attack damage.
     2. Flat reductions (all block output sourced from the defense roll or queued buffs).
     3. Prevent-half stacks (only via statuses; `ceil(remaining / 2)` with `floor>=0`). Full-negate statuses still fire at their declared phases (e.g., `preApplyDamage`).
     4. Reflect damage (based solely on damage the defender actually took after block/prevent, enabling deterministic double-KO scenarios).
     5. Apply net damage (with a `preApplyDamage` hook that allows final status spends such as Evasive).
   - Capture telemetry checkpoints (`rawDamage`, `afterFlat`, `afterPrevent`, `afterReflect`, `finalDamage`) for forensic debugging.
   - Clamp final result to `>= 0` and log when clamping occurs.
5. **Damage Application**:
   - Apply net damage simultaneously to both sides (allow double KO -> draw).
6. **Cleanup**:
   - Expire any effects flagged for end-of-roll/end-of-phase.
   - Maintain logs for every action (rule triggered, effect result, failure reason if conditions unmet).

## Reroll Effects
- Some effects may instruct rerolling dice (e.g., "reroll one die").
- Implementation requirements:
  - Temporarily unlock specified dice (even if previously held).
  - Prompt user (or AI) to select dice if effect allows choice; otherwise auto-select per rule.
  - Animate reroll and re-evaluate the entire rule set after reroll completes (new outcomes can stack with previous ones).
  - Ensure rerolls can cascade (e.g., rule causes reroll -> new outcomes trigger more effects).

## Buff & Status Handling
- Introduce `pendingDefenseBuffs` in game state:
  ```ts
  {
    id: string;
    owner: "you" | "ai";
    kind: string;
    payload: Record<string, unknown>;
    stacks: number;
    cap?: number;
    expires: { type: "nextAttack" | "endOfRound" | "endOfYourNextTurn" | "afterNTurns"; turns?: number };
    createdAt: { round: number; turn: number };
    cleansable: boolean;
  }
  ```
- Buff/status lifecycle:
  - Stored in state, serialized to saves/reports, and rendered in the same UI layer as existing statuses (they simply have a "Defense Roll" source tag).
  - Consumed automatically at trigger (e.g., next attack) or cleaned up on expiry.
  - Logs on creation, consumption, or expiry (even if unused).
  - `carryOverOnKO` controls whether a buff persists if owner/opponent is KO'd during the turn.
- `usablePhase` metadata determines when buffs/statuses can be consumed next (default `nextTurn`). Valid values come from the shared status timing table:
  - `turnStart`, `upkeep`
  - `preOffenseRoll`, `postOffenseRoll`
  - `preDefenseRoll`, `postDefenseRoll`
  - `preDamageCalc`, `preApplyDamage`, `postDamageApply`
  - `turnEnd`, `roundEnd`
  - `nextAttackCommit`, `nextDefenseCommit`
  - `immediate` (consume as soon as it’s granted)
- Prevent-half and prevent-all statuses are stack-based; defense rules can grant them, and players can spend multiple stacks per combat as long as they have them.
- Status application metadata must include source (offensive ability, defensive rule, status effect). Useful for debugging/logs.

## Logging & Telemetry
- Every rule trigger logs:
  - Rule ID/label.
  - Field counts / faces that satisfied the matcher.
  - Effects executed and their outcomes (success/failure + reason).
- Capture `diceSnapshotBefore`, `diceSnapshotAfter` (after rerolls) and `fieldsHash` for deterministic replay.
- Combat log should show defense summary: "Cinder Skin -> Ignite (applied Burn), Prevent Half status primed."
- Stats snapshot additions:
  - `defenseSchemaVersion`.
  - Defense partition / field hash for auditing.
  - `rulesHit[]`: per-rule `matchCount`, effect outcomes, rejection reasons.
  - Breakdowns of `damageBlocked`, `damagePrevented`, `damageReflected` per new pipeline.
  - `blockFromDefenseRoll`, `blockFromStatuses`, `preventHalfEvents`, `preventAllEvents`, `reflectSum`, `wastedBlockSum`.
  - Source metadata for statuses gained (including whether they came from defense roll).
  - Counts of v1/v2 turns for telemetry plus aggregate pipeline checkpoints (`raw -> afterFlat -> afterPrevent -> afterBlock -> afterReflect`) per hero/matchup.
  - `defenseEfficiency = (prevent + block + reflect) / raw` tracked per hero/matchup.
  - `schemaValidationErrors` counter so QA can see if any hero failed to load.

## Integrity & Damage Calculations
- Fix existing stats bug:
  - `damageBlocked` should only capture actual block amounts applied after prevent.
  - `damagePrevented` only records prevent effects from statuses (prevent-half or prevent-all). Never mix block & prevent in the same bucket.
  - Integrity recomputation uses `attackBase - blocked - prevented`.
- Prevent-half is defined as `ceil(remainingDamage / 2)`; if remaining is 1, prevent 1. Prevent-all consumes the status stack and zeroes the remaining damage.
- Defense dice may only emit block, reflect, reroll, status/buff grants, or offensive riders (dealPer). Prevent logic always routes through statuses.

## UI/UX Updates
- Display hero's defense schema in the defense panel (rule list with icons/labels).
- After roll, highlight triggered rules and show short descriptions.
- Provide visual feedback for rerolls initiated by effects.
- Newly granted statuses/buffs appear in the existing status tray with a "Defense" source badge; no new panel required.
- Status spend UI remains unchanged; defense schema just feeds new logs/effects.
- Provide optional dev HUD to toggle v1/v2 for quick QA and display partition/rule diagnostics (field counts, rule hits).

## Implementation Plan
1. **Data Layer**
   - Extend hero definitions with `defenseVersion` + `defenseSchema`.
   - Add global/config toggles and report metadata.
2. **Registries**
   - Implement matcher/effect registries with validation.
   - Write unit tests for each matcher/effect.
3. **Engine Changes**
   - Build defense resolver for v2 pipeline (rule eval -> effects -> mitigation).
   - Add reroll support, non-damage effect handling, status gating.
   - Implement `pendingDefenseBuffs` + expiry logic.
4. **UI Integration**
   - Render defense schema info, highlight matches, animate effects.
   - Support reroll prompts/animations.
   - Ensure status tray can show defense-sourced statuses.
5. **Telemetry & Stats**
   - Update stats tracker fields/logging.
   - Ensure integrity check uses new data correctly.
6. **Migration & QA**
   - Default both Pyromancer/Shadow Monk to v2 (behind kill-switch initially).
   - Provide ability to run same seed under v1/v2 (QA plan) until v1 is retired.
   - Keep kill-switch for rollback only until confidence is high.
7. **Docs & Tests**
   - Document DSL schema and pipeline.
   - Add unit/integration tests for new defense flow, status interactions, and buff lifecycle.
   - Golden tests:
     - Prevent-half rounding (1,2,3,... damage).
     - `pairsField` single-field requirements.
     - `gainStatus` honoring `stackCap`, `usablePhase`, and UI surfacing.
     - Validation failure -> schema error surfaced (report flag + QA alert).
     - Reroll cascade with re-evaluation.
     - Reflect only operating on net damage received.
   - Seed diff QA (same seed v1 vs v2) for Pyromancer/Monk to compare TTK/WR/mitigation.
   - Fuzz tests to ensure validator catches partition overlaps and idle faces when not allowed.
## Defense V2 Tasklist
> Every item below must land on a feature branch (e.g., `feature/defense-v2`) with incremental commits + PRs per the workflow above.

1. [x] **Schema & Validation Foundation**
   - Implement JSON/TS loaders for `defenseSchema`, field disjoint verification, rule references, and `allowIdleFaces` linting.
   - Surface validation errors at build/load time, block invalid heroes, and emit `schemaValidationErrors` telemetry counters.
   - Add unit tests + fuzz coverage for overlapping fields, missing faces, and invalid matcher/effect configs.
2. [x] **Matcher Registry MVP**
   - Build `countField` and single-field `pairsField` resolvers with cached `fieldCounts` payloads.
   - Enforce deterministic outputs (`matchCount`, `matchedDiceIndexes`) and double-count protections.
   - Document matcher DSL and create golden tests for representative dice pools.
3. [ ] **Effect Registry MVP**
   - Implement `flatBlock`, `blockPer`, `dealPer`, `preventHalf`, and `gainStatus` with caps plus `usablePhase` metadata where applicable.
   - Wire `gainStatus`/`preventHalf` into the existing status store (including Prevent Half/All stack handling) and log sources.
   - Stub remaining effect types (reflect, reroll, buffs) with TODO guards so future work plugs in cleanly.
4. [ ] **Defense Resolver & Pipeline**
   - Integrate schema + registries into the combat loop: roll dice, evaluate rules once, dispatch effects.
   - Apply mitigation order `raw -> block -> status prevent -> additional block -> reflect`, clamping at zero.
   - Record pipeline checkpoints (`raw`, `afterFlat`, `afterPrevent`, `afterBlock`, `afterReflect`) and `rulesHit[]`.
5. [ ] **Buff & Status Integration**
   - Finalize `pendingDefenseBuffs` store, expiry engine, and shared status tray rendering with "Defense" origin tags.
   - Support `usablePhase` logic so immediate vs. next-turn statuses behave correctly during reaction windows.
   - Add telemetry for defense-sourced statuses (`blockFromDefenseRoll`, `preventHalfEvents`, etc.).
6. [ ] **Telemetry, Logging & QA Tooling**
   - Emit schema metadata, dice snapshots, field hashes, and `rulesHit` payloads for every defense roll.
   - Build dev HUD toggles/A|B controls plus schema diagnostics for QA.
   - Author golden tests (prevent-half rounding, pairsField combos, schema failure path) and seed-diff automation (v1 vs v2).
7. [ ] **UI/UX Enhancements**
   - Render defense schema definition, matched rule highlights, and reroll animations (post-MVP).
   - Ensure status tray + combat log clearly show defense-sourced statuses/effects.
   - Validate UX on both Pyromancer and Shadow Monk before expanding to more heroes.

## Phase 1 (MVP) Scope
To keep the initial rollout focused, Phase 1 implements the minimal viable subset below while leaving the rest of this document as the full end-state reference.

- **Matchers**: only `countField` and `pairsField` (single field). No combos or rerolls yet.
- **Effects**:
  - `dealPer` with optional `cap`.
  - `flatBlock`/`blockPer` driven solely by defense roll output.
  - `gainStatus` (issuing Prevent Half / Prevent All / other defense statuses) with `stackCap` and default `usablePhase = "nextTurn"`.
  - `preventHalf` shorthand for granting prevent-half stacks (default `usablePhase = "nextTurn"`).
  - _Everything else (reflect, reroll policies, buffs applied to attacks, transfer, etc.) deferred to post-MVP._
- **Pipeline**: `rawDamage -> flatBlock -> percentPrevent (status) -> floor>=0`. Reflect and post-prevent block sources land post-MVP.
- **Fields & Validation**: disjoint partition required; failure raises a schema error and blocks the hero (no automatic v1 fallback).
- **Telemetry**:
  - Record `raw`, `afterFlat`, `afterPrevent`, `finalDamage`.
  - Capture `rulesHit[]` (rule id + matchCount + effect outcome).
  - Boolean `schemaValidationFailed` for QA visibility.
- **UI**: show defense schema definition and highlight triggered rules; no reroll UI or extra prompts.
- **Kill-switch & Hero flag**: fully wired from day one so we can toggle between v1/v2, but goal is to ship v2 as the default once MVP passes QA.
- **Tests**:
  - Prevent-half rounding (odd/even incoming damage) via statuses granted during defense.
  - `pairsField` counting accuracy for single-field requirements.
  - `gainStatus` honoring `stackCap` and `usablePhase`.
  - Validation failure -> schema error path (report flag + v1 disabled).

Everything beyond this list (reflect, reroll policies, buffs, advanced telemetry, etc.) lands post-MVP but remains documented above for continuity.

## Git/GitHub Process (strict)
To keep the rollout disciplined, every contributor (human or AI) must follow this workflow:

1. **Feature Branch**: All defense-v2 work lives on a dedicated branch (e.g., `feature/defense-v2`). No direct pushes to `main`.
2. **Incremental Commits**: Commit logical chunks (matcher registry, effect registry, pipeline core, telemetry, UI, tests) separately with clear messages.
3. **Pull Request**: Once Phase 1 scope is implemented, open a PR into `main` summarizing:
   - What is included (matchers/effects/pipeline/telemetry per MVP list).
   - Kill-switch + disable behavior verified.
   - Tests executed (list golden/fuzz cases).
   - Pending post-MVP items.
4. **Review & QA**: PR must pass review/CI before merge. Keep kill-switch enabled until QA sign-off.
5. **Release Tagging**: After merge/QA, tag main (e.g., `v0.9.0-defense-v2-mvp`). Future increments (post-MVP features) increment semver + update docs.

AI agents must adhere to this process—no shortcuts, no merging without review/tagging. Document deviations in PR description if emergency fixes are required.

## Exclamation Reminders
- Defense dice output block, reflect, reroll, and status/buff hooks only; prevent-half/full always flows through statuses.
- Status spends (Evasive, Chi, Prevent Half, Prevent All, etc.) remain separate; defense schema must not alter their fundamentals beyond granting stacks.
- Log everything: rule triggers, effect outcomes, rerolls, buff lifecycle, status sources.
- Reroll effects must truly reroll dice (unlock + re-evaluate) before continuing.
- Buff metadata (owner, expiry, stacks) must be persisted to avoid future drift.
- Design rules so matchers don't overlap on the same dice pattern unless intentionally stacked.
- Default: newly granted statuses/buffs are not usable this roll unless explicitly allowed.
- Validation failures must halt v2 defense for that hero and be clearly logged/reported.
- Reroll selection policies must be deterministic (AI-safe).
- Cap `dealPer` / `blockPer` effects even if current design doesn't need it—prevents runaway scaling when fields change.
- Maintain both compact (report) and verbose (debug) log formats; report stays small, dev logs show dice indexes.

