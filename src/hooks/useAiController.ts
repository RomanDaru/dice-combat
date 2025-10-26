import { useCallback, useEffect, useRef } from "react";
import { bestAbility, rollDie } from "../game/combos";
import type { GameState } from "../game/state";
import type { Ability, PlayerState, Side } from "../game/types";
import { useGame } from "../context/GameContext";

type UseAiControllerArgs = {
  logAiNoCombo: (diceValues: number[]) => void;
  logAiAttackRoll: (diceValues: number[], ability: Ability) => void;
  animatePreviewRoll: (
    targetDice: number[],
    heldMask: boolean[],
    onDone: () => void
  ) => void;
  tickAndStart: (next: Side, afterReady?: () => void) => boolean;
  aiStepDelay: number;
  turnChiAvailable: Record<Side, number>;
  consumeTurnChi: (side: Side, amount: number) => void;
};

export function useAiController({
  logAiNoCombo,
  logAiAttackRoll,
  animatePreviewRoll,
  tickAndStart,
  aiStepDelay,
  turnChiAvailable,
  consumeTurnChi,
}: UseAiControllerArgs) {
  const { state, dispatch } = useGame();
  const stateRef = useRef<GameState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patchState = useCallback(
    (partial: Partial<GameState>) => {
      dispatch({ type: "PATCH_STATE", payload: partial });
      stateRef.current = { ...stateRef.current, ...partial };
    },
    [dispatch]
  );

  const patchAiPreview = useCallback(
    (partial: Partial<GameState["aiPreview"]>) => {
      dispatch({ type: "PATCH_AI_PREVIEW", payload: partial });
      stateRef.current = {
        ...stateRef.current,
        aiPreview: { ...stateRef.current.aiPreview, ...partial },
      };
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
      stateRef.current = { ...stateRef.current, pendingAttack: attack };
    },
    [dispatch]
  );

  const setPhase = useCallback(
    (phase: GameState["phase"]) => {
      patchState({ phase });
    },
    [patchState]
  );

  const chooseAiAttackChiSpend = useCallback(
    (attacker: PlayerState, defender: PlayerState, ability: Ability) => {
      const available = attacker.tokens.chi ?? 0;
      if (available <= 0) return 0;
      const requiredForLethal = Math.max(0, defender.hp - ability.damage);
      if (requiredForLethal <= 0) return 0;
      return Math.min(available, requiredForLethal);
    },
    []
  );

  const aiPlay = useCallback(() => {
    const curAi = stateRef.current.players.ai;
    const curYou = stateRef.current.players.you;
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
      const latestAi = stateRef.current.players.ai;
      const latestYou = stateRef.current.players.you;
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
            setPhase("end");
            window.setTimeout(() => {
              tickAndStart("you");
            }, 600);
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
            stateRef.current = {
              ...stateRef.current,
              players: { ...stateRef.current.players, ai: updatedAi },
            };
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
    tickAndStart,
    turnChiAvailable.ai,
  ]);

  return {
    aiPlay,
  };
}
