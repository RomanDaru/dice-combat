import { MutableRefObject, useCallback } from 'react';
import { rollDie } from '../game/combos';
import type { GameState } from '../game/state';

type UseAiDiceAnimatorArgs = {
  stateRef: MutableRefObject<GameState>;
  setAiSimDice: (value: number[] | ((prev: number[]) => number[])) => void;
  setAiSimRolling: (value: boolean) => void;
  rollDurationMs?: number;
  tickIntervalMs?: number;
};

const DEFAULT_ROLL_DURATION = 900;
const DEFAULT_TICK_INTERVAL = 90;

export function useAiDiceAnimator({
  stateRef,
  setAiSimDice,
  setAiSimRolling,
  rollDurationMs = DEFAULT_ROLL_DURATION,
  tickIntervalMs = DEFAULT_TICK_INTERVAL,
}: UseAiDiceAnimatorArgs) {
  const animatePreviewRoll = useCallback(
    (
      targetDice: number[],
      heldMask: boolean[],
      onDone: () => void,
      duration = rollDurationMs
    ) => {
      setAiSimRolling(true);
      const rerollMask = heldMask.map((held) => !held);
      let previewDice = [...stateRef.current.aiPreview.dice];
      const interval = window.setInterval(() => {
        previewDice = previewDice.map((value, index) =>
          rerollMask[index] ? rollDie() : value
        );
        setAiSimDice([...previewDice]);
      }, tickIntervalMs);

      window.setTimeout(() => {
        window.clearInterval(interval);
        setAiSimRolling(false);
        setAiSimDice([...targetDice]);
        onDone();
      }, duration);
    },
    [rollDurationMs, setAiSimDice, setAiSimRolling, stateRef, tickIntervalMs]
  );

  return {
    animatePreviewRoll,
  };
}

