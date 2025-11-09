import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { rollDie } from "../game/combos";
import type { Rng } from "../engine/rng";
import type { GameState } from "../game/state";
import { scheduleInterval } from "../utils/timers";

type UseRollAnimatorArgs = {
  stateRef: MutableRefObject<GameState>;
  setDice: (value: number[] | ((prev: number[]) => number[])) => void;
  setRolling: (value: boolean[]) => void;
  setRollsLeft: (value: number | ((prev: number) => number)) => void;
  rng: Rng;
  durationMs?: number;
  intervalMs?: number;
  onRollComplete?: (dice: number[]) => void;
};

export function useRollAnimator({
  stateRef,
  setDice,
  setRolling,
  setRollsLeft,
  rng,
  durationMs = 1300,
  intervalMs = 100,
  onRollComplete,
}: UseRollAnimatorArgs) {
  const timerRef = useRef<(() => void) | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      timerRef.current();
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

      timerRef.current = scheduleInterval(() => {
        workingDice = workingDice.map((value, index) =>
          mask[index] ? rollDie(rng) : value
        );
        setDice([...workingDice]);

        if (Date.now() - startedAt > durationMs) {
          stopTimer();
          workingDice = workingDice.map((value, index) =>
            mask[index] ? rollDie(rng) : value
          );
          const finalDice = [...workingDice];
          setDice(finalDice);
          setRolling(mask.map(() => false));
          setRollsLeft((prev) => prev - 1);
          onRollComplete?.(finalDice);
        }
      }, intervalMs);
    },
    [
      durationMs,
      intervalMs,
      rng,
      setDice,
      setRolling,
      setRollsLeft,
      stateRef,
      stopTimer,
      onRollComplete,
    ]
  );

  return { animateRoll };
}
