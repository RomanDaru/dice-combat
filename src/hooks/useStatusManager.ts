import { useCallback, useEffect, useRef } from "react";
import { BURN_STATUS_ID } from "../game/statuses";
import type { PendingStatusClear } from "../game/state";
import type { Side, PlayerState, Phase } from "../game/types";
import { indentLog } from "./useCombatLog";
import { useGame } from "../context/GameContext";

type UseStatusManagerArgs = {
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  animateDefenseDie: (onDone: (roll: number) => void, duration?: number) => void;
  restoreDiceAfterDefense: () => void;
};

export function useStatusManager({
  pushLog,
  animateDefenseDie,
  restoreDiceAfterDefense,
}: UseStatusManagerArgs) {
  const { state, dispatch } = useGame();
  const stateRef = useRef(state);
  const statusResumeRef = useRef<(() => void) | null>(null);

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
      dispatch({ type: "PATCH_STATE", payload: { phase } });
      stateRef.current = { ...stateRef.current, phase };
    },
    [dispatch]
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

      if (currentStatus.status !== BURN_STATUS_ID) {
        return;
      }

      setPendingStatus({ ...currentStatus, rolling: true });
      animateDefenseDie((roll) => {
        const success = roll >= 5;
        const snapshot = stateRef.current;
        const playerState = snapshot.players[side];
        if (success && playerState) {
          const updatedPlayer: PlayerState = {
            ...playerState,
            tokens: { ...playerState.tokens, burn: 0 },
          };
          setPlayer(side, updatedPlayer);
        }
        const heroName = playerState?.hero.name ?? (side === "you" ? "You" : "AI");
        const statusLabel = "Burn";
        pushLog(
          indentLog(
            `Upkeep: ${heroName} roll vs ${statusLabel}: ${roll} ${
              success ? `-> removes ${statusLabel}` : `-> ${statusLabel} persists`
            }.`
          )
        );
        setPendingStatus({
          ...currentStatus,
          stacks: success ? 0 : currentStatus.stacks,
          rolling: false,
          roll,
          success,
        });
        window.setTimeout(() => {
          restoreDiceAfterDefense();
          window.setTimeout(() => {
            setPendingStatus(null);
            setPhase("roll");
            const resume = statusResumeRef.current;
            statusResumeRef.current = null;
            resume?.();
          }, 400);
        }, 600);
      }, 650);
    },
    [animateDefenseDie, pushLog, restoreDiceAfterDefense, setPendingStatus, setPhase, setPlayer]
  );

  return {
    statusResumeRef,
    performStatusClearRoll,
  };
}

