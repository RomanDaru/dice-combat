import { useCallback, useEffect, useRef } from "react";
import { rollDie } from "../game/combos";
import type { GameState } from "../game/state";
import { useGame } from "../context/GameContext";

type DiceUpdater = number[] | ((prev: number[]) => number[]);
type HeldUpdater = boolean[] | ((prev: boolean[]) => boolean[]);
type RollsUpdater = number | ((prev: number) => number);

type UseDiceAnimatorArgs = {
  defenseDieIndex: number;
};

export function useDiceAnimator({ defenseDieIndex }: UseDiceAnimatorArgs) {
  const { state, dispatch } = useGame();
  const stateRef = useRef<GameState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setDice = useCallback(
    (value: DiceUpdater) => {
      const next =
        typeof value === "function"
          ? (value as (prev: number[]) => number[])(stateRef.current.dice)
          : value;
      dispatch({ type: "PATCH_STATE", payload: { dice: next } });
      stateRef.current = { ...stateRef.current, dice: next };
    },
    [dispatch]
  );

  const setHeld = useCallback(
    (value: HeldUpdater) => {
      const next =
        typeof value === "function"
          ? (value as (prev: boolean[]) => boolean[])(stateRef.current.held)
          : value;
      dispatch({ type: "PATCH_STATE", payload: { held: next } });
      stateRef.current = { ...stateRef.current, held: next };
    },
    [dispatch]
  );

  const setRolling = useCallback(
    (next: boolean[]) => {
      dispatch({ type: "PATCH_STATE", payload: { rolling: next } });
      stateRef.current = { ...stateRef.current, rolling: next };
    },
    [dispatch]
  );

  const setRollsLeft = useCallback(
    (value: RollsUpdater) => {
      const next =
        typeof value === "function"
          ? (value as (prev: number) => number)(stateRef.current.rollsLeft)
          : value;
      dispatch({ type: "PATCH_STATE", payload: { rollsLeft: next } });
      stateRef.current = { ...stateRef.current, rollsLeft: next };
    },
    [dispatch]
  );

  const setSavedDiceForDefense = useCallback(
    (dice: number[] | null) => {
      dispatch({ type: "SET_SAVED_DEFENSE_DICE", dice });
      stateRef.current = { ...stateRef.current, savedDefenseDice: dice };
    },
    [dispatch]
  );

  const resetRoll = useCallback(() => {
    setDice([2, 2, 3, 4, 6]);
    setHeld([false, false, false, false, false]);
    setRolling([false, false, false, false, false]);
    setRollsLeft(3);
  }, [setDice, setHeld, setRolling, setRollsLeft]);

  const animateDefenseDie = useCallback(
    (onDone: (roll: number) => void, duration = 700) => {
      if (!stateRef.current.savedDefenseDice) {
        setSavedDiceForDefense([...stateRef.current.dice]);
      }
      const mask = [false, false, false, false, false];
      mask[defenseDieIndex] = true;
      setRolling(mask);
      const start = Date.now();
      let workingDice = [...stateRef.current.dice];
      const timer = window.setInterval(() => {
        workingDice = workingDice.map((value, index) =>
          index === defenseDieIndex ? 1 + Math.floor(Math.random() * 6) : value
        );
        setDice([...workingDice]);
        if (Date.now() - start > duration) {
          window.clearInterval(timer);
          const result = rollDie();
          workingDice = workingDice.map((value, index) =>
            index === defenseDieIndex ? result : value
          );
          setDice([...workingDice]);
          setRolling([false, false, false, false, false]);
          window.setTimeout(() => onDone(result), 50);
        }
      }, 90);
    },
    [defenseDieIndex, setDice, setRolling, setSavedDiceForDefense]
  );

  const restoreDiceAfterDefense = useCallback(() => {
    const savedDice = stateRef.current.savedDefenseDice;
    if (savedDice) {
      window.setTimeout(() => {
        setDice(savedDice);
        setSavedDiceForDefense(null);
      }, 300);
    }
  }, [setDice, setSavedDiceForDefense]);

  return {
    resetRoll,
    animateDefenseDie,
    restoreDiceAfterDefense,
  };
}
