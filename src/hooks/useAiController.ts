import { useCallback } from "react";
import { useEffect, useRef } from "react";
import { bestAbility, rollDie } from "../game/combos";
import type { GameState } from "../game/state";
import type { OffensiveAbility, PlayerState, Side } from "../game/types";
import { useGame } from "../context/GameContext";
import { useLatest } from "./useLatest";
import type { GameFlowEvent } from "./useTurnController";
import type { Rng } from "../engine/rng";
import {
  createStatusSpendSummary,
  getStatus,
  getStacks,
  spendStatus,
  type StatusId,
} from "../engine/status";
import type {
  StatusSpendApplyResult,
  StatusSpendSummary,
} from "../engine/status";

type UseAiControllerArgs = {
  logAiNoCombo: (diceValues: number[]) => void;
  logAiAttackRoll: (diceValues: number[], ability: OffensiveAbility) => void;
  animatePreviewRoll: (
    targetDice: number[],
    heldMask: boolean[],
    onDone: () => void
  ) => void;
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  aiStepDelay: number;
  scheduleDelay: (duration: number, callback: () => void) => () => void;
  getStatusBudget: (side: Side, statusId: StatusId) => number;
  consumeStatusBudget: (side: Side, statusId: StatusId, amount: number) => void;
  onAiNoCombo: () => void;
  rng: Rng;
};

export function useAiController({
  logAiNoCombo,
  logAiAttackRoll,
  animatePreviewRoll,
  sendFlowEvent,
  aiStepDelay,
  scheduleDelay,
  getStatusBudget,
  consumeStatusBudget,
  onAiNoCombo,
  rng,
}: UseAiControllerArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const stepTimerRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stepTimerRef.current?.();
      stepTimerRef.current = null;
    },
    []
  );

  const patchAiPreview = useCallback(
    (partial: Partial<GameState["aiPreview"]>) => {
      dispatch({ type: "PATCH_AI_PREVIEW", payload: partial });
    },
    [dispatch]
  );

  const setAiSimActive = useCallback(
    (value: boolean) => {
      patchAiPreview({ active: value });
    },
    [patchAiPreview]
  );

  const setAiSimRolling = useCallback(
    (value: boolean) => {
      patchAiPreview({ rolling: value });
    },
    [patchAiPreview]
  );

  const setAiSimHeld = useCallback(
    (value: boolean[]) => {
      patchAiPreview({ held: value });
    },
    [patchAiPreview]
  );

  const setPendingAttack = useCallback(
    (attack: GameState["pendingAttack"]) => {
      dispatch({ type: "SET_PENDING_ATTACK", attack });
    },
    [dispatch]
  );

  const setPhase = useCallback(
    (phase: GameState["phase"]) => {
      sendFlowEvent({ type: "SET_PHASE", phase });
    },
    [sendFlowEvent]
  );

  const chooseAiAttackChiSpend = useCallback(
    (attacker: PlayerState, defender: PlayerState, ability: OffensiveAbility) => {
      const available = getStacks(attacker.tokens, "chi", 0);
      if (available <= 0) return 0;
      const requiredForLethal = Math.max(0, defender.hp - ability.damage);
      if (requiredForLethal <= 0) return 0;
      return Math.min(available, requiredForLethal);
    },
    []
  );

  const aiPlay = useCallback(() => {
    const snapshot = latestState.current;
    const curAi = snapshot.players.ai;
    const curYou = snapshot.players.you;
    if (!curAi || !curYou || curAi.hp <= 0 || curYou.hp <= 0) {
      stepTimerRef.current?.();
      stepTimerRef.current = null;
      setAiSimActive(false);
      setAiSimRolling(false);
      setPendingAttack(null);
      return;
    }
    stepTimerRef.current?.();
    stepTimerRef.current = null;
    setAiSimActive(true);
    setAiSimRolling(false);

    let localDice = Array.from({ length: 5 }, () => rollDie(rng));
    let localHeld = [false, false, false, false, false];

    const doStep = (step: number) => {
      const stateNow = latestState.current;
      const latestAi = stateNow.players.ai;
      const latestYou = stateNow.players.you;
      if (!latestAi || !latestYou || latestAi.hp <= 0 || latestYou.hp <= 0) {
        stepTimerRef.current?.();
        stepTimerRef.current = null;
        setAiSimActive(false);
        setAiSimRolling(false);
        setPendingAttack(null);
        return;
      }

      for (let i = 0; i < 5; i += 1) {
        if (!localHeld[i]) localDice[i] = rollDie(rng);
      }

      const finalDice = [...localDice];
      const heldMask = [...localHeld];
      setAiSimHeld(heldMask);

      animatePreviewRoll(finalDice, heldMask, () => {
        const rollsRemaining = Math.max(0, 2 - step);
        const holdDecision =
          latestAi.hero.ai.chooseHeld({
            dice: finalDice,
            rollsRemaining,
            tokens: latestAi.tokens,
            hero: latestAi.hero,
          }) ?? [];
        for (let i = 0; i < 5; i += 1) {
          localHeld[i] = Boolean(holdDecision[i]);
        }

        if (step < 2) {
          stepTimerRef.current?.();
          stepTimerRef.current = scheduleDelay(aiStepDelay, () => doStep(step + 1));
          return;
        }

        const ab = bestAbility(latestAi.hero, finalDice);
        if (!ab) {
          setAiSimActive(false);
          logAiNoCombo(finalDice);
          onAiNoCombo();
          return;
        }

        const baseDamage = ab.damage;
        let desiredChiSpend = 0;
        if (latestAi.hero.id === "Shadow Monk") {
          const desired = chooseAiAttackChiSpend(latestAi, latestYou, ab);
          desiredChiSpend = Math.min(
            desired,
            getStatusBudget("ai", "chi"),
            getStacks(latestAi.tokens, "chi", 0)
          );
        }
        let effectiveAbility = ab;
        const attackStatusSpends: StatusSpendSummary[] = [];
        let workingTokens = latestAi.tokens;
        if (baseDamage > 0 && desiredChiSpend > 0) {
          const chiDef = getStatus("chi");
          const chiCost = chiDef?.spend?.costStacks ?? 1;
          const maxAttempts =
            chiDef?.spend && chiCost > 0
              ? Math.floor(desiredChiSpend / chiCost)
              : 0;
          if (chiDef?.spend && maxAttempts > 0) {
            const spendResults: StatusSpendApplyResult[] = [];
            let runningBonus = 0;
            for (let i = 0; i < maxAttempts; i += 1) {
              const spendResult = spendStatus(
                workingTokens,
                "chi",
                "attackRoll",
                {
                  phase: "attackRoll",
                  baseDamage: baseDamage + runningBonus,
                }
              );
              if (!spendResult) break;
              workingTokens = spendResult.next;
              spendResults.push(spendResult.spend);
              runningBonus += spendResult.spend.bonusDamage ?? 0;
            }
            if (spendResults.length > 0) {
              const totalStacks = spendResults.length * chiCost;
              attackStatusSpends.push(
                createStatusSpendSummary("chi", totalStacks, spendResults)
              );
            }
          }
        }
        if (attackStatusSpends.length > 0) {
          const updatedAi = {
            ...latestAi,
            tokens: workingTokens,
          };
          dispatch({ type: "SET_PLAYER", side: "ai", player: updatedAi });
          attackStatusSpends.forEach((spend) => {
            if (spend.stacksSpent <= 0) return;
            if (getStatus(spend.id)?.spend?.turnLimited) {
              consumeStatusBudget("ai", spend.id, spend.stacksSpent);
            }
          });
          const bonusDamage = attackStatusSpends.reduce(
            (sum, spend) => sum + spend.bonusDamage,
            0
          );
          effectiveAbility = {
            ...ab,
            damage: baseDamage + bonusDamage,
          };
        }
        setPendingAttack({
          attacker: "ai",
          defender: "you",
          dice: [...finalDice],
          ability: effectiveAbility,
          baseDamage,
          modifiers:
            attackStatusSpends.length
              ? {
                  statusSpends: attackStatusSpends,
                }
              : undefined,
        });
        setPhase("defense");
        logAiAttackRoll(finalDice, effectiveAbility);
      });
    };

    doStep(0);
  }, [
    aiStepDelay,
    animatePreviewRoll,
    chooseAiAttackChiSpend,
    consumeStatusBudget,
    logAiAttackRoll,
    logAiNoCombo,
    rng,
    scheduleDelay,
    setAiSimActive,
    setAiSimHeld,
    setAiSimRolling,
    setPendingAttack,
    setPhase,
    sendFlowEvent,
    getStatusBudget,
    dispatch,
  ]);

  return {
    aiPlay,
  };
}

