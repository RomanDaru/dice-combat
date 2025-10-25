import { MutableRefObject, useCallback } from 'react';
import type { GameDispatch, GameState, AiPreviewState, AiDefenseState, PendingStatusClear } from '../game/state';
import type { Phase, PlayerState, Side } from '../game/types';

type DiceUpdater = number[] | ((prev: number[]) => number[]);
type HeldUpdater = boolean[] | ((prev: boolean[]) => boolean[]);
type RollsUpdater = number | ((prev: number) => number);

export function useGameActions(
  dispatch: GameDispatch,
  stateRef: MutableRefObject<GameState>
) {
  const patchState = useCallback(
    (partial: Partial<GameState>) => {
      dispatch({ type: 'PATCH_STATE', payload: partial });
    },
    [dispatch]
  );

  const patchAiPreview = useCallback(
    (partial: Partial<AiPreviewState>) => {
      dispatch({ type: 'PATCH_AI_PREVIEW', payload: partial });
    },
    [dispatch]
  );

  const patchAiDefense = useCallback(
    (partial: Partial<AiDefenseState>) => {
      dispatch({ type: 'PATCH_AI_DEFENSE', payload: partial });
    },
    [dispatch]
  );

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({ type: 'SET_PLAYER', side, player });
    },
    [dispatch]
  );

  const setYou = useCallback(
    (player: PlayerState) => setPlayer('you', player),
    [setPlayer]
  );

  const setAi = useCallback(
    (player: PlayerState) => setPlayer('ai', player),
    [setPlayer]
  );

  const setPendingStatusClear = useCallback(
    (status: PendingStatusClear) => {
      dispatch({ type: 'SET_PENDING_STATUS', status });
    },
    [dispatch]
  );

  const setPendingAttack = useCallback(
    (attack: GameState['pendingAttack']) => {
      dispatch({ type: 'SET_PENDING_ATTACK', attack });
    },
    [dispatch]
  );

  const setSavedDiceForDefense = useCallback(
    (saved: number[] | null) => {
      dispatch({ type: 'SET_SAVED_DEFENSE_DICE', dice: saved });
    },
    [dispatch]
  );

  const setTurn = useCallback(
    (next: Side) => {
      patchState({ turn: next });
    },
    [patchState]
  );

  const setPhase = useCallback(
    (next: Phase) => {
      patchState({ phase: next });
    },
    [patchState]
  );

  const setRound = useCallback(
    (next: number) => {
      patchState({ round: next });
    },
    [patchState]
  );

  const setDice = useCallback(
    (value: DiceUpdater) => {
      const next =
        typeof value === 'function'
          ? (value as (prev: number[]) => number[])(stateRef.current.dice)
          : value;
      patchState({ dice: next });
    },
    [patchState, stateRef]
  );

  const setHeld = useCallback(
    (value: HeldUpdater) => {
      const next =
        typeof value === 'function'
          ? (value as (prev: boolean[]) => boolean[])(stateRef.current.held)
          : value;
      patchState({ held: next });
    },
    [patchState, stateRef]
  );

  const setRolling = useCallback(
    (next: boolean[]) => {
      patchState({ rolling: next });
    },
    [patchState]
  );

  const setRollsLeft = useCallback(
    (value: RollsUpdater) => {
      const next =
        typeof value === 'function'
          ? (value as (prev: number) => number)(stateRef.current.rollsLeft)
          : value;
      patchState({ rollsLeft: next });
    },
    [patchState, stateRef]
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

  const setAiSimDice = useCallback(
    (value: DiceUpdater) => {
      const next =
        typeof value === 'function'
          ? (value as (prev: number[]) => number[])(stateRef.current.aiPreview.dice)
          : value;
      patchAiPreview({ dice: next });
    },
    [patchAiPreview, stateRef]
  );

  const setAiSimHeld = useCallback(
    (value: boolean[]) => {
      patchAiPreview({ held: value });
    },
    [patchAiPreview]
  );

  const setAiDefenseSim = useCallback(
    (value: boolean) => {
      patchAiDefense({ inProgress: value });
    },
    [patchAiDefense]
  );

  const setAiDefenseRoll = useCallback(
    (value: number | null) => {
      patchAiDefense({ defenseRoll: value });
    },
    [patchAiDefense]
  );

  const setAiEvasiveRoll = useCallback(
    (value: number | null) => {
      patchAiDefense({ evasiveRoll: value });
    },
    [patchAiDefense]
  );

  const setFloatDamage = useCallback(
    (
      side: Side,
      value: GameState['fx']['floatDamage'][Side]
    ) => {
      dispatch({ type: 'SET_FLOAT_DAMAGE', side, value });
    },
    [dispatch]
  );

  const setShake = useCallback(
    (side: Side, value: boolean) => {
      dispatch({ type: 'SET_SHAKE', side, value });
    },
    [dispatch]
  );

  return {
    patchState,
    patchAiPreview,
    patchAiDefense,
    setPlayer,
    setYou,
    setAi,
    setPendingStatusClear,
    setPendingAttack,
    setSavedDiceForDefense,
    setTurn,
    setPhase,
    setRound,
    setDice,
    setHeld,
    setRolling,
    setRollsLeft,
    setAiSimActive,
    setAiSimRolling,
    setAiSimDice,
    setAiSimHeld,
    setAiDefenseSim,
    setAiDefenseRoll,
    setAiEvasiveRoll,
    setFloatDamage,
    setShake,
  };
}

