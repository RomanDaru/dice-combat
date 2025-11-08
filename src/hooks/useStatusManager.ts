import { useCallback } from "react";
import { useEffect, useRef } from "react";
import { getStatus, setStacks, getStacks } from "../engine/status";
import type { PendingStatusClear } from "../game/state";
import type { Side, PlayerState, Phase } from "../game/types";
import { indentLog } from "./useCombatLog";
import { useGame } from "../context/GameContext";
import type { GameFlowEvent } from "./useTurnController";
import { useLatest } from "./useLatest";

type UseStatusManagerArgs = {
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  animateDefenseDie: (
    onDone: (roll: number) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (value: number) => void;
    }
  ) => void;
  restoreDiceAfterDefense: () => void;
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  resumePendingStatus: () => void;
  scheduleCallback: (duration: number, callback: () => void) => () => void;
};

export function useStatusManager({
  pushLog,
  animateDefenseDie,
  restoreDiceAfterDefense,
  sendFlowEvent,
  resumePendingStatus,
  scheduleCallback,
}: UseStatusManagerArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const timersRef = useRef(new Set<() => void>());

  useEffect(
    () => () => {
      timersRef.current.forEach((cancel) => cancel());
      timersRef.current.clear();
    },
    []
  );

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({ type: "SET_PLAYER", side, player });
    },
    [dispatch]
  );

  const setPendingStatus = useCallback(
    (status: PendingStatusClear) => {
      dispatch({ type: "SET_PENDING_STATUS", status });
    },
    [dispatch]
  );

  const setPhase = useCallback(
    (phase: Phase) => {
      sendFlowEvent({ type: "SET_PHASE", phase });
    },
    [sendFlowEvent]
  );

  const performStatusClearRoll = useCallback(
    (side: Side) => {
      const currentStatus = latestState.current.pendingStatusClear;
      if (
        !currentStatus ||
        currentStatus.side !== side ||
        currentStatus.rolling
      ) {
        return;
      }

      const definition = getStatus(currentStatus.status);
      const cleanse = definition?.cleanse;
      if (!cleanse || cleanse.type !== "roll") {
        setPendingStatus(null);
        resumePendingStatus();
        return;
      }

      setPendingStatus({ ...currentStatus, rolling: true });
      const animationDuration = cleanse.animationDuration ?? 650;

      animateDefenseDie((roll) => {
        const snapshot = latestState.current;
        const playerState = snapshot.players[side];
        if (!playerState) {
          setPendingStatus(null);
          resumePendingStatus();
          return;
        }

        const currentStacks = getStacks(
          playerState.tokens,
          currentStatus.status,
          0
        );
        const result = cleanse.resolve(roll, currentStacks);
        const nextTokens = setStacks(
          playerState.tokens,
          currentStatus.status,
          result.nextStacks
        );
        const updatedPlayer: PlayerState = {
          ...playerState,
          tokens: nextTokens,
        };
        setPlayer(side, updatedPlayer);
        if (result.log) {
          pushLog(indentLog(result.log));
        }

        const updatedStacks = getStacks(
          nextTokens,
          currentStatus.status,
          0
        );

        setPendingStatus({
          ...currentStatus,
          stacks: updatedStacks,
          rolling: false,
          roll,
          success: result.success,
        });

        const cancelRestore = scheduleCallback(600, () => {
          timersRef.current.delete(cancelRestore);
          restoreDiceAfterDefense();
          const cancelFinalize = scheduleCallback(400, () => {
            timersRef.current.delete(cancelFinalize);
            setPendingStatus(null);
            setPhase("roll");
            resumePendingStatus();
          });
          timersRef.current.add(cancelFinalize);
        });
        timersRef.current.add(cancelRestore);
      }, animationDuration);
    },
    [
      animateDefenseDie,
      pushLog,
      restoreDiceAfterDefense,
      scheduleCallback,
      setPendingStatus,
      setPhase,
      setPlayer,
      latestState,
      resumePendingStatus,
    ]
  );

  return {
    performStatusClearRoll,
  };
}

