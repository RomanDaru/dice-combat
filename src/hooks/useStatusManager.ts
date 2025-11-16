import { useCallback } from "react";
import { useEffect, useRef } from "react";
import { getStatus, setStacks, getStacks, addStacks } from "../engine/status";
import type { PendingStatusClear } from "../game/state";
import type { Side, PlayerState, Phase } from "../game/types";
import { indentLog } from "./useCombatLog";
import { useGame } from "../context/GameContext";
import type { GameFlowEvent } from "./useTurnController";
import { useLatest } from "./useLatest";
import { useStatsTracker } from "../context/StatsContext";

type StatusRollDisplay = {
  dice: number[];
  inProgress: boolean;
  label: string | null;
  outcome: "success" | "failure" | null;
};

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
  setDefenseStatusMessage: (message: string | null) => void;
  setDefenseStatusRollDisplay: (
    display: StatusRollDisplay | null
  ) => void;
  openDiceTray: () => void;
};

export function useStatusManager({
  pushLog,
  animateDefenseDie,
  restoreDiceAfterDefense,
  sendFlowEvent,
  resumePendingStatus,
  scheduleCallback,
  setDefenseStatusMessage,
  setDefenseStatusRollDisplay,
  openDiceTray,
}: UseStatusManagerArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const timersRef = useRef(new Set<() => void>());
  const stats = useStatsTracker();

  useEffect(
    () => () => {
      timersRef.current.forEach((cancel) => cancel());
      timersRef.current.clear();
    },
    []
  );

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({
        type: "SET_PLAYER",
        side,
        player,
        meta: "useStatusManager",
      });
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

  const clampDieValue = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.min(6, Math.max(1, Math.floor(value)));
  };

  const buildStatusRollLabel = (
    action: PendingStatusClear["action"] | undefined,
    statusName: string,
    sourceName?: string | null
  ) => {
    if (action === "transfer") {
      return `${sourceName ?? statusName} Transfer`;
    }
    return `${statusName} Cleanse`;
  };

  const buildStatusRollingMessage = (
    action: PendingStatusClear["action"] | undefined,
    statusName: string,
    ownerLabel: string
  ) => {
    if (action === "transfer") {
      return `${ownerLabel} attempts to transfer ${statusName}.`;
    }
    return `${ownerLabel} attempts to cleanse ${statusName}.`;
  };

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
      const ownerPlayer = latestState.current.players[side];
      const ownerLabel =
        side === "you"
          ? "You"
          : ownerPlayer?.hero.name ?? (side === "ai" ? "AI" : "Opponent");
      const sourceDef = currentStatus.sourceStatus
        ? getStatus(currentStatus.sourceStatus)
        : null;
      const statusName = definition?.name ?? currentStatus.status;
      const sourceName =
        sourceDef?.name ?? currentStatus.sourceStatus ?? statusName;
      const label = buildStatusRollLabel(actionKind, statusName, sourceName);
      const rollingMessage = buildStatusRollingMessage(
        actionKind,
        statusName,
        ownerLabel
      );
      const showStatusRollUi = side === "you";
      const buildFrame = (value?: number) => [
        clampDieValue(
          typeof value === "number"
            ? value
            : Math.floor(Math.random() * clampDieValue(currentStatus.dieSize ?? 6)) +
                1
        ),
      ];
      const startStatusUi = () => {
        if (!showStatusRollUi) return;
        openDiceTray();
        setDefenseStatusMessage(rollingMessage);
        setDefenseStatusRollDisplay({
          dice: buildFrame(),
          inProgress: true,
          label,
          outcome: null,
        });
      };
      const updateStatusUi = (
        value?: number,
        outcome: "success" | "failure" | null = null
      ) => {
        if (!showStatusRollUi) return;
        setDefenseStatusRollDisplay({
          dice: buildFrame(value),
          inProgress: outcome == null,
          label,
          outcome,
        });
      };
      const setStatusMessage = (message?: string | null) => {
        if (!showStatusRollUi || !message) return;
        setDefenseStatusMessage(message);
      };
      const clearStatusUi = () => {
        if (!showStatusRollUi) return;
        setDefenseStatusRollDisplay(null);
        setDefenseStatusMessage(null);
      };

      if (actionKind === "transfer" && currentStatus.sourceStatus) {
        const transferCfg = sourceDef?.transfer;
        if (!transferCfg) {
          setPendingStatus(null);
          resumePendingStatus();
          clearStatusUi();
          return;
        }
        setPendingStatus({ ...currentStatus, rolling: true });
        const animationDuration = transferCfg.animationDurationMs ?? 650;
        startStatusUi();
        animateDefenseDie(
          (roll) => {
            const snapshot = latestState.current;
            const playerState = snapshot.players[side];
            const targetSide =
              currentStatus.targetSide ?? (side === "you" ? "ai" : "you");
            const opponentState = snapshot.players[targetSide];
            if (!playerState || !opponentState) {
              setPendingStatus(null);
              resumePendingStatus();
              clearStatusUi();
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
              clearStatusUi();
              return;
            }
            const consumeStacks =
              currentStatus.consumeStacks ?? transferCfg.consumeStacks ?? 1;
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
            stats.recordStatusSnapshot(side, ownerUpdate.tokens, snapshot.round, "transfer");
            if (
              success &&
              (transferCfg.mode ?? "transfer") === "transfer" &&
              amountTransferred > 0
            ) {
              const targetUpdate: PlayerState = {
                ...opponentState,
                tokens: updatedOpponentTokens,
              };
              setPlayer(targetSide, targetUpdate);
              stats.recordStatusSnapshot(targetSide, targetUpdate.tokens, snapshot.round, "transfer");
            }
            const targetDisplayName = definition?.name ?? currentStatus.status;
            const logMessage = success
              ? currentStatus.successLog ??
                transferCfg.successLog ??
                `${sourceName ?? "Status"} transfers ${targetDisplayName}.`
              : currentStatus.failureLog ??
                transferCfg.failureLog ??
                `${sourceName ?? "Status"} failed to transfer ${targetDisplayName}.`;
            if (logMessage) {
              pushLog(indentLog(logMessage));
            }
            updateStatusUi(roll, success ? "success" : "failure");
            setStatusMessage(logMessage);
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
                clearStatusUi();
                setPhase("roll");
                resumePendingStatus();
              });
              timersRef.current.add(cancelFinalize);
            });
            timersRef.current.add(cancelRestore);
          },
          animationDuration,
          {
            animateSharedDice: false,
            onTick: showStatusRollUi
              ? (value) => {
                  updateStatusUi(value, null);
                }
              : undefined,
          }
        );
        return;
      }

      const cleanse = definition?.cleanse;
      if (!cleanse || cleanse.type !== "roll") {
        setPendingStatus(null);
        resumePendingStatus();
        clearStatusUi();
        return;
      }

      setPendingStatus({ ...currentStatus, rolling: true });
      const animationDuration = cleanse.animationDuration ?? 650;
      startStatusUi();

      animateDefenseDie(
        (roll) => {
          const snapshot = latestState.current;
          const playerState = snapshot.players[side];
          if (!playerState) {
            setPendingStatus(null);
            resumePendingStatus();
            clearStatusUi();
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
          stats.recordStatusSnapshot(side, updatedPlayer.tokens, snapshot.round, "cleanse");
          if (result.log) {
            pushLog(indentLog(result.log));
          }
          updateStatusUi(roll, result.success ? "success" : "failure");
          setStatusMessage(result.log);

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
              clearStatusUi();
              setPhase("roll");
              resumePendingStatus();
            });
            timersRef.current.add(cancelFinalize);
          });
          timersRef.current.add(cancelRestore);
        },
        animationDuration,
        {
          animateSharedDice: false,
          onTick: showStatusRollUi
            ? (value) => {
                updateStatusUi(value, null);
              }
            : undefined,
        }
      );
    },
    [
      animateDefenseDie,
      openDiceTray,
      pushLog,
      restoreDiceAfterDefense,
      scheduleCallback,
      setPendingStatus,
      setPhase,
      setPlayer,
      latestState,
      resumePendingStatus,
      stats,
      setDefenseStatusMessage,
      setDefenseStatusRollDisplay,
    ]
  );

  return {
    performStatusClearRoll,
  };
}

