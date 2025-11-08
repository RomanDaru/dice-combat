# Defense Actions Refactor Progress

## Completed

1. **Combat Flow Blueprint** – `docs/holy-grail-combat-flow.md` records the canonical turn phases, micro-hooks, and status-behavior rules that guide every subsequent change.
2. **Helper Extraction** – `src/hooks/defenseActions.helpers.ts` now centralizes formatting helpers and spend-merging logic, allowing hooks to stay lean.
3. **Defense Resolution Hook** – `useDefenseResolution` encapsulates cue/log/damage orchestration for every resolved attack, giving us a reusable orchestrator.
4. **Attack Execution Hook** – `useAttackExecution` owns the entire `onConfirmAttack` pipeline (status spends, AI defensive responses, evasive flow), so `useDefenseActions` only wires dependencies.

## Next Steps

1. **AI Defense Controller** – extract the remaining AI defense logic (pre-defense actions, defense roll management, pending spend queue) into its own hook to further shrink `useDefenseActions`.
2. **Player Defense Controller** – move `onUserDefenseRoll`, combo selection, `onConfirmDefense`, and player evasive handling into a dedicated module mirroring the AI controller.
3. **Status Behavior Generalization** – replace explicit status IDs (chi/evasive) with metadata-driven behaviors/timings per `holy-grail-combat-flow.md`, enabling arbitrary status creativity.
4. **GameController Orchestration** – gradually relocate flow control (phase changes, pending attack dispatch, cue scheduling) from hooks into GameController to achieve a single orchestrator.
5. **Testing + Instrumentation** – add unit tests for the new helper/hook boundaries and temporary logging around turn start/AI flow when integrating future steps.
