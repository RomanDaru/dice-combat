# AGENTS instructions for this repo

These instructions are for the AI assistant (GPT-5.1 via Codex CLI) working in this repository. They are based on OpenAI-style prompt engineering and adapted specifically to the `dice-combat` codebase and docs.

## General behavior

- Be concise, practical, and focused on the user's current goal.
- Prefer minimal, targeted changes over large refactors unless explicitly requested.
- Avoid guessing about requirements; when something is ambiguous, state your assumptions clearly in the final message.
- Do not add new dependencies, tools, or architectural patterns unless the user asks or the change is clearly necessary.
- Keep responses primarily in the user's language (typically Slovak/Czech for explanation, English for code), unless the user switches.

## Working with prompts and instructions

- Treat instructions as a hierarchy:
  - System messages > Developer messages > AGENTS.md > User messages > Code comments.
  - If there is a conflict, follow the higher-level instruction and, if relevant, mention it briefly in the final response.
- When the user gives a fuzzy or high-level request:
  - Restate your understanding in 1-2 short sentences.
  - List assumptions explicitly and proceed instead of stalling.
- When the user pastes code or errors:
  - Focus on the smallest relevant snippet or reproducer.
  - Fix what is clearly wrong first (types, control flow, logic), then consider style.

## Project overview: dice-combat

- This is a deterministic dice-based combat game with:
  - Core combat and status logic in `src/engine` and `src/game`.
  - React UI in `src/components` and `src/screens`.
  - Simulation and analytics tooling in `src/sim` and `src/stats`.
- Before doing major gameplay or status changes, skim the relevant docs under `docs/`, especially:
  - `docs/prd-dice-combat.md` for the high-level product vision, pillars, and MVP scope.
  - `docs/codex-guidelines.md`
  - `docs/holy-grail-combat-flow.md`
  - `docs/defense-v2.md`
  - `docs/status-core-plan.md`, `docs/status-phase-plan.md`, `docs/status-lifecycle-refactor.md`
  - `docs/status-definition-template.md` when adding or changing statuses.

## Code structure and layering

- `src/engine`:
  - Pure TypeScript domain logic: RNG, status engine, combat resolver.
  - Keep functions pure and deterministic; no React, DOM, or direct UI concerns.
  - New features here should come with tests in `src/engine/__tests__` or `src/engine/status/__tests__`.
- `src/game`:
  - Higher-level game orchestration (heroes, abilities, defense pipelines, and combat flow).
  - Engine-facing logic lives here rather than in React components.
  - When adding new rules, follow existing patterns in `heroes.ts`, `defenseBuffs.ts`, `engine.ts`, etc.
- `src/components` and `src/screens`:
  - React presentation: layout, animations, and user interaction wiring.
  - Do not introduce core game rules here; call into `src/game` / `src/engine` or context/hooks instead.
  - Be mindful of mobile-first UX (large touch targets, readable text).
- `src/context` and `src/hooks`:
  - Glue between React and the game/engine layer.
  - When adding new hooks, keep them thin and compositional; avoid duplicating state that already exists in the game engine.
- `src/sim` and `src/stats`:
  - CLI simulator and analytics for large-scale balance experiments.
  - Preserve determinism and seeding; any changes here must keep `npm run sim` usable and documented (see `docs/simulator.md`).

## Status and defense systems

- Status logic is central to the project; before editing:
  - Read the relevant status docs in `docs/` (Chi, DOTs, lifecycle, core plan).
  - Prefer adding behavior via status definitions and the registry rather than ad-hoc flags.
- When adding or changing a status:
  - Start from `docs/status-definition-template.md`.
  - Update definitions in `src/engine/status/defs.ts` and related types/registry files.
  - Ensure tick and lifecycle behavior stays consistent with `lifecycle.ts` and `runtime.ts`.
- For defense and reactions:
  - Follow the pipeline described in `docs/defense-v2.md` and the `src/game/combat` modules.
  - Avoid duplicating logic across `defensePipeline.ts`, `defenseSchemaRuntime.ts`, and UI overlays; keep the source of truth in the engine/game layer.

## Simulation, stats, and logs

- Use the simulator for balance work instead of hand-editing JSON logs:
  - Run experiments through `npm run sim` (`src/sim/cli.ts`) and analyze results via `src/sim/analytics.ts`.
  - Treat `DC_*.json` and `dice-combat-stats-*.json` files as artifacts, not hand-maintained data.
- When changing `src/stats/tracker.ts` or related code:
  - Preserve current data shapes and field names unless you also update all consumers and, if needed, docs.
  - Keep tracking lightweight so it does not disturb determinism or performance.

## Planning and decomposition

- Use the planning tool for multi-step or non-trivial changes (for example, gameplay refactors, new status systems, or UI rewrites).
- Plans should:
  - Have 3-7 short, outcome-focused steps.
  - Describe concrete repo changes instead of vague actions like "analyze code".
- Update the plan when:
  - You discover new information that changes the approach.
  - You finish a step and move on to another.

## Editing code

- Before touching a file:
  - Skim enough surrounding code to match existing style (naming, patterns, error handling).
- When implementing behavior:
  - Prefer clear, predictable logic over clever tricks.
  - Avoid one-letter variable names except for very local indices (`i`, `j`, etc.).
  - Do not add or change comments unless the user asks.
- When introducing new functions or types:
  - Choose names that describe what they do, not how they do it.
  - Place them in the module that already owns similar responsibilities (engine vs game vs UI).

## Testing and QA

- TypeScript:
  - The project compiles with `strict: true`; keep types explicit at module boundaries and avoid `any`.
- Automated tests:
  - Prefer the most specific tests for the code you change (for example, `src/engine/__tests__`, `src/game/__tests__`, `src/components/__tests__`).
  - Use `npm run qa` for a full suite run when requested; this maps to CI (`vitest`).
- Manual QA:
  - For gameplay changes touching initiative, Chi, Evasive, Burn, or Purifying Flame, consult `docs/qa-checklist.md` and ensure key flows still behave as described.
- When you fix a bug:
  - Think of at least one concrete scenario that was broken before and should work after.
  - Mention that scenario briefly in the final response.

## Error handling and robustness

- Handle invalid inputs and edge cases in a way consistent with the existing module (return values vs exceptions, guards, or assertions).
- Avoid adding broad, generic error wrappers around existing code unless the project already uses that pattern in the same layer.
- When unsure whether to fail fast or be tolerant:
  - Prefer failing explicitly with a clear message rather than silently ignoring problems, especially in engine/game logic.

## Final responses

- Keep final answers short and scannable:
  - Summarize what changed and why in a few bullets or sentences.
  - Reference files and key functions using backticked paths and identifiers.
- Do not paste large code blocks unless the user explicitly asks.
- Suggest the next logical action only when it is immediately helpful (for example, `npm run qa`, `npm run sim`, or how to trigger a specific scenario in the UI).

## Repository-specific notes

- This file applies to the entire `dice-combat` repository unless overridden by a more specific `AGENTS.md` in a subdirectory.
- When adding new files:
  - Prefer existing directories (`engine`, `game`, `components`, `screens`, `sim`, `stats`, `docs`) over introducing new top-level folders.
  - Use naming consistent with existing files in that area.
- When in doubt:
  - Look for an existing pattern in `src/` or `docs/` and follow it closely instead of inventing a new approach.
- Commit frequently and keep a written trail:
  - For larger features or refactors, update or add focused docs under `docs/` (for example PRDs, design notes, or RFC-style files).
  - For day-by-day incremental work (like UI polish or small engine tweaks), create or append to a `docs/tasks-YYYY-MM-DD.md` file summarizing what was done and any follow-up items.
  - Commit messages should briefly describe the scope of the change (e.g., `ui: align AI ability panel with player layout`), and the relevant doc/tasklist should contain the detailed rationale and notes.
