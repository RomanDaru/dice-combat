import { useCallback } from "react";
import { useEffect, useRef } from "react";
import { getStatus, setStacks, getStacks, addStacks } from "../engine/status";
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

      const actionKind = currentStatus.action ?? "cleanse";
      const definition = getStatus(currentStatus.status);
      if (actionKind === "transfer" && currentStatus.sourceStatus) {
        const sourceDef = getStatus(currentStatus.sourceStatus);
        const transferCfg = sourceDef?.transfer;
        if (!transferCfg) {
          setPendingStatus(null);
          resumePendingStatus();
          return;
        }
        setPendingStatus({ ...currentStatus, rolling: true });
        const animationDuration = transferCfg.animationDurationMs ?? 650;
        animateDefenseDie((roll) => {
          const snapshot = latestState.current;
          const playerState = snapshot.players[side];
          const targetSide =
            currentStatus.targetSide ?? (side === "you" ? "ai" : "you");
          const opponentState = snapshot.players[targetSide];
          if (!playerState || !opponentState) {
            setPendingStatus(null);
            resumePendingStatus();
            return;
          }
          const ownerStacks = getStacks(
            playerState.tokens,
            currentStatus.status,
            0
          );
          const sourceStacks = getStacks(
            playerState.tokens,
            currentStatus.sourceStatus,
            0
          );
          if (ownerStacks <= 0 || sourceStacks <= 0) {
            setPendingStatus(null);
            resumePendingStatus();
            return;
          }
          const consumeStacks = currentStatus.consumeStacks ?? transferCfg.consumeStacks ?? 1;
          const transferStacks =
            currentStatus.transferStacks ?? transferCfg.transferStacks ?? 1;
          const threshold =
            currentStatus.rollThreshold ?? transferCfg.rollThreshold ?? 4;
          const success = roll >= threshold;
          let updatedOwnerTokens = setStacks(
            playerState.tokens,
            currentStatus.sourceStatus,
            sourceStacks - consumeStacks
          );
          let updatedOpponentTokens = opponentState.tokens;
          let stacksAfter = getStacks(
            updatedOwnerTokens,
            currentStatus.status,
            ownerStacks
          );
          let amountTransferred = 0;
          if (success) {
            amountTransferred = Math.min(transferStacks, ownerStacks);
            if (amountTransferred > 0) {
              updatedOwnerTokens = setStacks(
                updatedOwnerTokens,
                currentStatus.status,
                ownerStacks - amountTransferred
              );
              stacksAfter = getStacks(
                updatedOwnerTokens,
                currentStatus.status,
                0
              );
              if ((transferCfg.mode ?? "transfer") === "transfer") {
                updatedOpponentTokens = addStacks(
                  updatedOpponentTokens,
                  currentStatus.status,
                  amountTransferred
                );
              }
            }
          }
          const ownerUpdate: PlayerState = {
            ...playerState,
            tokens: updatedOwnerTokens,
          };
          setPlayer(side, ownerUpdate);
          if (
            success &&
            (transferCfg.mode ?? "transfer") === "transfer" &&
            amountTransferred > 0
          ) {
            setPlayer(targetSide, {
              ...opponentState,
              tokens: updatedOpponentTokens,
            });
          }
          const targetName = definition?.name ?? currentStatus.status;
          const sourceName = sourceDef?.name ?? currentStatus.sourceStatus;
          const logMessage = success
            ? currentStatus.successLog ??
              transferCfg.successLog ??
              `${sourceName ?? "Status"} transfers ${targetName}.`
            : currentStatus.failureLog ??
              transferCfg.failureLog ??
              `${sourceName ?? "Status"} failed to transfer ${targetName}.`;
          if (logMessage) {
            pushLog(indentLog(logMessage));
          }
          setPendingStatus({
            ...currentStatus,
            stacks: stacksAfter,
            rolling: false,
            roll,
            success,
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
        return;
      }

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

