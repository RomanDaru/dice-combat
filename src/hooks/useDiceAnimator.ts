import { MutableRefObject, useCallback } from 'react';
import { rollDie } from '../game/combos';
import type { GameState } from '../game/state';

type DiceUpdater = number[] | ((prev: number[]) => number[]);
type HeldUpdater = boolean[] | ((prev: boolean[]) => boolean[]);
type RollsUpdater = number | ((prev: number) => number);

type UseDiceAnimatorArgs = {
  stateRef: MutableRefObject<GameState>;
  savedDiceForDefense: GameState['savedDefenseDice'];
  setSavedDiceForDefense: (dice: number[] | null) => void;
  setDice: (value: DiceUpdater) => void;
  setHeld: (value: HeldUpdater) => void;
  setRolling: (value: boolean[]) => void;
  setRollsLeft: (value: RollsUpdater) => void;
  defenseDieIndex: number;
};

export function useDiceAnimator({
  stateRef,
  savedDiceForDefense,
  setSavedDiceForDefense,
  setDice,
  setHeld,
  setRolling,
  setRollsLeft,
  defenseDieIndex,
}: UseDiceAnimatorArgs) {
  const resetRoll = useCallback(() => {
    setDice([2, 2, 3, 4, 6]);
    setHeld([false, false, false, false, false]);
    setRolling([false, false, false, false, false]);
    setRollsLeft(3);
  }, [setDice, setHeld, setRolling, setRollsLeft]);

  const animateDefenseDie = useCallback(
    (onDone: (roll: number) => void, duration = 700) => {
      if (!savedDiceForDefense) {
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
    [
      defenseDieIndex,
      savedDiceForDefense,
      setDice,
      setRolling,
      setSavedDiceForDefense,
      stateRef,
    ]
  );

  const restoreDiceAfterDefense = useCallback(() => {
    if (savedDiceForDefense) {
      const vals = savedDiceForDefense;
      window.setTimeout(() => {
        setDice(vals);
        setSavedDiceForDefense(null);
      }, 300);
    }
  }, [savedDiceForDefense, setDice, setSavedDiceForDefense]);

  return {
    resetRoll,
    animateDefenseDie,
    restoreDiceAfterDefense,
  };
}

