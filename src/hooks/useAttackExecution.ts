import { useCallback, type MutableRefObject } from "react";
import { getStatus, getStacks } from "../engine/status";
import type { StatusId, StatusSpendSummary } from "../engine/status";
import type { GameState } from "../game/state";
import type {
  ActiveAbility,
  OffensiveAbility,
  PlayerState,
  Side,
} from "../game/types";
import { ActiveAbilityIds } from "../game/activeAbilities";
import { resolvePassTurn } from "../game/flow/turnEnd";
import type { TurnEndResolution } from "../game/flow/turnEnd";
import type { DefenseResolutionHandler } from "./useDefenseResolution";
import { useAiDefenseResponse } from "./useAiDefenseResponse";
import { getPreDefenseReactionStatuses } from "./preDefenseReactions";
import { applyAttackStatusSpends } from "./statusSpends";

type UseAttackExecutionArgs = {
  turn: Side;
  rolling: boolean[];
  ability: OffensiveAbility | null;
  dice: number[];
  you: PlayerState;
  attackStatusRequests: Record<StatusId, number>;
  clearAttackStatusRequests: () => void;
  logPlayerNoCombo: (diceValues: number[], attackerName: string) => void;
  logPlayerAttackStart: (
    diceValues: number[],
    ability: OffensiveAbility,
    attackerName: string
  ) => void;
  setDefenseStatusMessage: (message: string | null) => void;
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
  setPhase: (phase: GameState["phase"]) => void;
  patchAiDefense: (partial: Partial<GameState["aiDefense"]>) => void;
  scheduleCallback: (durationMs: number, callback: () => void) => () => void;
  latestState: MutableRefObject<GameState>;
  setPlayer: (side: Side, player: PlayerState) => void;
  consumeStatusBudget: (side: Side, statusId: StatusId, amount: number) => void;
  getStatusBudget: (side: Side, statusId: StatusId) => number;
  openDiceTray: () => void;
  closeDiceTray: () => void;
  animateDefenseRoll: (
    onDone: (dice: number[]) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (dice: number[]) => void;
    }
  ) => void;
  animateDefenseDie: (
    onDone: (roll: number) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (value: number) => void;
    }
  ) => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  pendingDefenseSpendsRef: MutableRefObject<StatusSpendSummary[]>;
  resolveDefenseWithEvents: DefenseResolutionHandler;
  aiActiveAbilities: ActiveAbility[];
  performAiActiveAbility: (abilityId: string) => boolean;
  aiReactionRequestRef: MutableRefObject<StatusId | null>;
};

export function useAttackExecution({
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
  aiReactionRequestRef,
}: UseAttackExecutionArgs) {
  const { handleAiDefenseResponse } = useAiDefenseResponse({
    setDefenseStatusMessage,
    setDefenseStatusRollDisplay,
    setPhase,
    openDiceTray,
    closeDiceTray,
    animateDefenseRoll,
    animateDefenseDie,
    pushLog,
    patchAiDefense,
    consumeStatusBudget,
    getStatusBudget,
    scheduleCallback,
    pendingDefenseSpendsRef,
    resolveDefenseWithEvents,
    setPlayer,
  });

  const onConfirmAttack = useCallback(() => {
    if (turn !== "you" || rolling.some(Boolean)) return;
    const selectedAbility = ability;
    if (!selectedAbility) {
      clearAttackStatusRequests();
      logPlayerNoCombo(dice, you.hero.name);
      setDefenseStatusMessage(null);
      setDefenseStatusRollDisplay(null);
      applyTurnEndResolution(resolvePassTurn({ side: "you" }));
      return;
    }

    setPhase("attack");
    patchAiDefense({
      inProgress: true,
      defenseRoll: null,
      defenseDice: null,
      defenseCombo: null,
      evasiveRoll: null,
    });
    const attackDice = [...dice];

    scheduleCallback(60, () => {
      const snapshot = latestState.current;
      let attacker = snapshot.players.you;
      let defender = snapshot.players.ai;
      if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) {
        patchAiDefense({
          inProgress: false,
          defenseRoll: null,
          defenseDice: null,
          defenseCombo: null,
          evasiveRoll: null,
        });
        clearAttackStatusRequests();
        return;
      }

      const baseDamage = selectedAbility.damage;
      const attackSpendResult = applyAttackStatusSpends({
        requests: attackStatusRequests,
        tokens: attacker.tokens,
        baseDamage,
        getBudget: (statusId) => getStatusBudget("you", statusId),
        consumeBudget: (statusId, amount) =>
          consumeStatusBudget("you", statusId, amount),
      });
      const { statusSpends: attackStatusSpends, tokens: workingTokens } =
        attackSpendResult;
      clearAttackStatusRequests();

      if (attackStatusSpends.length > 0 && workingTokens !== attacker.tokens) {
        attacker = {
          ...attacker,
          tokens: workingTokens,
        };
        setPlayer("you", attacker);
      }

      const attackBonusDamage = attackSpendResult.bonusDamage;
      const effectiveAbility: OffensiveAbility = {
        ...selectedAbility,
        damage: baseDamage + attackBonusDamage,
      };

      logPlayerAttackStart(attackDice, effectiveAbility, attacker.hero.name);

      const aiReactionAbility = aiActiveAbilities.find(
        (abilityItem) => abilityItem.id === ActiveAbilityIds.SHADOW_MONK_EVASIVE_ID
      );
      const availableReactions = getPreDefenseReactionStatuses(defender.tokens);
      let aiReactionStatusId: StatusId | null = null;
      if (aiReactionAbility) {
        aiReactionRequestRef.current = null;
        const executed = performAiActiveAbility(aiReactionAbility.id);
        if (executed) {
          aiReactionStatusId = aiReactionRequestRef.current;
        }
      }
      if (
        aiReactionStatusId &&
        getStacks(defender.tokens, aiReactionStatusId, 0) <= 0
      ) {
        aiReactionStatusId = null;
      }
      if (!aiReactionStatusId && availableReactions.length > 0) {
        aiReactionStatusId = availableReactions[0] ?? null;
      }
      aiReactionRequestRef.current = null;

      handleAiDefenseResponse({
        attacker,
        defender,
        attackerSide: "you",
        defenderSide: "ai",
        effectiveAbility,
        baseDamage,
        attackStatusSpends,
        reactionStatusId: aiReactionStatusId,
      });
    });
  }, [
    ability,
    aiActiveAbilities,
    applyTurnEndResolution,
    attackStatusRequests,
    clearAttackStatusRequests,
    consumeStatusBudget,
    dice,
    handleAiDefenseResponse,
    latestState,
    logPlayerAttackStart,
    logPlayerNoCombo,
    patchAiDefense,
    performAiActiveAbility,
    rolling,
    scheduleCallback,
    setDefenseStatusMessage,
    setDefenseStatusRollDisplay,
    setPhase,
    setPlayer,
    turn,
    getStatusBudget,
    you.hero.name,
  ]);

  return { onConfirmAttack };
}
