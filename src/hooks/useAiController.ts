import { useCallback } from "react";
import { bestAbility, rollDie } from "../game/combos";
import type { GameState } from "../game/state";
import type { OffensiveAbility, PlayerState, Side } from "../game/types";
import { useGame } from "../context/GameContext";
import { useLatest } from "./useLatest";
import type { GameFlowEvent } from "./useTurnController";

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
  turnChiAvailable: Record<Side, number>;
  consumeTurnChi: (side: Side, amount: number) => void;
};

export function useAiController({
  logAiNoCombo,
  logAiAttackRoll,
  animatePreviewRoll,
  sendFlowEvent,
  aiStepDelay,
  turnChiAvailable,
  consumeTurnChi,
}: UseAiControllerArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);

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
      const available = attacker.tokens.chi ?? 0;
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
      setAiSimActive(false);
      setAiSimRolling(false);
      setPendingAttack(null);
      return;
    }
    setAiSimActive(true);
    setAiSimRolling(false);

    let localDice = Array.from({ length: 5 }, () => rollDie());
    let localHeld = [false, false, false, false, false];

    const doStep = (step: number) => {
      const stateNow = latestState.current;
      const latestAi = stateNow.players.ai;
      const latestYou = stateNow.players.you;
      if (!latestAi || !latestYou || latestAi.hp <= 0 || latestYou.hp <= 0) {
        setAiSimActive(false);
        setAiSimRolling(false);
        setPendingAttack(null);
        return;
      }

      for (let i = 0; i < 5; i += 1) {
        if (!localHeld[i]) localDice[i] = rollDie();
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
          window.setTimeout(() => doStep(step + 1), aiStepDelay);
        } else {
          const ab = bestAbility(latestAi.hero, finalDice);
          if (!ab) {
            setAiSimActive(false);
            logAiNoCombo(finalDice);
            sendFlowEvent({
              type: "TURN_END",
              next: "you",
              delayMs: 600,
              prePhase: "end",
            });
            return;
          }
          let chiAttackSpend = 0;
          if (latestAi.hero.id === "Shadow Monk") {
            const desired = chooseAiAttackChiSpend(latestAi, latestYou, ab);
            chiAttackSpend = Math.min(
              desired,
              turnChiAvailable.ai ?? 0,
              latestAi.tokens.chi ?? 0
            );
          }
          let effectiveAbility = ab;
          if (chiAttackSpend > 0) {
            const updatedAi = {
              ...latestAi,
              tokens: {
                ...latestAi.tokens,
                chi: Math.max(
                  0,
                  (latestAi.tokens.chi ?? 0) - chiAttackSpend
                ),
              },
            };
            dispatch({ type: "SET_PLAYER", side: "ai", player: updatedAi });
            consumeTurnChi("ai", chiAttackSpend);
            effectiveAbility = {
              ...ab,
              damage: ab.damage + chiAttackSpend,
            };
          }
          setPendingAttack({
            attacker: "ai",
            defender: "you",
            dice: [...finalDice],
            ability: effectiveAbility,
            modifiers:
              chiAttackSpend > 0
                ? {
                    chiAttackSpend,
                  }
                : undefined,
          });
          setPhase("defense");
          logAiAttackRoll(finalDice, effectiveAbility);
        }
      });
    };

    doStep(0);
  }, [
    aiStepDelay,
    animatePreviewRoll,
    chooseAiAttackChiSpend,
    consumeTurnChi,
    logAiAttackRoll,
    logAiNoCombo,
    setAiSimActive,
    setAiSimHeld,
    setAiSimRolling,
    setPendingAttack,
    setPhase,
    sendFlowEvent,
    turnChiAvailable.ai,
  ]);

  return {
    aiPlay,
  };
}


