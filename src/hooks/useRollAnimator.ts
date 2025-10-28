import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { rollDie } from "../game/combos";
import type { GameState } from "../game/state";

type UseRollAnimatorArgs = {
  stateRef: MutableRefObject<GameState>;
  setDice: (value: number[] | ((prev: number[]) => number[])) => void;
  setRolling: (value: boolean[]) => void;
  setRollsLeft: (value: number | ((prev: number) => number)) => void;
  durationMs?: number;
  intervalMs?: number;
};

export function useRollAnimator({
  stateRef,
  setDice,
  setRolling,
  setRollsLeft,
  durationMs = 1300,
  intervalMs = 100,
}: UseRollAnimatorArgs) {
  const timerRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const animateRoll = useCallback(
    (mask: boolean[]) => {
      if (!mask.length) return;

      stopTimer();
      setRolling(mask);
      let workingDice = [...stateRef.current.dice];
      const startedAt = Date.now();

      timerRef.current = window.setInterval(() => {
        workingDice = workingDice.map((value, index) =>
          mask[index] ? rollDie() : value
        );
        setDice([...workingDice]);

        if (Date.now() - startedAt > durationMs) {
          stopTimer();
          workingDice = workingDice.map((value, index) =>
            mask[index] ? rollDie() : value
          );
          setDice([...workingDice]);
          setRolling(mask.map(() => false));
          setRollsLeft((prev) => prev - 1);
        }
      }, intervalMs);
    },
    [durationMs, intervalMs, setDice, setRolling, setRollsLeft, stateRef, stopTimer]
  );

  return { animateRoll };
}
