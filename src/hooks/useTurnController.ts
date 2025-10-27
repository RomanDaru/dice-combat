import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { useGame } from "../context/GameContext";
import { resolveTurnStart } from "../game/flow";
import type { GameState } from "../game/state";
import type { Side } from "../game/types";

type UseGameFlowArgs = {
  resetRoll: () => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  statusResumeRef: MutableRefObject<(() => void) | null>;
};

export type GameFlowEvent =
  | {
      type: "TURN_START";
      side: Side;
      afterReady?: () => void;
    };

export function useGameFlow({
  resetRoll,
  pushLog,
  popDamage,
  statusResumeRef,
}: UseGameFlowArgs) {
  const { state, dispatch } = useGame();
  const stateRef = useRef<GameState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patchAiPreview = useCallback(
    (partial: Partial<GameState["aiPreview"]>) => {
      dispatch({ type: "PATCH_AI_PREVIEW", payload: partial });
      stateRef.current = {
        ...stateRef.current,
        aiPreview: { ...stateRef.current.aiPreview, ...partial },
      };
    },
    [dispatch]
  );

  const patchAiDefense = useCallback(
    (partial: Partial<GameState["aiDefense"]>) => {
      dispatch({ type: "PATCH_AI_DEFENSE", payload: partial });
      stateRef.current = {
        ...stateRef.current,
        aiDefense: { ...stateRef.current.aiDefense, ...partial },
      };
    },
    [dispatch]
  );

  const startTurn = useCallback(
    (next: Side, afterReady?: () => void): boolean => {
      const prevTurn = stateRef.current.turn;
      const turnResult = resolveTurnStart(stateRef.current, next);

      dispatch({ type: "SET_TURN", turn: next });
      dispatch({ type: "SET_PHASE", phase: "upkeep" });
      dispatch({ type: "SET_PENDING_ATTACK", attack: null });
      patchAiPreview({ active: false, rolling: false });
      patchAiDefense({ inProgress: false, defenseRoll: null, evasiveRoll: null });
      resetRoll();

      dispatch({ type: "SET_PLAYER", side: next, player: turnResult.updatedPlayer });
      stateRef.current = {
        ...stateRef.current,
        players: { ...stateRef.current.players, [next]: turnResult.updatedPlayer },
        turn: next,
        phase: "upkeep",
      };

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
        const currentRound = stateRef.current.round;
        const logLength = stateRef.current.log?.length ?? 0;
        let newRound = currentRound;
        let shouldLogRound = false;

        if (currentRound <= 0) {
          newRound = 1;
          shouldLogRound = true;
        } else if (prevTurn !== "you") {
          newRound = currentRound + 1;
          shouldLogRound = true;
        }

        if (shouldLogRound) {
          const shouldAddGap = currentRound > 0 || logLength > 1;
          dispatch({ type: "SET_ROUND", round: newRound });
          stateRef.current = { ...stateRef.current, round: newRound };
          pushLog(`--- Kolo ${newRound} ---`, { blankLineBefore: shouldAddGap });
        }

        if (lines.length) {
          pushLog(lines, {
            blankLineBefore: !shouldLogRound && (currentRound > 0 || logLength > 1),
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
          stateRef.current = { ...stateRef.current, phase: "roll" };
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
      statusResumeRef,
    ]
  );

  const send = useCallback(
    (event: GameFlowEvent): boolean => {
      switch (event.type) {
        case "TURN_START":
          return startTurn(event.side, event.afterReady);
        default:
          return false;
      }
    },
    [startTurn]
  );

  return { send, startTurn };
}
