import { useCallback, useEffect, useRef } from "react";
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
  onTransitionChange: (transition: ActiveTransition | null) => void;
};

type TransitionSchedulerDeps = {
  now: () => number;
  setTimer: (callback: () => void, duration: number) => ReturnType<typeof setTimeout>;
  clearTimer: (id: ReturnType<typeof setTimeout>) => void;
};

type TransitionRequest = {
  next: Side;
  prePhase: Phase;
  durationMs: number;
  afterReady?: () => void;
};

type TransitionScheduler = {
  schedule: (
    request: TransitionRequest,
    startTurn: (afterReady?: () => void) => boolean,
    onChange: (state: ActiveTransition | null) => void
  ) => boolean;
  cancel: (onChange?: (state: ActiveTransition | null) => void) => void;
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
      durationMs?: number;
      afterReady?: () => void;
      prePhase?: Phase;
    };

export type ActiveTransition = {
  side: Side;
  phase: Phase;
  durationMs: number;
  startedAt: number;
  endsAt: number;
};

const clampDuration = (value: number | undefined): number =>
  Number.isFinite(value) && typeof value === "number" && value > 0 ? value : 0;

export const createTransitionScheduler = (
  deps: TransitionSchedulerDeps
): TransitionScheduler => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastState: ActiveTransition | null = null;

  const clear = (onChange?: (state: ActiveTransition | null) => void) => {
    if (timer !== null) {
      deps.clearTimer(timer);
      timer = null;
    }
    if (lastState) {
      if (onChange) {
        onChange(null);
      }
    }
    lastState = null;
  };

  const schedule: TransitionScheduler["schedule"] = (
    request,
    startTurn,
    onChange
  ) => {
    if (lastState) {
      onChange(null);
    }
    clear(onChange);

    const durationMs = clampDuration(request.durationMs);
    if (durationMs <= 0) {
      const started = startTurn(request.afterReady);
      onChange(null);
      return started;
    }

    const startedAt = deps.now();
    lastState = {
      side: request.next,
      phase: request.prePhase,
      durationMs,
      startedAt,
      endsAt: startedAt + durationMs,
    };
    onChange(lastState);

    timer = deps.setTimer(() => {
      timer = null;
      const started = startTurn(request.afterReady);
      onChange(null);
      return started;
    }, durationMs);

    return true;
  };

  return {
    schedule,
    cancel: clear,
  };
};

export function useGameFlow({
  resetRoll,
  pushLog,
  popDamage,
  onTransitionChange,
}: UseGameFlowArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const statusResumeRef = useRef<(() => void) | null>(null);
  const transitionSchedulerRef = useRef<TransitionScheduler | null>(null);

  if (transitionSchedulerRef.current === null) {
    transitionSchedulerRef.current = createTransitionScheduler({
      now: () => Date.now(),
      setTimer: (callback, duration) => setTimeout(callback, duration),
      clearTimer: (id) => clearTimeout(id),
    });
  }

  useEffect(() => {
    return () => {
      transitionSchedulerRef.current?.cancel(onTransitionChange);
    };
  }, [onTransitionChange]);

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
      const scheduler = transitionSchedulerRef.current;
      if (!scheduler) {
        return false;
      }

      switch (event.type) {
        case "TURN_START":
          scheduler.cancel(onTransitionChange);
          return startTurn(event.side, event.afterReady);
        case "SET_PHASE":
          dispatch({ type: "SET_PHASE", phase: event.phase });
          return true;
        case "TURN_END": {
          const prePhase = event.prePhase ?? "end";
          dispatch({ type: "SET_PHASE", phase: prePhase });
          return scheduler.schedule(
            {
              next: event.next,
              prePhase,
              durationMs: event.durationMs ?? 0,
              afterReady: event.afterReady,
            },
            (afterReady) => startTurn(event.next, afterReady),
            onTransitionChange
          );
        }
        default:
          return false;
      }
    },
    [dispatch, onTransitionChange, startTurn, transitionSchedulerRef]
  );

  const resumePendingStatus = useCallback(() => {
    const resume = statusResumeRef.current;
    statusResumeRef.current = null;
    resume?.();
  }, []);

  return { send, resumePendingStatus };
}
