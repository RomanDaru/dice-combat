import { useCallback, type MutableRefObject } from "react";
import {
  createStatusSpendSummary,
  getStatus,
  getStacks,
  spendStatus,
} from "../engine/status";
import type {
  StatusId,
  StatusSpendApplyResult,
  StatusSpendSummary,
} from "../engine/status";
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
  consumeTurnChi: (side: Side, amount: number) => void;
  turnChiAvailable: Record<Side, number>;
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
  aiEvasiveRequestedRef: MutableRefObject<boolean>;
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
  consumeTurnChi,
  turnChiAvailable,
  openDiceTray,
  closeDiceTray,
  animateDefenseRoll,
  animateDefenseDie,
  pushLog,
  pendingDefenseSpendsRef,
  resolveDefenseWithEvents,
  aiActiveAbilities,
  performAiActiveAbility,
  aiEvasiveRequestedRef,
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
    consumeTurnChi,
    turnChiAvailableAi: turnChiAvailable.ai ?? 0,
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
      const attackStatusSpends: StatusSpendSummary[] = [];
      let workingTokens = attacker.tokens;
      let tokensChanged = false;

      Object.entries(attackStatusRequests).forEach(([rawStatusId, requested]) => {
        const statusId = rawStatusId as StatusId;
        if (requested <= 0) return;
        const statusDef = getStatus(statusId);
        const spendDef = statusDef?.spend;
        if (!spendDef || !spendDef.allowedPhases.includes("attackRoll")) {
          return;
        }
        if (baseDamage <= 0) return;
        const costStacks = spendDef.costStacks || 1;
        const availableStacks =
          statusId === "chi"
            ? Math.max(
                0,
                Math.min(
                  requested,
                  getStacks(workingTokens, "chi", 0),
                  turnChiAvailable.you ?? 0
                )
              )
            : Math.max(
                0,
                Math.min(requested, getStacks(workingTokens, statusId, 0))
              );
        const attempts = costStacks > 0 ? Math.floor(availableStacks / costStacks) : 0;
        if (attempts <= 0) return;
        let localTokens = workingTokens;
        const spendResults: StatusSpendApplyResult[] = [];
        let damageContext = baseDamage;
        for (let i = 0; i < attempts; i += 1) {
          const spendResult = spendStatus(localTokens, statusId, "attackRoll", {
            phase: "attackRoll",
            baseDamage: damageContext,
          });
          if (!spendResult) break;
          localTokens = spendResult.next;
          spendResults.push(spendResult.spend);
          if (typeof spendResult.spend.bonusDamage === "number") {
            damageContext += spendResult.spend.bonusDamage;
          }
        }
        if (spendResults.length > 0) {
          const stacksSpent = spendResults.length * costStacks;
          workingTokens = localTokens;
          tokensChanged = true;
          attackStatusSpends.push(
            createStatusSpendSummary(statusId, stacksSpent, spendResults)
          );
        }
      });

      clearAttackStatusRequests();

      if (tokensChanged) {
        attacker = {
          ...attacker,
          tokens: workingTokens,
        };
        setPlayer("you", attacker);
      }

      const attackBonusDamage = attackStatusSpends.reduce(
        (sum, spend) => sum + spend.bonusDamage,
        0
      );
      attackStatusSpends.forEach((spend) => {
        if (spend.id === "chi" && spend.stacksSpent > 0) {
          consumeTurnChi("you", spend.stacksSpent);
        }
      });
      const effectiveAbility: OffensiveAbility = {
        ...selectedAbility,
        damage: baseDamage + attackBonusDamage,
      };

      logPlayerAttackStart(attackDice, effectiveAbility, attacker.hero.name);

      const aiEvasiveAbility = aiActiveAbilities.find(
        (abilityItem) => abilityItem.id === ActiveAbilityIds.SHADOW_MONK_EVASIVE_ID
      );
      let aiShouldAttemptEvasive = false;
      if (aiEvasiveAbility) {
        aiEvasiveRequestedRef.current = false;
        const executed = performAiActiveAbility(aiEvasiveAbility.id);
        if (executed && aiEvasiveRequestedRef.current) {
          aiShouldAttemptEvasive = true;
        }
      } else if (getStacks(defender.tokens, "evasive", 0) > 0) {
        aiShouldAttemptEvasive = true;
      }

      aiEvasiveRequestedRef.current = false;

      handleAiDefenseResponse({
        attacker,
        defender,
        attackerSide: "you",
        defenderSide: "ai",
        effectiveAbility,
        baseDamage,
        attackStatusSpends,
        aiShouldAttemptEvasive,
      });
    });
  }, [
    ability,
    aiActiveAbilities,
    aiEvasiveRequestedRef,
    applyTurnEndResolution,
    attackStatusRequests,
    clearAttackStatusRequests,
    consumeTurnChi,
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
    turnChiAvailable.you,
    you.hero.name,
  ]);

  return { onConfirmAttack };
}
