## Upcoming Work — Timing & Cue System

> Pre-flight items
- [ ] Zjednotiť volania: všetky `TURN_END` musia ísť výhradne cez `handleFlowEvent` (grep + fix).
- [ ] Cleanup overlayu: zabezpečiť zhasnutie pri unmount/reset/zmene fázy, nielen pri `!dispatched`.
- [ ] Fázové guardy: logika brániaca akciám podľa fázy musí akceptovať aj `turnTransition`, nielen `end`.
- [ ] Typy/exports: `CombatEvent` a `TURN_TRANSITION_DELAY_MS` musia byť jednotne exportované (engine + testy).
- [ ] Jednotná konštanta: udržiavať centralizované nastavenie (napr. `TURN_TRANSITION_DELAY_MS`) pre rýchle ladenie dĺžky pauzy.

> Goals: centralize pacing, surface battle cues, and remove ad-hoc timers. Every item below must include tests and must not introduce new `setTimeout`/`setInterval` usage outside the shared timing helper.

# Tasklist

## PR 1 — Flow Timing Hub

- [ ] Audit all `TURN_END` / `SET_PHASE` dispatches to ensure they route through the central helper only.
- [ ] Extend `handleFlowEvent` (or successor) to accept `durationMs` and sanitize payloads, defaulting to existing constants.
- [ ] Persist active transition metadata in controller context (`activeTransition` with side, phase, timestamps) and expose it via `useGameData`.
- [ ] Refactor AI/player pass and attack resolution emitters to supply structured timing data; eliminate any lingering direct timers outside the helper.
- [ ] Add unit tests mocking the flow dispatcher to confirm delays fire once, transitions clear on premature battle end, and zero-duration events skip holds.
- [ ] Verify updated constants keep current behaviour; adjust existing turn delay tests accordingly.

## PR 2 — Transition Cue System

- [ ] Define a cue model (`kind`, `title`, `subtitle`, `icon`, `duration`) and store it alongside transition state in the controller.
- [ ] Teach the timing helper to enqueue cues and process them FIFO without relying on standalone timers.
- [ ] Update `BattleScreen` overlay to render based on cue kind (turn, status, attack, etc.) using context data; maintain accessibility and stacking order.
- [ ] Style new cue variants in `BattleScreen.module.css`, ensuring overlays remain pointer-safe and responsive.
- [ ] Wire hooks (`useGameFlow`, `useDefenseActions`, etc.) to publish cues for upstream events (initiative, upkeep, pending attack) exclusively through the helper.
- [ ] Add component/state tests verifying cue sequencing, duration handling, and automatic clearance after playback.

## PR 3 — Gameplay Event Integration

- [ ] Feed `resolveTurnStart` results (status damage, prompts) into the cue/timing hub with appropriate durations before advancing phases.
- [ ] Emit attack telegraph cues when `pendingAttack` is set, including ability name and projected damage snapshot.
- [ ] Surface defense resolution summaries (blocked vs. damage taken) as cues prior to the next turn transition.
- [ ] Audit the entire codebase to ensure no residual direct timing calls remain; everything funnels through the centralized helper.
- [ ] Add integration-style tests covering upkeep cues, attack telegraphs, defense summaries, and confirming proper ordering with turn cues.
- [ ] Consider visual or snapshot tests for combined cue overlays to guard future regressions.
