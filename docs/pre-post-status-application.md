# Pre/Post Damage Status Application Plan

This doc captures the motivation, scope, and concrete rollout steps for splitting offensive ability status application into `applyPreDamage` and `applyPostDamage`.

---

## Why We Are Doing This
- **Design needs** – Some offensive abilities should inject buffs/debuffs *before* damage is calculated (e.g., front‑loading Chi so the very attack gets buffed). Others should only apply lingering effects *after* damage resolves. The single `apply` hook cannot express this difference.
- **Clarity for content creators** – Today designers must remember that `apply` always triggers post‑damage. Renaming to `applyPostDamage` and adding an explicit pre‑damage field removes ambiguity and future bugs.
- **System extensibility** – Having both hooks lets us prototype new hero kits (burst vs. attrition) without overloading status logic or hacking `resolveAttack`.

---

## Implementation Checklist

1. **Types & data contracts**
   - Update `OffensiveAbility` in `src/game/types.ts`:
     - Rename `apply` → `applyPostDamage`.
     - Add `applyPreDamage?: AbilityApplyMap`.
     - Provide a temporary alias so legacy data (`apply`) still works until all heroes migrate.

2. **Ability definitions**
   - Sweep `src/game/heroes.ts` (and any other board files) to rename every `apply` usage to `applyPostDamage`.
   - Log a follow-up task to remove the alias once the migration is complete.

3. **Engine changes**
   - In `src/engine/resolveAttack.ts`:
     - Before calling `applyModifiers`, clone attacker/defender state and apply any `applyPreDamage` stacks (respecting existing clamp logic).
     - Feed the modified tokens into `applyModifiers` so the current attack snapshot sees the new stacks.
   - In `src/game/engine.ts` `applyAttack()`:
     - Replace usage of `ability.apply` with `ability.applyPostDamage ?? legacyApply`.
     - Ensure the pre-damage pass does **not** double-apply stacks post-damage.

4. **Status + modifier safety**
   - Confirm that pre-damage application plays nicely with turn-limited budgets (e.g., `chi` cap in `applyAttack`).
   - Add guards where needed so `applyPreDamage` can’t run during defense resolution or outside attack phases.

5. **Testing**
   - Unit: extend `engine/status/__tests__` and `engine/resolveAttack` tests with a fake ability that has both pre and post hooks.
   - Integration: add a scenario test under `hooks/__tests__/useDefenseResolution` (or a new combat test) verifying that pre-damage burn/chi actually alters the same attack.

6. **Docs & tooling**
   - Update hero authoring guides (`docs/status-definition-template.md` or a new snippet) explaining when to use each hook.
   - Communicate to designers that `applyPostDamage` is the default behavior if they omit both fields.

---

## Task List

- [x] `COD-001` – Update `OffensiveAbility` type (rename field, add alias, wire up `applyPreDamage` typing).
- [x] `COD-002` – Migrate hero ability data (`src/game/heroes.ts`, plus any ability board files) to `applyPostDamage`.
- [x] `COD-003` – Modify `resolveAttack` to inject `applyPreDamage` prior to `applyModifiers`.
- [x] `COD-004` – Adjust `applyAttack` so it only processes `applyPostDamage`, keeping fallback for legacy `apply`.
- [x] `COD-005` – Add regression tests for pre/post flows (unit + integration as outlined).
- [x] `COD-006` – Update design docs/tooltips and remove the legacy alias once all data is migrated.

---

## Rollout Notes
- **Backward compatibility** – Initial release keeps supporting `apply` to avoid breaking existing heroes. After all content files migrate, remove the alias and run type‑strict builds.
- **Gameplay tuning** – Pre‑damage hooks can create large burst spikes. Gate them (e.g., limited stack gains, ultimates only) until playtests confirm balance.
- **UI/UX** – If an ability gains special timing, reflect that in tooltips (“Applies Burn before striking”).

---

## Open Questions
- Should defense abilities also get pre/post hooks for tokens (e.g., shielding before block calculation)? Not required now, but worth tracking.
- Do we need per-status flags controlling whether they are allowed in pre-damage context (e.g., some statuses might only make sense post-hit)?

Document owner: Codex (Nov 2025). Update when alias removal or defense parity work begins.
