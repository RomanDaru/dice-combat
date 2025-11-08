import { useCallback, useEffect, useRef } from "react";
import { useGame } from "../context/GameContext";
import { resolveTurnStart } from "../game/flow";
import type { GameState } from "../game/state";
import type { Phase, Side } from "../game/types";
import { useLatest } from "./useLatest";
import {
  createCueQueue,
  type ActiveCue,
  type Cue,
} from "../game/flow/cues";
import { getCueDuration } from "../config/cueDurations";
import { getStatus } from "../engine/status";

export type { Cue, ActiveCue } from "../game/flow/cues";

type UseGameFlowArgs = {
  resetRoll: () => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  onTransitionChange: (transition: ActiveTransition | null) => void;
  onCueChange: (cue: ActiveCue | null) => void;
};

type TransitionSchedulerDeps = {
  now: () => number;
  setTimer: (callback: () => void, duration: number) => ReturnType<typeof setTimeout>;
  clearTimer: (id: ReturnType<typeof setTimeout>) => void;
};

type TransitionDescriptor = {
  side: Side | null;
  phase: Phase;
};

type TransitionRequest = {
  descriptor: TransitionDescriptor;
  durationMs: number;
  execute: () => boolean;
};

type TransitionScheduler = {
  schedule: (
    request: TransitionRequest,
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
      durationMs?: number;
      afterReady?: () => void;
    }
  | {
      type: "TURN_END";
      next: Side;
      durationMs?: number;
      afterReady?: () => void;
      prePhase?: Phase;
    };

export type ActiveTransition = TransitionDescriptor & {
  durationMs: number;
  startedAt: number;
  endsAt: number;
};

type StatusPromptCueArgs = {
  statusName: string;
  ownerName: string;
  stacks: number;
  action?: "cleanse" | "transfer";
};

export const buildStatusPromptCue = ({
  statusName,
  ownerName,
  stacks,
  action = "cleanse",
}: StatusPromptCueArgs) => {
  const stackLabel = `${stacks} stack${stacks === 1 ? "" : "s"}`;
  const subtitle = `${ownerName} - ${stackLabel}`;
  const cta =
    action === "transfer" ? "Attempt transfer" : "Roll to resolve";
  const priority: Cue["priority"] = action === "transfer" ? "urgent" : "normal";
  return {
    title: statusName,
    subtitle,
    cta,
    priority,
  };
};

const ROLL_PHASE_DELAY_MS = 600;
const ROLL_DELAY_BUFFER_MS = 200;

export const computeRollPhaseDelay = (
  baseDelayMs: number,
  cueDurations: number[],
  bufferMs: number = ROLL_DELAY_BUFFER_MS
): number => {
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    baseDelayMs = 0;
  }
  const contributions = cueDurations
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((duration) => duration + bufferMs);
  if (!contributions.length) {
    return baseDelayMs;
  }
  return Math.max(baseDelayMs, ...contributions);
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
    if (lastState && onChange) {
      onChange(null);
    }
    lastState = null;
  };

  const schedule: TransitionScheduler["schedule"] = (request, onChange) => {
    clear(onChange);

    const durationMs = clampDuration(request.durationMs);
    if (durationMs <= 0) {
      const executed = request.execute();
      onChange(null);
      return executed;
    }

    const startedAt = deps.now();
    lastState = {
      ...request.descriptor,
      durationMs,
      startedAt,
      endsAt: startedAt + durationMs,
    };
    onChange(lastState);

    timer = deps.setTimer(() => {
      timer = null;
      request.execute();
      onChange(null);
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
  onCueChange,
}: UseGameFlowArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const statusResumeRef = useRef<(() => void) | null>(null);
  const transitionSchedulerRef = useRef<TransitionScheduler | null>(null);
  const callbackTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const cueQueueRef = useRef<ReturnType<typeof createCueQueue> | null>(null);
  const transitionStateRef = useRef<ActiveTransition | null>(null);

  if (transitionSchedulerRef.current === null) {
    transitionSchedulerRef.current = createTransitionScheduler({
      now: () => Date.now(),
      setTimer: (callback, duration) => setTimeout(callback, duration),
      clearTimer: (id) => clearTimeout(id),
    });
  }

  const handleTransitionChange = useCallback(
    (transition: ActiveTransition | null) => {
      transitionStateRef.current = transition;
      if (!transition) {
        cueQueueRef.current?.poke();
      }
      onTransitionChange(transition);
    },
    [onTransitionChange]
  );

  useEffect(() => {
    return () => {
      transitionSchedulerRef.current?.cancel(handleTransitionChange);
      callbackTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      callbackTimersRef.current.clear();
      cueQueueRef.current?.clear();
    };
  }, [handleTransitionChange]);

  const scheduleCallback = useCallback(
    (durationMs: number, callback: () => void): (() => void) => {
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        callback();
        return () => {};
      }
      const timer = setTimeout(() => {
        callback();
        callbackTimersRef.current.delete(timer);
      }, durationMs);
      callbackTimersRef.current.add(timer);
      return () => {
        if (callbackTimersRef.current.delete(timer)) {
          clearTimeout(timer);
        }
      };
    },
    []
  );

  if (cueQueueRef.current === null) {
    cueQueueRef.current = createCueQueue({
      now: () => Date.now(),
      onChange: onCueChange,
      schedule: (duration, cb) => scheduleCallback(duration, cb),
      shouldDefer: (cue) =>
        transitionStateRef.current !== null && cue.allowDuringTransition !== true,
    });
  }

  const schedulePhaseChange = useCallback(
    (phase: Phase, durationMs: number, afterReady?: () => void) => {
      const scheduler = transitionSchedulerRef.current;
      const execute = () => {
        dispatch({ type: "SET_PHASE", phase });
        afterReady?.();
        return true;
      };

      if (!scheduler) {
        return execute();
      }

      return scheduler.schedule(
        {
          descriptor: { side: null, phase },
          durationMs,
          execute,
        },
        handleTransitionChange
      );
    },
    [dispatch, handleTransitionChange]
  );

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
      const upkeepCueDurations: number[] = [];

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
        const heroName = turnResult.updatedPlayer.hero.name;
        const statusDamageDuration = getCueDuration("statusDamage");
        cueQueueRef.current?.enqueue({
          kind: "statusDamage",
          title: "Status Damage",
          subtitle: `${heroName} loses ${turnResult.statusDamage} HP`,
          durationMs: statusDamageDuration,
          side: next,
          priority: "normal",
          mergeKey: `status-damage:${next}`,
        });
        upkeepCueDurations.push(statusDamageDuration);
      }

      if (turnResult.pendingStatus) {
        upkeepCueDurations.push(getCueDuration("statusTick"));
      }

      if (turnResult.statusDamage > 0) {
        popDamage(next, turnResult.statusDamage, "hit");
      }

      if (turnResult.pendingStatus) {
        const promptDuration = getCueDuration("statusPrompt");
        const pending = turnResult.pendingStatus;
        const ownerPlayer = snapshot.players[pending.side];
        const ownerName =
          ownerPlayer?.hero.name ?? (pending.side === "you" ? "You" : "Opponent");
        const statusDef = getStatus(pending.status);
        const cueData = buildStatusPromptCue({
          statusName: statusDef?.name ?? pending.status,
          ownerName,
          stacks: pending.stacks,
          action: pending.action,
        });
        cueQueueRef.current?.enqueue({
          kind: "statusPrompt",
          title: cueData.title,
          subtitle: cueData.subtitle,
          cta: cueData.cta,
          durationMs: promptDuration,
          side: pending.side,
          priority: cueData.priority,
          mergeKey: `statusPrompt:${pending.side}:${pending.status}`,
        });
        upkeepCueDurations.push(promptDuration);
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
        const rollDelayMs = computeRollPhaseDelay(
          ROLL_PHASE_DELAY_MS,
          upkeepCueDurations
        );
        schedulePhaseChange("roll", rollDelayMs, afterReady);
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
      schedulePhaseChange,
    ]
  );

  const send = useCallback(
    (event: GameFlowEvent): boolean => {
      const scheduler = transitionSchedulerRef.current;

      switch (event.type) {
        case "TURN_START":
          scheduler?.cancel(handleTransitionChange);
          return startTurn(event.side, event.afterReady);
        case "SET_PHASE":
          if (event.durationMs && event.durationMs > 0) {
            return schedulePhaseChange(event.phase, event.durationMs, event.afterReady);
          }
          dispatch({ type: "SET_PHASE", phase: event.phase });
          event.afterReady?.();
          return true;
        case "TURN_END": {
          const prePhase = event.prePhase ?? "turnTransition";
          dispatch({ type: "SET_PHASE", phase: prePhase });
          const durationMs = event.durationMs ?? 0;
          if (!scheduler) {
            return startTurn(event.next, event.afterReady);
          }
          return scheduler.schedule(
            {
              descriptor: { side: event.next, phase: prePhase },
              durationMs,
              execute: () => startTurn(event.next, event.afterReady),
            },
            handleTransitionChange
          );
        }
        default:
          return false;
      }
    },
    [dispatch, handleTransitionChange, schedulePhaseChange, startTurn, transitionSchedulerRef]
  );

  const resumePendingStatus = useCallback(() => {
    const resume = statusResumeRef.current;
    statusResumeRef.current = null;
    resume?.();
  }, []);

  const enqueueCue = useCallback(
    (cue: Cue) => {
      cueQueueRef.current?.enqueue(cue);
    },
    []
  );

  const clearCues = useCallback(() => {
    cueQueueRef.current?.clear();
  }, []);

  const interruptCue = useCallback(() => {
    cueQueueRef.current?.interrupt();
  }, []);

  return {
    send,
    resumePendingStatus,
    scheduleCallback,
    enqueueCue,
    clearCues,
    interruptCue,
  };
}
