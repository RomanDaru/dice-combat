import { useCallback, useEffect, useRef } from "react";
import { getStatusDefinition } from "../game/statuses";
import type { PendingStatusClear } from "../game/state";
import type { Side, PlayerState, Phase } from "../game/types";
import { indentLog } from "./useCombatLog";
import { useGame } from "../context/GameContext";
import type { GameFlowEvent } from "./useTurnController";

type UseStatusManagerArgs = {
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  animateDefenseDie: (onDone: (roll: number) => void, duration?: number) => void;
  restoreDiceAfterDefense: () => void;
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  resumePendingStatus: () => void;
};

export function useStatusManager({
  pushLog,
  animateDefenseDie,
  restoreDiceAfterDefense,
  sendFlowEvent,
  resumePendingStatus,
}: UseStatusManagerArgs) {
  const { state, dispatch } = useGame();
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({ type: "SET_PLAYER", side, player });
      stateRef.current = {
        ...stateRef.current,
        players: { ...stateRef.current.players, [side]: player },
      };
    },
    [dispatch]
  );

  const setPendingStatus = useCallback(
    (status: PendingStatusClear) => {
      dispatch({ type: "SET_PENDING_STATUS", status });
      stateRef.current = { ...stateRef.current, pendingStatusClear: status };
    },
    [dispatch]
  );

  const setPhase = useCallback(
    (phase: Phase) => {
      sendFlowEvent({ type: "SET_PHASE", phase });
      stateRef.current = { ...stateRef.current, phase };
    },
    [sendFlowEvent]
  );

  const performStatusClearRoll = useCallback(
    (side: Side) => {
      const currentStatus = stateRef.current.pendingStatusClear;
      if (
        !currentStatus ||
        currentStatus.side !== side ||
        currentStatus.rolling
      ) {
        return;
      }

      const definition = getStatusDefinition(currentStatus.status);
      const cleanse = definition?.cleanse;
      if (!cleanse || cleanse.type !== "roll") {
        setPendingStatus(null);
        resumePendingStatus();
        return;
      }

      setPendingStatus({ ...currentStatus, rolling: true });
      const animationDuration = cleanse.animationDuration ?? 650;

      animateDefenseDie((roll) => {
        const snapshot = stateRef.current;
        const playerState = snapshot.players[side];
        if (!playerState) {
          setPendingStatus(null);
          resumePendingStatus();
          return;
        }

        const result = cleanse.resolve(playerState, roll);
        setPlayer(side, result.updated);
        pushLog(indentLog(result.logLine));

        const updatedStacks = (result.updated.tokens as Record<string, number | undefined>)[
          currentStatus.status
        ] ?? 0;

        setPendingStatus({
          ...currentStatus,
          stacks: updatedStacks,
          rolling: false,
          roll,
          success: result.success,
        });

        window.setTimeout(() => {
          restoreDiceAfterDefense();
          window.setTimeout(() => {
            setPendingStatus(null);
            setPhase("roll");
            resumePendingStatus();
          }, 400);
        }, 600);
      }, animationDuration);
    },
    [
      animateDefenseDie,
      pushLog,
      restoreDiceAfterDefense,
      setPendingStatus,
      setPhase,
      setPlayer,
      resumePendingStatus,
    ]
  );

  return {
    performStatusClearRoll,
  };
}

