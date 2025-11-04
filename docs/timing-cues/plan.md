# Timing & Cue System — Master Plan

## Related Issues
- [ ] #1 Flow Timing Hub  
- [ ] #2 Transition Cue System  
- [ ] #3 Gameplay Event Integration  

## Objective
Establish a unified timing and cue framework that governs all pacing, overlays, and battle transitions.
Every future battle-related event (upkeep, attack, defense, turn changes) will use this hub exclusively.

## Acceptance Criteria
- [ ] All dispatches pass through timing helper.  
- [ ] Cue overlay system operational and responsive.  
- [ ] Gameplay events integrated with correct ordering.  
- [ ] No direct use of setTimeout/setInterval.  
- [ ] 100% automated tests for timing/cues modules.  
- [ ] CI and linting green before merge.

---

When merging this PR, close:
Closes #1  
Closes #2  
Closes #3
