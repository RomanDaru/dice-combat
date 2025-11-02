import { useCallback } from "react";
import { rollDie } from "../game/combos";
import { useGame } from "../context/GameContext";
import { useLatest } from "./useLatest";
import type { Rng } from "../engine/rng";

type DiceUpdater = number[] | ((prev: number[]) => number[]);
type HeldUpdater = boolean[] | ((prev: boolean[]) => boolean[]);
type RollsUpdater = number | ((prev: number) => number);

type AnimateDefenseRollOptions = {
  animateSharedDice?: boolean;
  onTick?: (dice: number[]) => void;
};

type AnimateDefenseDieOptions = {
  animateSharedDice?: boolean;
  onTick?: (value: number) => void;
};

type UseDiceAnimatorArgs = {
  defenseDieIndex: number;
  rng: Rng;
};

export function useDiceAnimator({
  defenseDieIndex,
  rng,
}: UseDiceAnimatorArgs) {
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
    (
      onDone: (roll: number) => void,
      duration = 700,
      options: AnimateDefenseDieOptions = {}
    ) => {
      const { animateSharedDice = true, onTick } = options;
      if (animateSharedDice && !latestState.current.savedDefenseDice) {
        setSavedDiceForDefense([...latestState.current.dice]);
      }
      if (animateSharedDice) {
        const mask = [false, false, false, false, false];
        mask[defenseDieIndex] = true;
        setRolling(mask);
      }
      const start = Date.now();
      let workingDice = animateSharedDice
        ? [...latestState.current.dice]
        : null;
      let workingValue = animateSharedDice && workingDice
        ? workingDice[defenseDieIndex]
        : 1 + Math.floor(Math.random() * 6);
      const timer = window.setInterval(() => {
        workingValue = 1 + Math.floor(Math.random() * 6);
        if (animateSharedDice && workingDice) {
          workingDice = workingDice.map((value, index) =>
            index === defenseDieIndex ? workingValue : value
          );
          setDice([...workingDice]);
        }
        if (onTick) {
          onTick(workingValue);
        }
        if (Date.now() - start > duration) {
          window.clearInterval(timer);
          const result = rollDie(rng);
          if (animateSharedDice && workingDice) {
            workingDice = workingDice.map((value, index) =>
              index === defenseDieIndex ? result : value
            );
            setDice([...workingDice]);
            setRolling([false, false, false, false, false]);
          }
          if (onTick) {
            onTick(result);
          }
          window.setTimeout(() => onDone(result), 50);
        }
      }, 90);
    },
    [
      defenseDieIndex,
      latestState,
      rng,
      setDice,
      setRolling,
      setSavedDiceForDefense,
    ]
  );

  const animateDefenseRoll = useCallback(
    (
      onDone: (dice: number[]) => void,
      duration = 700,
      options: AnimateDefenseRollOptions = {}
    ) => {
      const { animateSharedDice = true, onTick } = options;
      if (animateSharedDice && !latestState.current.savedDefenseDice) {
        setSavedDiceForDefense([...latestState.current.dice]);
      }
      if (animateSharedDice) {
        const mask = [true, true, true, true, true];
        setRolling(mask);
      }
      let workingDice = animateSharedDice
        ? [...latestState.current.dice]
        : Array.from({ length: 5 }, () => rollDie(rng));
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        workingDice = workingDice.map(() => rollDie(rng));
        if (animateSharedDice) {
          setDice([...workingDice]);
        }
        if (onTick) {
          onTick([...workingDice]);
        }
        if (Date.now() - startedAt > duration) {
          window.clearInterval(timer);
          const result = Array.from({ length: 5 }, () => rollDie(rng));
          if (animateSharedDice) {
            setDice(result);
            setRolling([false, false, false, false, false]);
          }
          if (onTick) {
            onTick([...result]);
          }
          window.setTimeout(() => onDone(result), 50);
        }
      }, 90);
    },
    [latestState, rng, setDice, setRolling, setSavedDiceForDefense]
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
    animateDefenseRoll,
    restoreDiceAfterDefense,
  };
}
