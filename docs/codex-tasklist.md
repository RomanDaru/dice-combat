## Sprint LITE – Status System Migration

> Cieľ: prejsť z token-žetónov na jednotný status runtime bez toho, aby sme rozbili hrateľnosť. Päť izolovaných PR, každé samostatne releasovateľné.

# Tasklist

## PR-L5a-fix — Add tests for `applyModifiers`

- ✅ Created `src/engine/status/__tests__/applyModifiers.test.ts` and covered priority ordering, no-op pass-through, and attack vs. defense branching.
- ✅ Vitest suite (`npm run test`) green.

**Status:** Completed (commit `test: cover applyModifiers scenarios`).

---

## PR-L5d — Wire `applyModifiers` into `resolveAttack`

- ✅ Updated `src/engine/resolveAttack.ts` to apply modifiers on attacker/defender context, gate spends when base damage/block hit zero, and short-circuit on negate before calling `applyAttack`.
- ✅ Added exhaustive regression coverage in `src/engine/__tests__/resolveAttack.test.ts` (priority, block, negate, logging, overflow clamps).
- ✅ Full test suite passing after changes.

**Status:** Completed (commit `feat: apply status modifiers in resolveAttack` + `test: harden resolveAttack modifier coverage`).

---

## PR-L5e — UI + direct-token cleanup + burn cleanse tests

- ✅ `TokenChips` now pulls status metadata via registry and `getStacks`; Chi dots capped via `DotRow`.
- ✅ Replaced direct `tokens.chi/evasive/burn` access across controllers, hooks, engine, AI, and tests with `getStacks`/`setStacks` (`git grep 'tokens.(chi|evasive|burn)' src` → no hits).
- ✅ Added `src/hooks/__tests__/useStatusManager.test.ts` covering burn cleanse success/failure paths with log and dispatch assertions.
- ✅ `npm run test` green.

**Status:** Completed (pending commit).

---

> Každé PR končí testami (`npm run test`) + mini changelogom. Pri veľkých súboroch (GameController, useDefenseActions) udržiavaj commit diffs čitateľné — radšej viac menších commitov než jeden mega diff. Samostatne kontroluj `TokenChips`, `combatLog`, `aiController` pre regresie.
