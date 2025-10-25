import { useCallback, useEffect, useRef } from "react";
import { rollDie } from "../game/combos";
import type { GameState } from "../game/state";
import { useGame } from "../context/GameContext";

type UseAiDiceAnimatorArgs = {
  rollDurationMs?: number;
  tickIntervalMs?: number;
};

const DEFAULT_ROLL_DURATION = 900;
const DEFAULT_TICK_INTERVAL = 90;

export function useAiDiceAnimator({
  rollDurationMs = DEFAULT_ROLL_DURATION,
  tickIntervalMs = DEFAULT_TICK_INTERVAL,
}: UseAiDiceAnimatorArgs = {}) {
  const { state, dispatch } = useGame();
  const stateRef = useRef<GameState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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

  const animatePreviewRoll = useCallback(
    (
      targetDice: number[],
      heldMask: boolean[],
      onDone: () => void,
      duration = rollDurationMs
    ) => {
      patchAiPreview({ rolling: true });
      const rerollMask = heldMask.map((held) => !held);
      let previewDice = [...stateRef.current.aiPreview.dice];
      const interval = window.setInterval(() => {
        previewDice = previewDice.map((value, index) =>
          rerollMask[index] ? rollDie() : value
        );
        patchAiPreview({ dice: [...previewDice] });
      }, tickIntervalMs);

      window.setTimeout(() => {
        window.clearInterval(interval);
        patchAiPreview({ rolling: false, dice: [...targetDice] });
        onDone();
      }, duration);
    },
    [patchAiPreview, rollDurationMs, tickIntervalMs]
  );

  return {
    animatePreviewRoll,
  };
}
