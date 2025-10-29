import { useCallback, useRef } from "react";
import { useGame } from "../context/GameContext";
import { resolveTurnStart } from "../game/flow";
import type { GameState } from "../game/state";
import type { Phase, Side } from "../game/types";
import { useLatest } from "./useLatest";

type UseGameFlowArgs = {
  resetRoll: () => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
};

export type GameFlowEvent =
  | {
      type: "TURN_START";
      side: Side;
      afterReady?: () => void;
    }
  | {
      type: "SET_PHASE";
      phase: Phase;
    }
  | {
      type: "TURN_END";
      next: Side;
      delayMs?: number;
      afterReady?: () => void;
      prePhase?: Phase;
    };

export function useGameFlow({
  resetRoll,
  pushLog,
  popDamage,
}: UseGameFlowArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const statusResumeRef = useRef<(() => void) | null>(null);

  const patchAiPreview = useCallback(
    (partial: Partial<GameState["aiPreview"]>) => {
      dispatch({ type: "PATCH_AI_PREVIEW", payload: partial });
    },
    [dispatch]
  );

  const patchAiDefense = useCallback(
    (partial: Partial<GameState["aiDefense"]>) => {
      dispatch({ type: "PATCH_AI_DEFENSE", payload: partial });
    },
    [dispatch]
  );

  const startTurn = useCallback(
    (next: Side, afterReady?: () => void): boolean => {
      const snapshot = latestState.current;
      const prevTurn = snapshot.turn;
      const turnResult = resolveTurnStart(snapshot, next);
      const prevRound = snapshot.round;
      const prevLogLength = snapshot.log?.length ?? 0;

      dispatch({ type: "SET_TURN", turn: next });
      dispatch({ type: "SET_PHASE", phase: "upkeep" });
      dispatch({ type: "SET_PENDING_ATTACK", attack: null });
      patchAiPreview({ active: false, rolling: false });
      patchAiDefense({
        inProgress: false,
        defenseRoll: null,
        defenseDice: null,
        defenseCombo: null,
        evasiveRoll: null,
      });
      resetRoll();

      dispatch({ type: "SET_PLAYER", side: next, player: turnResult.updatedPlayer });

      if (turnResult.statusDamage > 0) {
        popDamage(next, turnResult.statusDamage, "hit");
      }

      if (!turnResult.continueBattle) {
        if (turnResult.logLines.length) {
          pushLog(turnResult.logLines, { blankLineBefore: true });
        }
        turnResult.extraLogs.forEach((entry) => pushLog(entry));
        dispatch({ type: "SET_PENDING_STATUS", status: null });
        statusResumeRef.current = null;
        return false;
      }

      const lines = turnResult.logLines;

      if (next === "you") {
        let newRound = prevRound;
        let shouldLogRound = false;

        if (prevRound <= 0) {
          newRound = 1;
          shouldLogRound = true;
        } else if (prevTurn !== "you") {
          newRound = prevRound + 1;
          shouldLogRound = true;
        }

        if (shouldLogRound) {
          const shouldAddGap = prevRound > 0 || prevLogLength > 1;
          dispatch({ type: "SET_ROUND", round: newRound });
          pushLog(`--- Kolo ${newRound} ---`, { blankLineBefore: shouldAddGap });
        }

        if (lines.length) {
          pushLog(lines, {
            blankLineBefore: !shouldLogRound && (prevRound > 0 || prevLogLength > 1),
          });
        }
      } else if (next === "ai") {
        const header = turnResult.header ?? "[AI] AI attacks:";
        const payload = lines.length ? [header, ...lines] : [header];
        pushLog(payload, { blankLineBefore: true });
      } else if (lines.length) {
        pushLog(lines, { blankLineBefore: true });
      }

      turnResult.extraLogs.forEach((entry) => pushLog(entry));

      if (turnResult.pendingStatus) {
        dispatch({
          type: "SET_PENDING_STATUS",
          status: turnResult.pendingStatus,
        });
        statusResumeRef.current = afterReady ?? null;
      } else {
        dispatch({ type: "SET_PENDING_STATUS", status: null });
        statusResumeRef.current = null;
        window.setTimeout(() => {
          dispatch({ type: "SET_PHASE", phase: "roll" });
        }, 600);
        afterReady?.();
      }

      return true;
    },
    [
      dispatch,
      patchAiDefense,
      patchAiPreview,
      popDamage,
      pushLog,
      resetRoll,
      latestState,
    ]
  );

  const send = useCallback(
    (event: GameFlowEvent): boolean => {
      switch (event.type) {
        case "TURN_START":
          return startTurn(event.side, event.afterReady);
        case "SET_PHASE":
          dispatch({ type: "SET_PHASE", phase: event.phase });
          return true;
        case "TURN_END": {
          const prePhase = event.prePhase ?? "end";
          dispatch({ type: "SET_PHASE", phase: prePhase });
          const delay = event.delayMs ?? 0;
          window.setTimeout(() => {
            startTurn(event.next, event.afterReady);
          }, delay);
          return true;
        }
        default:
          return false;
      }
    },
    [dispatch, startTurn]
  );

  const resumePendingStatus = useCallback(() => {
    const resume = statusResumeRef.current;
    statusResumeRef.current = null;
    resume?.();
  }, []);

  return { send, resumePendingStatus };
}
