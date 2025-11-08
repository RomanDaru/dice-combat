import { DEFAULT_CUE_DURATION_MS as CONFIG_DEFAULT_CUE_DURATION_MS } from "../../config/cueDurations";
import type { Side } from "../types";

export type CueKind = "turn" | "status" | "attack";
export type CuePriority = "low" | "normal" | "urgent";

export type Cue = {
  kind: CueKind;
  title: string;
  subtitle?: string;
  cta?: string;
  icon?: string | null;
  banner?: string | null;
  durationMs?: number;
  side?: Side | null;
  priority?: CuePriority;
  mergeKey?: string;
  mergeWindowMs?: number;
  allowDuringTransition?: boolean;
};

export type ActiveCue = Cue & {
  id: number;
  durationMs: number;
  startedAt: number;
  endsAt: number;
  repeat: number;
};

export const DEFAULT_CUE_DURATION_MS = CONFIG_DEFAULT_CUE_DURATION_MS;
export const DEFAULT_CUE_QUEUE_MAX = 20;
const DEFAULT_MERGE_WINDOW_MS = 1200;

type CreateCueQueueArgs = {
  now: () => number;
  onChange: (cue: ActiveCue | null) => void;
  schedule: (durationMs: number, callback: () => void) => () => void;
  maxPending?: number;
  shouldDefer?: (cue: Cue) => boolean;
};

type QueuedCue = Cue & {
  enqueuedAt: number;
  repeat: number;
};

export type CueQueueController = ReturnType<typeof createCueQueue>;

const normalizeDuration = (value?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CUE_DURATION_MS;
  }
  if (value <= 0) {
    return 0;
  }
  return value;
};

const priorityRank: Record<CuePriority, number> = {
  low: 0,
  normal: 1,
  urgent: 2,
};

const getPriority = (priority?: CuePriority): CuePriority =>
  priority ?? "normal";

const buildDefaultMergeKey = (cue: Cue): string | null => {
  const base = [
    `kind:${cue.kind}`,
    `side:${cue.side ?? "any"}`,
    `title:${cue.title}`,
    `subtitle:${cue.subtitle ?? ""}`,
  ].join("|");
  return base;
};

export function createCueQueue({
  now,
  onChange,
  schedule,
  maxPending = DEFAULT_CUE_QUEUE_MAX,
  shouldDefer,
}: CreateCueQueueArgs) {
  let queue: QueuedCue[] = [];
  let active: ActiveCue | null = null;
  let cancelTimer: (() => void) | null = null;
  let idCounter = 0;
  let deferCheck = shouldDefer ?? (() => false);

  const finishActive = () => {
    const hasPending = queue.length > 0;
    active = null;
    onChange(null);
    if (hasPending) {
      startNext();
    }
  };

  const startNext = () => {
    if (active || queue.length === 0) {
      return;
    }

    let nextIndex = -1;
    for (let index = 0; index < queue.length; index += 1) {
      const candidate = queue[index];
      if (!candidate) {
        continue;
      }
      if (!deferCheck(candidate)) {
        nextIndex = index;
        break;
      }
    }

    if (nextIndex === -1) {
      return;
    }

    const [next] = queue.splice(nextIndex, 1);
    const durationMs = normalizeDuration(next.durationMs);
    const startedAt = now();
    active = {
      id: ++idCounter,
      ...next,
      durationMs,
      startedAt,
      endsAt: startedAt + durationMs,
    };
    onChange(active);

    if (durationMs <= 0) {
      finishActive();
      return;
    }

    cancelTimer = schedule(durationMs, () => {
      cancelTimer = null;
      finishActive();
    });
  };

  const clear = () => {
    queue = [];
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
    if (active) {
      active = null;
      onChange(null);
    }
  };

  const interrupt = () => {
    if (!active) {
      return false;
    }
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
    finishActive();
    return true;
  };

  const mergeIntoActive = (mergeKey: string, mergeWindow: number) => {
    if (!active || !mergeKey) {
      return false;
    }
    if (active.mergeKey !== mergeKey) {
      return false;
    }
    const elapsed = now() - active.startedAt;
    if (elapsed > mergeWindow) {
      return false;
    }
    active = {
      ...active,
      repeat: active.repeat + 1,
      endsAt: active.startedAt + active.durationMs,
    };
    onChange(active);
    return true;
  };

  const mergeIntoQueue = (
    mergeKey: string,
    timestamp: number,
    mergeWindow: number
  ) => {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const pending = queue[index];
      if (pending.mergeKey !== mergeKey) {
        continue;
      }
      if (timestamp - pending.enqueuedAt > mergeWindow) {
        continue;
      }
      queue[index] = {
        ...pending,
        repeat: pending.repeat + 1,
        enqueuedAt: timestamp,
      };
      return true;
    }
    return false;
  };

  const enqueue = (cue: Cue) => {
    const timestamp = now();
    const resolvedMergeKey = cue.mergeKey ?? buildDefaultMergeKey(cue);
    const mergeWindow =
      typeof cue.mergeWindowMs === "number" && cue.mergeWindowMs >= 0
        ? cue.mergeWindowMs
        : DEFAULT_MERGE_WINDOW_MS;

    if (resolvedMergeKey && mergeIntoActive(resolvedMergeKey, mergeWindow)) {
      return;
    }
    if (resolvedMergeKey && mergeIntoQueue(resolvedMergeKey, timestamp, mergeWindow)) {
      return;
    }

    const normalizedPriority = getPriority(cue.priority);
    const pendingCue: QueuedCue = {
      ...cue,
      priority: normalizedPriority,
      repeat: 1,
      enqueuedAt: timestamp,
      mergeKey: resolvedMergeKey ?? undefined,
    };

    if (queue.length >= maxPending) {
      let lowestIndex = -1;
      let lowestRank = Infinity;
      let oldestTimestamp = Infinity;

      queue.forEach((item, index) => {
        const rank = priorityRank[getPriority(item.priority)];
        if (rank < lowestRank || (rank === lowestRank && item.enqueuedAt < oldestTimestamp)) {
          lowestIndex = index;
          lowestRank = rank;
          oldestTimestamp = item.enqueuedAt;
        }
      });

      const incomingRank = priorityRank[normalizedPriority];
      if (lowestIndex >= 0 && lowestRank <= incomingRank) {
        queue.splice(lowestIndex, 1);
      } else {
        return;
      }
    }

    const insertIndex = queue.findIndex(
      (item) =>
        priorityRank[getPriority(item.priority)] <
        priorityRank[normalizedPriority]
    );

    if (insertIndex === -1) {
      queue.push(pendingCue);
    } else {
      queue.splice(insertIndex, 0, pendingCue);
    }

    startNext();
  };

  const setShouldDefer = (fn: (cue: Cue) => boolean) => {
    deferCheck = fn;
    if (!active) {
      startNext();
    }
  };

  const poke = () => {
    if (!active) {
      startNext();
    }
  };

  return {
    enqueue,
    clear,
    interrupt,
    poke,
    setShouldDefer,
    snapshot: () => ({
      active,
      pending: [...queue],
    }),
  };
}
