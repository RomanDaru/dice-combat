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

  const animatePreviewRoll = useCallback(
    (
      targetDice: number[],
      heldMask: boolean[],
      onDone: () => void,
      duration = rollDurationMs
    ) => {
      dispatch({ type: "SET_AI_PREVIEW_ROLLING", rolling: true });
      const rerollMask = heldMask.map((held) => !held);
      let previewDice = [...stateRef.current.aiPreview.dice];
      const interval = window.setInterval(() => {
        previewDice = previewDice.map((value, index) =>
          rerollMask[index] ? rollDie() : value
        );
        dispatch({ type: "SET_AI_PREVIEW_DICE", dice: [...previewDice] });
      }, tickIntervalMs);

      window.setTimeout(() => {
        window.clearInterval(interval);
        dispatch({ type: "SET_AI_PREVIEW_ROLLING", rolling: false });
        dispatch({ type: "SET_AI_PREVIEW_DICE", dice: [...targetDice] });
        onDone();
      }, duration);
    },
    [dispatch, rollDurationMs, tickIntervalMs]
  );

  return {
    animatePreviewRoll,
  };
}
