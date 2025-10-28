import { useCallback } from "react";
import { rollDie } from "../game/combos";
import { useGame } from "../context/GameContext";
import { useLatest } from "./useLatest";

type DiceUpdater = number[] | ((prev: number[]) => number[]);
type HeldUpdater = boolean[] | ((prev: boolean[]) => boolean[]);
type RollsUpdater = number | ((prev: number) => number);

type UseDiceAnimatorArgs = {
  defenseDieIndex: number;
};

export function useDiceAnimator({ defenseDieIndex }: UseDiceAnimatorArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);

  const setDice = useCallback(
    (value: DiceUpdater) => {
      const prev = latestState.current.dice;
      const next =
        typeof value === "function"
          ? (value as (prev: number[]) => number[])(prev)
          : value;
      dispatch({ type: "SET_DICE", dice: next });
    },
    [dispatch, latestState]
  );

  const setHeld = useCallback(
    (value: HeldUpdater) => {
      const prev = latestState.current.held;
      const next =
        typeof value === "function"
          ? (value as (prev: boolean[]) => boolean[])(prev)
          : value;
      dispatch({ type: "SET_HELD", held: next });
    },
    [dispatch, latestState]
  );

  const setRolling = useCallback(
    (next: boolean[]) => {
      dispatch({ type: "SET_ROLLING", rolling: next });
    },
    [dispatch]
  );

  const setRollsLeft = useCallback(
    (value: RollsUpdater) => {
      const prev = latestState.current.rollsLeft;
      const next =
        typeof value === "function"
          ? (value as (prev: number) => number)(prev)
          : value;
      dispatch({ type: "SET_ROLLS_LEFT", rollsLeft: next });
    },
    [dispatch, latestState]
  );

  const setSavedDiceForDefense = useCallback(
    (dice: number[] | null) => {
      dispatch({ type: "SET_SAVED_DEFENSE_DICE", dice });
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
      if (!latestState.current.savedDefenseDice) {
        setSavedDiceForDefense([...latestState.current.dice]);
      }
      const mask = [false, false, false, false, false];
      mask[defenseDieIndex] = true;
      setRolling(mask);
      const start = Date.now();
      let workingDice = [...latestState.current.dice];
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
    [defenseDieIndex, latestState, setDice, setRolling, setSavedDiceForDefense]
  );

  const restoreDiceAfterDefense = useCallback(() => {
    const savedDice = latestState.current.savedDefenseDice;
    if (savedDice) {
      window.setTimeout(() => {
        setDice(savedDice);
        setSavedDiceForDefense(null);
      }, 300);
    }
  }, [latestState, setDice, setSavedDiceForDefense]);

  return {
    resetRoll,
    animateDefenseDie,
    restoreDiceAfterDefense,
  };
}
