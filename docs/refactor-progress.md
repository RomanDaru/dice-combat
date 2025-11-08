# Defense Actions Refactor Progress

## Completed

1. **Combat Flow Blueprint** – `docs/holy-grail-combat-flow.md` records the canonical turn phases, micro-hooks, and status-behavior rules that guide every subsequent change.
2. **Helper Extraction** – `src/hooks/defenseActions.helpers.ts` centralizes formatting helpers and spend-merging logic, keeping hooks lean.
3. **Defense Resolution Hook** – `useDefenseResolution` encapsulates cue/log/damage orchestration for every resolved attack, giving us a reusable orchestrator.
4. **Attack Execution Hook** – `useAttackExecution` owns the entire `onConfirmAttack` pipeline (status spends, AI defensive responses, evasive flow), so `useDefenseActions` only wires dependencies.
5. **AI Defense Response Hook** – `useAiDefenseResponse` isolates the AI defense roll plus evasive handling logic, reducing `useAttackExecution` to a pure trigger.
6. **Player Defense Controller Hook** – `usePlayerDefenseController` now owns the player-side defense roll, combo selection, confirmation, and evasive handling to mirror the AI controller.

## Next Steps

1. **Status Behavior Generalization** – replace explicit status IDs (chi/evasive) with metadata-driven behaviors/timings per `holy-grail-combat-flow.md`, enabling arbitrary status creativity.
2. **GameController Orchestration** – gradually relocate flow control (phase changes, pending attack dispatch, cue scheduling) from hooks into GameController to achieve a single orchestrator.
3. **Testing + Instrumentation** – add unit tests for the new helper/hook boundaries and temporary logging around turn start/AI flow when integrating future steps.
