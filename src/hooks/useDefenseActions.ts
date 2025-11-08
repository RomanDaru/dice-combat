import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { StatusId } from "../engine/status";
import { useGame } from "../context/GameContext";
import { useActiveAbilities } from "./useActiveAbilities";
import { useAttackExecution } from "./useAttackExecution";
import { useDefenseResolution } from "./useDefenseResolution";
import { useLatest } from "./useLatest";
import {
  usePlayerDefenseController,
  type PlayerDefenseState,
} from "./usePlayerDefenseController";
import type { GameFlowEvent } from "./useTurnController";
import type { GameState } from "../game/state";
import type {
  OffensiveAbility,
  PlayerState,
  Side,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
} from "../game/types";
import type { CombatEvent } from "../game/combat/types";
import type { StatusSpendSummary } from "../engine/status";
import type { TurnEndResolution } from "../game/flow/turnEnd";
import type { Cue } from "../game/flow/cues";
type UseDefenseActionsArgs = {
  turn: Side;
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
};

export function useDefenseActions({
  turn,
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
}: UseDefenseActionsArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const pendingDefenseSpendsRef = useRef<StatusSpendSummary[]>([]);

  const resetDefenseRequests = useCallback(() => {
    pendingDefenseSpendsRef.current = [];
    clearDefenseStatusRequests();
  }, [clearDefenseStatusRequests]);
  const aiStatusReactionRef = useRef<StatusId | null>(null);

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

  const { resolveDefenseWithEvents } = useDefenseResolution({
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
  });

  const { onConfirmAttack } = useAttackExecution({
    turn,
    rolling,
    ability,
    dice,
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
  });

  return {
    onConfirmAttack,
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserStatusReaction,
  };
}
