# Defense System V2 Specification

## High-Level Goals
- Introduce a flexible, data-driven defense card system for every hero while keeping the legacy v1 system available for fallback/testing.
- Ensure every defense outcome is deterministic (no player choice per rule) and fully logged for telemetry/debugging.
- Separate mitigation concepts (block vs. prevent half vs. negate) and maintain clean damage pipelines.

## Versioning & Rollout
- `hero.defenseVersion`: `"v1"` or `"v2"` stored with each hero definition.
- Global kill-switch `enableDefenseV2` (env/config). When `false`, everyone runs v1 regardless of hero flag. When `true`, heroes obey their `defenseVersion`.
- Dev-only toggle (query param or dev panel) to override per session for A/B testing.
- Reports/snapshots must include:
  - `defenseSchemaVersion`
  - `defenseDslVersion` (semver for matcher/effect DSL)
  - `enableDefenseV2`
  - `hero.defenseVersion`
  - Count of v1 vs. v2 turns for telemetry.

## Defense Card Data Model
- Each hero gets a `defenseCard` structure (used when `defenseVersion === "v2"`):
  - `dice`: number of defense dice rolled.
  - `fields`: partition of die faces into labeled groups (`{ id: string; faces: number[] }[]`). Validator enforces disjoint faces and ensures every rule-referenced face belongs to exactly one field.
  - `rules`: ordered list of rule definitions.
- Rule schema:
  - `id` / `label`: unique identifier for logs/UI.
  - `matcher`: JSON definition resolved via matcher registry (see below).
  - `effects`: array of effect definitions resolved via effect registry.
  - Optional metadata (e.g., `allowReroll`, `target`, `conditions`).
- All configuration is data-driven (JSON/TS config) so adding new matchers/effects is declarative.
- Coverage validator ensures every rule references valid fields/faces; invalid heroes fall back to v1 and emit warnings in logs/reports.
- Optional lint `allowIdleFaces` (default false) warns if partition contains faces never referenced by any rule (useful for aggressive heroes who intentionally ignore some faces).

### Example
```ts
defenseCard: {
  dice: 3,
  fields: [
    { id: "F1", faces: [1, 2] },
    { id: "F2", faces: [3, 4] },
    { id: "F3", faces: [5] },
    { id: "F4", faces: [6] },
  ],
  rules: [
    { id: "ignite", matcher: { type: "countField", fieldId: "F1" }, effects: [{ type: "dealPer", amount: 1 }] },
    { id: "smolder_guard", matcher: { type: "pairsField", fieldId: "F2" }, effects: [{ type: "preventHalf" }] },
    { id: "scorch_ready", matcher: { type: "exactFace", face: 6, count: 2 }, effects: [{ type: "gainStatus", status: "scorch", amount: 1 }] },
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
  - `pairsField(fieldId, cap?)`: `floor(fieldCount / 2)` with optional cap.
  - `exactFace(face, count)`: literal face matcher (useful for “two sixes” even if face shares a field).
  - `combo(fields: { id: string; min: number }[], allowExtra = true)`: requires a recipe across fields; when `allowExtra` is `false`, extra dice from those fields invalidate the match.
- Matchers emit structured payloads (`matchCount`, `fieldTotals`, `matchedDiceIndexes`, etc.) consumed by effects/logging.
- Validation & linting:
  - Field partitions must be disjoint.
  - Detect rules that would double-count the same dice (e.g., `countField(F1)` plus `combo` referencing `F1` with `allowExtra=false`).
  - Warn about conflicting caps / exclusivity settings to keep authoring predictable.
  - Warn when `exactFace` references a face not included in any field (allowed but highlighted).
  - If validation fails at runtime, automatically fall back to v1 and mark the report with the error.
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
  - `dealPer(matchCount, amount)`.
  - `flatBlock(amount)` / `blockPer(matchCount, amount)`.
  - `preventHalf(per = matchCount)` (rounded up; defense-card only).
  - `reflect(amount)`.
  - `gainStatus`, `applyStatusToOpponent`.
  - `buffNextAttack`.
  - `heal`, `cleanse`, `transferStatus`.
  - `rerollDice(count, fields?: fieldId[])`.
- Effects can have caps (e.g., block per face limited by dice count or status stacks).
- Conditions allow gating (e.g., requires opponent Burn); rejected effects log the reason.
- Reroll effects must specify dice-selection policy (`highestNonMatching`, `lowest`, `random(seed)`, etc.) so AI behavior stays deterministic.
- Limit reroll cascades via `maxRerollsPerDefense` (configurable) to prevent infinite loops.
- Effects exposing player choice must annotate `selectionPolicy`; AI uses deterministic policy, players act manually, RNG stream remains isolated for rerolls.

## Combat Pipeline (Defense Turn)
1. **Defense Roll**: roll hero-specific number of dice.
2. **Rule Evaluation**:
   - For each rule, evaluate matcher once (rerolls happen only if an effect explicitly requests it).
   - All matched rules trigger; no player choice between multiple outcomes.
   - Apply non-damage effects immediately (status gains, buffs, rerolls).
3. **Player Reaction Window**:
   - Players may spend statuses (Chi, Evasive, etc.) using existing UI.
   - Default rule: newly gained statuses/buffs cannot be spent in the same roll unless the effect explicitly sets `usablePhase: "immediate" | "nextAttack" | "nextTurn"`.
4. **Mitigation Aggregation**:
   - Combine results following strict order:
     1. Raw attack damage.
     2. Flat reductions (subtract fixed amounts).
     3. Percent prevent (only 50% rounded up from card effects).
     4. Block.
     5. Reflect damage.
     6. Floor at ≥ 0.
    - Prevent-all exists only via status effects (outside defense card).
   - Capture telemetry checkpoints (`rawDamage`, `afterFlat`, `afterPrevent`, `afterBlock`, `afterReflect`) for forensic debugging.
   - `preventHalf` is defined as `ceil(remainingDamage / 2)`; if remaining is 1, prevent 1. Clamp final result to ≥ 0 and log when clamping occurs.
   - Reflect can kill the attacker before defender damage resolves; treat as simultaneous application, allowing double KO. Log `doubleKo: true` when both reach 0.
5. **Damage Application**:
   - Apply net damage simultaneously to both sides (allow double KO ⇒ draw).
6. **Cleanup**:
   - Expire any effects flagged for end-of-roll/end-of-phase.
   - Maintain logs for every action (rule triggered, effect result, failure reason if conditions unmet).

## Reroll Effects
- Some effects may instruct rerolling dice (e.g., “reroll one die”).
- Implementation requirements:
  - Temporarily unlock specified dice (even if previously held).
  - Prompt user (or AI) to select dice if effect allows choice; otherwise auto-select per rule.
  - Animate reroll and re-evaluate the entire rule set after reroll completes (new outcomes can stack with previous ones).
  - Ensure rerolls can cascade (e.g., rule causes reroll → new outcomes triggered).

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
- Buff lifecycle:
  - Stored in state, serialized to saves/reports.
  - Consumed automatically at trigger (e.g., next attack) or cleaned up on expiry.
  - Logs on creation, consumption, or expiry (even if unused).
  - `carryOverOnKO` controls whether buff persists if owner/opponent is KO’d during the turn.
- `usablePhase` metadata determines when buffs/statuses can be consumed next (default `nextTurn`).
- Scorch-like effects become positive, spendable statuses referencing opponent’s Burn; they can specify expiry rules (e.g., discard if unused next turn).
- Status application metadata must include source (offensive ability, defensive rule, status effect). Useful for debugging/logs.

## Logging & Telemetry
- Every rule trigger logs:
  - Rule ID/label.
  - Field counts / faces that satisfied the matcher.
  - Effects executed and their outcomes (success/failure + reason).
- Capture `diceSnapshotBefore`, `diceSnapshotAfter` (after rerolls) and `fieldsHash` for deterministic replay.
- Combat log should show defense summary: “Cinder Skin → Ignite (applied Burn), Scorch buff primed.”
- Stats snapshot additions:
  - `defenseSchemaVersion`.
  - Defense card partition / field hash for auditing.
  - `rulesHit[]`: per-rule `matchCount`, effect outcomes, rejection reasons.
  - Breakdowns of `damageBlocked`, `damagePrevented`, `damageReflected` per new pipeline.
  - Source metadata for statuses gained.
  - Counts of v1/v2 turns for telemetry plus aggregate counters (`preventHalfEvents`, `flatBlockSum`, `reflectSum`, `wastedBlockSum`, etc.).
  - Aggregate pipeline checkpoints (avg `raw → afterFlat → afterPrevent → afterBlock`) per hero/matchup to visualize where defenses contribute most.
  - `defenseEfficiency = (prevent + block + reflect) / raw` tracked per hero/matchup.

## Integrity & Damage Calculations
- Fix existing stats bug:
  - `damageBlocked` should only capture actual block amounts.
  - `damagePrevented` only records negate/prevent effects (i.e., prevent-half or negate-all). Never mix block & prevent in the same field.
  - Integrity recomputation uses `attackBase - blocked - prevented`.
- Defense cards may only emit `preventHalf` (rounded up). Full negation remains tied to statuses (e.g., Evasive).

## UI/UX Updates
- Display hero’s defense card in the defense panel (rule list with icons/labels).
- After roll, highlight triggered rules and show short descriptions.
- Provide visual feedback for rerolls initiated by effects.
- Status spend UI remains unchanged; defense card just feeds new logs/effects.
- Need optional dev HUD to toggle v1/v2 for quick QA and display partition/rule diagnostics (field counts, rule hits).

## Implementation Plan
1. **Data Layer**
   - Extend hero definitions with `defenseVersion` + `defenseCard`.
   - Add global/config toggles and report metadata.
2. **Registries**
   - Implement matcher/effect registries with validation.
   - Write unit tests for each matcher/effect.
3. **Engine Changes**
   - Build defense resolver for v2 pipeline (rule eval → effects → mitigation).
   - Add reroll support, non-damage effect handling, status gating.
   - Implement `pendingDefenseBuffs` + expiry logic.
4. **UI Integration**
   - Render defense card info, highlight matches, animate effects.
   - Support reroll prompts/animations.
5. **Telemetry & Stats**
   - Update stats tracker fields/logging.
   - Ensure integrity check uses new data correctly.
6. **Migration & QA**
   - Default both Pyromancer/Shadow Monk to v2 (behind kill-switch).
   - Provide ability to run same seed under v1/v2 (QA plan).
   - Keep v1 codepath until confidence is high; kill-switch for rollback.
7. **Docs & Tests**
   - Document DSL schema and pipeline.
   - Add unit/integration tests for new defense flow, status interactions, and buff lifecycle.
   - Golden tests:
     - Prevent-half rounding (1,2,3… damage).
     - Reroll cascade with re-evaluation.
     - `combo` with `allowExtra` true/false.
     - Rejected effects (condition fails).
     - Double-KO via reflect.
     - Validation failure → fallback to v1 (report flag).
   - Seed diff QA (same seed v1 vs v2) for Pyromancer/Monk to compare TTK/WR/mitigation.
   - Fuzz tests to ensure validator catches partition overlaps and idle faces when not allowed.

## Phase 1 (MVP) Scope
To keep the initial rollout focused, Phase 1 implements the minimal viable subset below while leaving the rest of this document as the full end-state reference.

- **Matchers**: only `countField` and `pairsField` (with optional `min` requirement). No combos or rerolls yet.
- **Effects**:
  - `dealPer` with optional `cap`.
  - `flatBlock` with optional `cap`.
  - `preventHalf` (always applied once, ignores `matchCount`).
  - `gainStatus` with `stackCap` and default `usablePhase = "nextTurn"`.
  - _Everything else (reflect, reroll, buffNextAttack, transfer, etc.) deferred to post-MVP._
- **Pipeline**: `rawDamage → flatBlock → preventHalf → floor>=0`. No reflect stage yet.
- **Fields & Validation**: disjoint partition required; failure triggers automatic fallback to v1 and flags the report (`fellBackToV1 = true`).
- **Telemetry**:
  - Record `raw`, `afterFlat`, `afterPrevent`, `finalDamage`.
  - Capture `rulesHit[]` (rule id + matchCount + effect outcome).
  - Boolean `fellBackToV1`.
- **UI**: show defense card definition and highlight triggered rules; no reroll UI or extra prompts.
- **Kill-switch & Hero flag**: fully wired from day one so we can toggle between v1/v2.
- **Tests**:
  - Prevent-half rounding (odd/even incoming damage).
  - `pairsField` counting accuracy.
  - `gainStatus` honoring `stackCap` and `usablePhase`.
  - Validation failure → fallback path (report flag + v1 behavior).

Everything beyond this list (reflect, reroll policies, buffs, advanced telemetry, etc.) lands post-MVP but remains documented above for continuity.

## Git/GitHub Process (strict)
To keep the rollout disciplined, every contributor (human or AI) must follow this workflow:

1. **Feature Branch**: All defense-v2 work lives on a dedicated branch (e.g., `feature/defense-v2`). No direct pushes to `main`.
2. **Incremental Commits**: Commit logical chunks (matcher registry, effect registry, pipeline core, telemetry, UI, tests) separately with clear messages.
3. **Pull Request**: Once Phase 1 scope is implemented, open a PR into `main` summarizing:
   - What is included (matchers/effects/pipeline/telemetry per MVP list).
   - Kill-switch + fallback behavior verified.
   - Tests executed (list golden/fuzz cases).
   - Pending post-MVP items.
4. **Review & QA**: PR must pass review/CI before merge. Keep kill-switch enabled until QA sign-off.
5. **Release Tagging**: After merge/QA, tag main (e.g., `v0.9.0-defense-v2-mvp`). Future increments (post-MVP features) increment semver + update docs.

AI agents must adhere to this process—no shortcuts, no merging without review/tagging. Document deviations in PR description if emergency fixes are required.

## Exclamation Reminders
- Never mix block and prevent; prevent-half only via card effect, full negate via statuses.
- Status spends (Evasive, Chi, etc.) remain separate; defense card shouldn’t alter their fundamentals.
- Log everything: rule triggers, effect outcomes, rerolls, buff lifecycle, status sources.
- Reroll effects must truly reroll dice (unlock + re-evaluate) before continuing.
- Buff metadata (owner, expiry, stacks) must be persisted to avoid future drift.
- Design rules so matchers don’t overlap on the same dice pattern unless intentionally stacked.
- Default: newly granted statuses/buffs are not usable this roll unless explicitly allowed.
- Validation failures must fall back to v1 and be clearly logged/reported.
- Reroll selection policies must be deterministic (AI-safe).
- Cap `dealPer` / `blockPer` effects even if current design doesn’t need it—prevents runaway scaling when fields change.
- Maintain both compact (report) and verbose (debug) log formats; report stays small, dev logs show dice indexes.
