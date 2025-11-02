# `codex-guidelines.md`

> Practical guidance for the Codex AI agent working on **dice-combat**. Goal: portrait 2D mobile game with short play sessions, smooth UI, and a clean separation between core systems and presentation.

## Goals and Constraints

- **Target platform:** mobile first (Android / iOS) with a web build for fast iteration.
- **Performance:** steady 60 fps on mid / low-end hardware; avoid layout thrash, unnecessary allocations, or forced reflow.
- **Ergonomics:** touch friendly, large hit boxes, haptics where possible, short animations (about 220–350 ms) and fallback for `prefers-reduced-motion`.
- **Replayability:** deterministic combat logs and replays (seeded RNG), event-driven flow, auditable outcomes.

## Architecture

- **Layering**
  - `engine/` – pure TypeScript domain logic (rules, RNG, resolver, state machine, types, tests).
  - `ui/` – rendering, input, animation, audio/haptics. Subscribes to engine events; has no game logic.
  - `app/` – bootstrap, dependency wiring, adapters (storage, haptics, analytics, etc.).
- **Event-driven:** engine emits `Event[]` such as `attack_started`, `dice_locked`, `damage_applied`. UI interprets them for visuals/audio; the engine never depends on UI.
- **Deterministic RNG:** injectable `rng(seed)` used everywhere; seed stored so tests and bug repros are repeatable.
- **Data-driven rules:** abilities and effects defined in JSON/TS schema (id, timing, targeting, modifiers, conditions), logic remains generic.
- **FSM:** battle states like `Roll → Reroll → Target → Resolve → End` with guards free of side effects outside of the engine.

## Code Standards (TypeScript)

- Compile with `strict`; avoid `any`. Expose explicit types at module boundaries.
- Engine functions should be pure; side effects live in UI/app layers.
- Treat state as immutable (structural sharing), no hidden mutation.
- Keep functions roughly ≤40 lines and files ≤300 lines when practical.
- Naming: `IEvent`, `Decision`, `Ability`, `Resolver`, `GameState`, etc.
- Tooling: ESLint + Prettier (resolved rule conflicts) with Husky pre-commit hooks.

## Testing

- **Unit (Vitest):** cover 100 % of critical combat paths (damage, reroll, shield/reflect, `onRoll` / `onResolve` timing).
- **Golden tests:** fixed seeds for stable replays.
- **Property-based (optional):** fast-check for dice edge cases.
- **Snapshot logs:** ensure `combatLog` output matches expectations.

## Animation & UX

- Use FLIP: measure once, animate via `transform` / `opacity`, set `will-change`.
- Pool DOM / Phaser nodes for repeated effects instead of constant allocation.
- Stagger icon reveals by 40–60 ms; impact events about 80–120 ms before landing (trigger haptics/SFX).
- `pointer-events: none` on non-interactive overlays.
- Respect `prefers-reduced-motion` (shorten or skip animations).

## Performance & Assets

- Prefer atlases / spritesheets; compress to webp/avif (web) or png-quant (mobile).
- Avoid `top/left` animations—use transforms. Batch reads/writes (use `requestAnimationFrame`).
- Limit simultaneous tweens; provide debug view (fps, allocations, sprite counts).

## Mobile Packaging

- Capacitor for Android/iOS; plugins: Haptics, Storage, later In-App Purchases.
- Test common aspect ratios (18:9, 19.5:9, 20:9) across low / mid / high-tier devices.

## Observability & Logging

- `combatLog` in the engine stays concise and deterministic; UI may layer formatting.
- Simple analytics for now (local files / console, no PII).

## Session Notes – 2025-11-02

- Extended Vitest coverage for `applyModifiers` (priority, pass-through, phase branching).
- `resolveAttack` now respects runtime modifier hooks, gates spends when base values are zero, and short-circuits on negate.
- UI, engine, and AI read tokens via `getStacks` / `setStacks`; never poke `tokens.chi/evasive/burn` directly.
- `TokenChips` consumes metadata from the status registry; `useStatusManager` includes regression tests for Burn cleanse.
