import { useCallback } from "react";
import { useEffect, useRef } from "react";
import { bestAbility, rollDie } from "../game/combos";
import type { GameState } from "../game/state";
import type { OffensiveAbility, PlayerState, Side } from "../game/types";
import { useGame } from "../context/GameContext";
import { useLatest } from "./useLatest";
import type { GameFlowEvent } from "./useTurnController";
import type { Rng } from "../engine/rng";
import { getStatus, type StatusId } from "../engine/status";
import { applyAttackStatusSpends, type StatusSpendRequests } from "./statusSpends";

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

const getAttackBonusPerStack = (statusId: StatusId) => {
  const def = getStatus(statusId);
  if (!def || def.behaviorId !== "bonus_pool") return null;
  const config = def.behaviorConfig as
    | {
        attack?: {
          bonusDamagePerStack?: number;
        };
      }
    | undefined;
  const bonus = config?.attack?.bonusDamagePerStack;
  return typeof bonus === "number" && bonus > 0 ? bonus : null;
};

const buildAiAttackRequests = (
  attacker: PlayerState,
  defender: PlayerState,
  ability: OffensiveAbility,
  getBudget: (statusId: StatusId) => number
): StatusSpendRequests => {
  const requests: StatusSpendRequests = {};
  const additionalNeeded = Math.max(0, defender.hp - ability.damage);
  if (additionalNeeded <= 0) return requests;
  Object.entries(attacker.tokens).forEach(([rawId, stacks]) => {
    if (stacks <= 0) return;
    const statusId = rawId as StatusId;
    const bonusPerStack = getAttackBonusPerStack(statusId);
    if (!bonusPerStack) return;
    const def = getStatus(statusId);
    const spendDef = def?.spend;
    if (!spendDef?.allowedPhases.includes("attackRoll")) return;
    const budget = spendDef.turnLimited
      ? Math.min(stacks, getBudget(statusId))
      : stacks;
    if (budget <= 0) return;
    const stacksNeeded = Math.ceil(additionalNeeded / bonusPerStack);
    requests[statusId] = Math.min(stacksNeeded, budget);
  });
  return requests;
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
        let effectiveAbility = ab;
        const attackRequests = buildAiAttackRequests(
          latestAi,
          latestYou,
          ab,
          (statusId) => getStatusBudget("ai", statusId)
        );
        const attackSpendResult = applyAttackStatusSpends({
          requests: attackRequests,
          tokens: latestAi.tokens,
          baseDamage,
          getBudget: (statusId) => getStatusBudget("ai", statusId),
          consumeBudget: (statusId, amount) =>
            consumeStatusBudget("ai", statusId, amount),
        });
        const attackStatusSpends = attackSpendResult.statusSpends;
        if (attackStatusSpends.length > 0) {
          const updatedAi = {
            ...latestAi,
            tokens: attackSpendResult.tokens,
          };
          dispatch({ type: "SET_PLAYER", side: "ai", player: updatedAi });
          effectiveAbility = {
            ...ab,
            damage: baseDamage + attackSpendResult.bonusDamage,
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

