import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  aggregateStatusSpendSummaries,
  type StatusId,
} from "../engine/status";
import { useGame } from "../context/GameContext";
import { useActiveAbilities } from "./useActiveAbilities";
import { useAttackExecution } from "./useAttackExecution";
import { useDefenseResolution } from "./useDefenseResolution";
import { useLatest } from "./useLatest";
import {
  usePlayerDefenseController,
  type PlayerDefenseState,
} from "./usePlayerDefenseController";
import { detectCombos } from "../game/combos";
import { useStatsTracker } from "../context/StatsContext";
import type {
  DefenseSchemaLog,
  PhaseDamage,
  StatsTurnInput,
  StatusRemovalReason,
  DefenseTelemetryTotals,
} from "../stats/types";
import type { StatusTimingPhase } from "../engine/status/types";
import type { GameFlowEvent } from "./useTurnController";
import type { GameState } from "../game/state";
import type {
  OffensiveAbility,
  PlayerState,
  Side,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
  Hero,
} from "../game/types";
import type {
  CombatEvent,
  AttackResolution,
  ResolvedDefenseState,
} from "../game/combat/types";
import type { DefenseStatusGrant } from "../defense/effects";
import type { DefenseSchemaResolution } from "../defense/resolver";
import type { DefenseVersion } from "../defense/types";
import type { DefenseSchemaLog } from "../stats/types";
import type { StatusSpendSummary } from "../engine/status";
import type { TurnEndResolution } from "../game/flow/turnEnd";
import type { Cue } from "../game/flow/cues";
type UseDefenseActionsArgs = {
  turn: Side;
  round: number;
  turnId: string;
  getAttackDecisionLatency: () => number | null;
  getDefenseDecisionLatency: () => number | null;
  clearDefenseDecisionLatency: () => void;
  consumeUpkeepDamage: (side: Side, turnId: string) => number;
  recordPlayerTurn: (entry: StatsTurnInput) => void;
  rolling: boolean[];
  ability: OffensiveAbility | null;
  dice: number[];
  you: PlayerState;
  pendingAttack: GameState["pendingAttack"];
  attackStatusRequests: Record<StatusId, number>;
  defenseStatusRequests: Record<StatusId, number>;
  clearAttackStatusRequests: () => void;
  clearDefenseStatusRequests: () => void;
  getStatusBudget: (side: Side, statusId: StatusId) => number;
  consumeStatusBudget: (side: Side, statusId: StatusId, amount: number) => void;
  logPlayerNoCombo: (diceValues: number[], attackerName: string) => void;
  logPlayerAttackStart: (
    diceValues: number[],
    ability: OffensiveAbility,
    attackerName: string
  ) => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  animateDefenseDie: (
    onDone: (roll: number) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (value: number) => void;
    }
  ) => void;
  animateDefenseRoll: (
    onDone: (dice: number[]) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (dice: number[]) => void;
    }
  ) => void;
  openDiceTray: () => void;
  closeDiceTray: () => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  restoreDiceAfterDefense: () => void;
  handleFlowEvent: (
    event: CombatEvent,
    options?: { afterReady?: () => void; durationMs?: number }
  ) => void;
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  aiPlay: () => void;
  aiStepDelay: number;
  playerDefenseState: PlayerDefenseState | null;
  setPlayerDefenseState: Dispatch<SetStateAction<PlayerDefenseState | null>>;
  setDefenseStatusRollDisplay: (
    display: {
      dice: number[];
      inProgress: boolean;
      label: string | null;
      outcome: "success" | "failure" | null;
    } | null
  ) => void;
  applyTurnEndResolution: (
    resolution: TurnEndResolution,
    logOptions?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  setDefenseStatusMessage: (message: string | null) => void;
  enqueueCue: (cue: Cue) => void;
  interruptCue: () => void;
  scheduleCallback: (durationMs: number, callback: () => void) => () => void;
  queuePendingDefenseGrants: (payload: {
    grants: DefenseStatusGrant[];
    attackerSide: Side;
    defenderSide: Side;
  }) => void;
  triggerDefenseBuffs: (phase: StatusTimingPhase, owner: Side) => void;
  applyDefenseVersionOverride: (hero: Hero) => Hero;
  queueDefenseResolution: (payload: { resolve: () => void; defenderSide: Side }) => void;
};

const mapDefenseSchemaLog = (
  schema?: DefenseSchemaResolution | null
): DefenseSchemaLog | undefined => {
  if (!schema) return undefined;
  return {
    schemaHash: schema.schemaHash ?? null,
    dice: [...schema.dice],
    checkpoints: { ...schema.checkpoints },
    rulesHit: schema.rules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      matched: rule.matched,
      matchCount: rule.matcher.matchCount,
      effects: rule.effects.map((effect) => ({
        type: effect.effectType,
        target: effect.target,
        outcome: effect.outcome,
        value: effect.value,
        reason: effect.reason,
        metadata: effect.metadata,
      })),
    })),
  };
};

const PREVENT_HALF_STATUS_ID: StatusId = "prevent_half";
const PREVENT_ALL_STATUS_ID: StatusId = "prevent_all";

const buildDefenseTelemetryDelta = (
  defenseState: ResolvedDefenseState | null,
  summary: AttackResolution["summary"],
  blockedAmount: number
): DefenseTelemetryTotals | null => {
  const baseBlock = defenseState?.baseBlock ?? 0;
  const statusTotals = defenseState
    ? aggregateStatusSpendSummaries(defenseState.statusSpends)
    : null;
  const statusBlock = statusTotals?.bonusBlock ?? 0;
  const countEvents = (statusId: StatusId): number =>
    defenseState?.statusSpends.reduce((sum, spend) => {
      if (spend.id === statusId) {
        return sum + spend.successCount;
      }
      return sum;
    }, 0) ?? 0;

  const preventHalfEvents = countEvents(PREVENT_HALF_STATUS_ID);
  const preventAllEvents = countEvents(PREVENT_ALL_STATUS_ID);
  const reflectSum = summary.reflected ?? 0;
  const wastedBlock = Math.max(
    0,
    baseBlock + statusBlock - blockedAmount
  );

  if (
    baseBlock === 0 &&
    statusBlock === 0 &&
    preventHalfEvents === 0 &&
    preventAllEvents === 0 &&
    reflectSum === 0 &&
    wastedBlock === 0
  ) {
    return null;
  }

  return {
    blockFromDefenseRoll: baseBlock,
    blockFromStatuses: statusBlock,
    preventHalfEvents,
    preventAllEvents,
    reflectSum,
    wastedBlockSum: wastedBlock,
  };
};

export function useDefenseActions({
  turn,
  round,
  turnId,
  getAttackDecisionLatency,
  getDefenseDecisionLatency,
  clearDefenseDecisionLatency,
  consumeUpkeepDamage,
  rolling,
  ability,
  dice,
  you,
  pendingAttack,
  attackStatusRequests,
  defenseStatusRequests,
  clearAttackStatusRequests,
  clearDefenseStatusRequests,
  getStatusBudget,
  consumeStatusBudget,
  logPlayerNoCombo,
  logPlayerAttackStart,
  pushLog,
  animateDefenseDie,
  animateDefenseRoll,
  openDiceTray,
  closeDiceTray,
  popDamage,
  restoreDiceAfterDefense,
  handleFlowEvent,
  sendFlowEvent,
  aiPlay,
  aiStepDelay,
  playerDefenseState,
  setPlayerDefenseState,
  setDefenseStatusRollDisplay,
  applyTurnEndResolution,
  setDefenseStatusMessage,
  enqueueCue,
  interruptCue,
  scheduleCallback,
  queuePendingDefenseGrants,
  triggerDefenseBuffs,
  applyDefenseVersionOverride,
  queueDefenseResolution,
}: UseDefenseActionsArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const pendingDefenseSpendsRef = useRef<StatusSpendSummary[]>([]);
  const stats = useStatsTracker();
  const pendingTurnStatsRef = useRef<StatsTurnInput | null>(null);

  const resetDefenseRequests = useCallback(() => {
    pendingDefenseSpendsRef.current = [];
    clearDefenseStatusRequests();
  }, [clearDefenseStatusRequests]);
  const aiStatusReactionRef = useRef<StatusId | null>(null);
  const prepareTurnSnapshot = useCallback(
    (snapshot: StatsTurnInput) => {
      pendingTurnStatsRef.current = snapshot;
    },
    []
  );

  useEffect(() => {
    if (!pendingAttack) {
      pendingTurnStatsRef.current = null;
      return;
    }
    const state = latestState.current;
    const attackerState = state.players[pendingAttack.attacker];
    const defenderState = state.players[pendingAttack.defender];
    if (!attackerState || !defenderState) {
      pendingTurnStatsRef.current = null;
      return;
    }
    const combos = detectCombos(pendingAttack.dice);
    const combosTriggered: Record<string, number> = {};
    let opportunityCount = 0;
    Object.entries(combos).forEach(([comboId, active]) => {
      if (active) {
        opportunityCount += 1;
        combosTriggered[comboId] = (combosTriggered[comboId] ?? 0) + 1;
      }
    });
    const attackLatency =
      pendingAttack.attacker === "you" ? getAttackDecisionLatency() : null;
    const attackPromptMs =
      pendingAttack.attacker === "you" && attackLatency != null
        ? attackLatency
        : undefined;
    const upkeepDot = consumeUpkeepDamage(pendingAttack.attacker, turnId);
    const ability = pendingAttack.ability ?? null;
    const abilityKey = ability
      ? `${attackerState.hero.id}:${ability.combo}`
      : null;
    prepareTurnSnapshot({
      turnId,
      round: Math.max(1, round || 1),
      attackerSide: pendingAttack.attacker,
      defenderSide: pendingAttack.defender,
      abilityId: abilityKey,
      combo: ability?.combo ?? null,
      expectedDamage: pendingAttack.baseDamage,
      attackDice: [...pendingAttack.dice],
      opportunityCount,
      pickCount: ability ? 1 : 0,
      combosTriggered:
        Object.keys(combosTriggered).length > 0 ? combosTriggered : undefined,
      phaseDamage: {
        attack: 0,
        counter: 0,
        upkeepDot,
        collateral: 0,
      },
      rollEndToAbilitySelectMs: attackPromptMs,
      attackPromptToChoiceMs: attackPromptMs,
    });
  }, [
    getAttackDecisionLatency,
    consumeUpkeepDamage,
    latestState,
    pendingAttack,
    round,
    prepareTurnSnapshot,
    turnId,
  ]);

  const setPhase = useCallback(
    (phase: GameState["phase"]) => {
      sendFlowEvent({ type: "SET_PHASE", phase });
    },
    [sendFlowEvent]
  );

  const handleAiAbilityControllerAction = useCallback(
    (
      action: NonNullable<ActiveAbilityOutcome["controllerAction"]>,
      _context: ActiveAbilityContext
    ) => {
      if (action.type === "USE_STATUS_REACTION") {
        aiStatusReactionRef.current =
          (action.payload as { statusId?: StatusId })?.statusId ?? null;
      }
    },
    []
  );

  const {
    abilities: aiActiveAbilities,
    performAbility: performAiActiveAbility,
  } = useActiveAbilities({
    side: "ai",
    pushLog,
    popDamage,
    sendFlowEvent,
    handleControllerAction: handleAiAbilityControllerAction,
  });

  const patchAiDefense = useCallback(
    (partial: Partial<GameState["aiDefense"]>) => {
      dispatch({ type: "PATCH_AI_DEFENSE", payload: partial });
    },
    [dispatch]
  );

  const setPendingAttackDispatch = useCallback(
    (attack: GameState["pendingAttack"]) => {
      dispatch({ type: "SET_PENDING_ATTACK", attack });
      if (!attack) {
        resetDefenseRequests();
        setPlayerDefenseState(null);
      }
    },
    [dispatch, resetDefenseRequests, setPlayerDefenseState]
  );

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({ type: "SET_PLAYER", side, player });
    },
    [dispatch]
  );

  const { resolveDefenseWithEvents: baseResolveDefense } = useDefenseResolution({
    enqueueCue,
    interruptCue,
    scheduleCallback,
    setPhase,
    restoreDiceAfterDefense,
    handleFlowEvent,
    aiPlay,
    aiStepDelay,
    latestState,
    popDamage,
    pushLog,
    setPlayer,
    queueDefenseResolution,
  });
  const resolveDefenseWithEvents = useCallback(
    (
      resolution: Parameters<typeof baseResolveDefense>[0],
      context: Parameters<typeof baseResolveDefense>[1]
    ) => {
      const draft = pendingTurnStatsRef.current;
      if (draft && resolution.summary) {
        pendingTurnStatsRef.current = null;
        const summary = resolution.summary;
        const damageWithoutBlock = summary.damageDealt + summary.blocked;
        const defenseChoiceMs =
          draft.defenderSide === "you"
            ? getDefenseDecisionLatency()
            : null;
        const applied: Record<string, number> = {};
        const expired: Record<string, number> = {};
        const applyDiff = (diff: Record<string, number>) => {
          Object.entries(diff).forEach(([id, delta]) => {
            if (delta > 0) {
              applied[id] = (applied[id] ?? 0) + delta;
            } else if (delta < 0) {
              expired[id] = (expired[id] ?? 0) + Math.abs(delta);
            }
          });
        };
        applyDiff(summary.attackerStatusDiff ?? {});
        applyDiff(summary.defenderStatusDiff ?? {});
        const attackerExpired = stats.recordStatusSnapshot(
          context.attackerSide,
          resolution.updatedAttacker.tokens,
          draft.round
        );
        const defenderExpired = stats.recordStatusSnapshot(
          context.defenderSide,
          resolution.updatedDefender.tokens,
          draft.round
        );
        const lifetimeTurns: Record<string, number[]> = {};
        const removalReasons: Record<
          string,
          Record<StatusRemovalReason, number>
        > = {};
        const accumulateLifetime = (
          expiredMap: Record<
            string,
            { lifetime: number; reason: StatusRemovalReason }
          >
        ) => {
          Object.entries(expiredMap).forEach(([statusId, payload]) => {
            if (!lifetimeTurns[statusId]) lifetimeTurns[statusId] = [];
            lifetimeTurns[statusId].push(payload.lifetime);
            if (!removalReasons[statusId]) {
              removalReasons[statusId] = {
                natural: 0,
                cleanse: 0,
                transfer: 0,
                cap: 0,
              };
            }
            removalReasons[statusId][payload.reason] += 1;
          });
        };
        accumulateLifetime(attackerExpired);
        accumulateLifetime(defenderExpired);

        const attackPreMit = summary.damageDealt + summary.blocked;
        const preventedAmount = summary.negated
          ? attackPreMit
          : Math.max(0, attackPreMit - summary.damageDealt);
        const blockedAmount = summary.negated ? 0 : summary.blocked;
        const basePhaseDamage = draft.phaseDamage ?? {
          attack: 0,
          counter: 0,
          upkeepDot: 0,
          collateral: 0,
        };
        const phaseDamage: PhaseDamage = {
          attack: attackPreMit,
          counter: summary.reflected,
          upkeepDot: basePhaseDamage.upkeepDot ?? 0,
          collateral: basePhaseDamage.collateral ?? 0,
        };
        const attackAfterMit = Math.max(
          0,
          phaseDamage.attack + phaseDamage.collateral - blockedAmount - preventedAmount
        );
        const actualDamage = attackAfterMit;

        const defenseSelection = resolution.defense?.selection;
        const schemaSnapshot = defenseSelection?.roll.schema ?? null;
        const defenseVersionUsed: DefenseVersion | undefined = schemaSnapshot
          ? "v2"
          : defenseSelection
          ? "v1"
          : undefined;
        const defenseSchemaLog = mapDefenseSchemaLog(schemaSnapshot);

        if (summary) {
          const telemetryDelta = buildDefenseTelemetryDelta(
            resolution.defense ?? null,
            summary,
            blockedAmount
          );
          if (telemetryDelta) {
            stats.updateGameMeta({
              defenseMeta: { totals: telemetryDelta },
            });
          }
        }

        stats.recordTurn({
          ...draft,
          actualDamage,
          damageBlocked: blockedAmount,
          damageWithoutBlock: attackPreMit,
          damagePrevented: preventedAmount,
          counterDamage: summary.reflected,
          phaseDamage,
          defenseAbilityId: summary.defenseAbilityId ?? null,
          defenseDice:
            resolution.defense?.selection.roll.dice ?? undefined,
          defensePromptToChoiceMs:
            draft.defenderSide === "you" && defenseChoiceMs != null
              ? defenseChoiceMs
              : undefined,
          statusLifetimeTurns:
            Object.keys(lifetimeTurns).length > 0 ? lifetimeTurns : undefined,
          statusRemovalReasons:
            Object.keys(removalReasons).length > 0
              ? removalReasons
              : undefined,
          statusApplied:
            Object.keys(applied).length > 0 ? applied : undefined,
          statusExpired:
            Object.keys(expired).length > 0 ? expired : undefined,
          attackerStatusDiff:
            summary.attackerStatusDiff &&
            Object.keys(summary.attackerStatusDiff).length > 0
              ? summary.attackerStatusDiff
              : undefined,
          defenderStatusDiff:
            summary.defenderStatusDiff &&
            Object.keys(summary.defenderStatusDiff).length > 0
              ? summary.defenderStatusDiff
              : undefined,
          defenseEfficacy: {
            defenseAbilityId: summary.defenseAbilityId ?? null,
            incomingAbilityId: draft.abilityId ?? null,
            blocked: blockedAmount,
            prevented: preventedAmount,
            reflected: summary.reflected,
          },
          defenseVersion: defenseVersionUsed,
          defenseSchema: defenseSchemaLog,
        });
        if (draft.defenderSide === "you") {
          clearDefenseDecisionLatency();
        }
      }
      baseResolveDefense(resolution, context);
    },
    [
      baseResolveDefense,
      clearDefenseDecisionLatency,
      getDefenseDecisionLatency,
      stats,
    ]
  );

  const { onConfirmAttack } = useAttackExecution({
    turn,
    rolling,
    ability,
    dice,
    turnId,
    round: Math.max(1, round || 1),
    prepareTurnSnapshot,
    you,
    attackStatusRequests,
    clearAttackStatusRequests,
    logPlayerNoCombo,
    logPlayerAttackStart,
    setDefenseStatusMessage,
    setDefenseStatusRollDisplay,
    applyTurnEndResolution,
    setPhase,
    patchAiDefense,
    scheduleCallback,
    latestState,
    setPlayer,
    consumeStatusBudget,
    getStatusBudget,
    openDiceTray,
    closeDiceTray,
    animateDefenseRoll,
    animateDefenseDie,
    pushLog,
    pendingDefenseSpendsRef,
    resolveDefenseWithEvents,
    aiActiveAbilities,
    performAiActiveAbility,
    aiReactionRequestRef: aiStatusReactionRef,
    queuePendingDefenseGrants,
    triggerDefenseBuffs,
    applyDefenseVersionOverride,
    queueDefenseResolution,
  });

  const {
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserStatusReaction,
  } = usePlayerDefenseController({
    pendingAttack,
    playerDefenseState,
    setPlayerDefenseState,
    latestState,
    setPhase,
    openDiceTray,
    closeDiceTray,
    animateDefenseRoll,
    animateDefenseDie,
    pushLog,
    setDefenseStatusRollDisplay,
    setDefenseStatusMessage,
    defenseStatusRequests,
    getStatusBudget,
    consumeStatusBudget,
    pendingDefenseSpendsRef,
    setPlayer,
    resetDefenseRequests,
    setPendingAttack: setPendingAttackDispatch,
    resolveDefenseWithEvents,
    scheduleCallback,
    queuePendingDefenseGrants,
    triggerDefenseBuffs,
    applyDefenseVersionOverride,
  });

  return {
    onConfirmAttack,
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserStatusReaction,
  };
}
