import type { Side } from "../types";

export type CueKind = "turn" | "status" | "attack";

export type Cue = {
  kind: CueKind;
  title: string;
  subtitle?: string;
  icon?: string | null;
  durationMs?: number;
  side?: Side | null;
};

export type ActiveCue = Cue & {
  id: number;
  durationMs: number;
  startedAt: number;
  endsAt: number;
  side?: Side | null;
};

export const DEFAULT_CUE_DURATION_MS = 1600;

type CreateCueQueueArgs = {
  now: () => number;
  onChange: (cue: ActiveCue | null) => void;
  schedule: (durationMs: number, callback: () => void) => () => void;
};

export type CueQueueController = ReturnType<typeof createCueQueue>;

const normalizeDuration = (value?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_CUE_DURATION_MS;
  }
  return value;
};

export function createCueQueue({
  now,
  onChange,
  schedule,
}: CreateCueQueueArgs) {
  let queue: Cue[] = [];
  let active: ActiveCue | null = null;
  let cancelTimer: (() => void) | null = null;
  let idCounter = 0;

  const finishActive = () => {
    active = null;
    onChange(null);
    startNext();
  };

  const startNext = () => {
    if (active || queue.length === 0) {
      return;
    }
    const cue = queue.shift();
    if (!cue) {
      onChange(null);
      return;
    }
    const durationMs = normalizeDuration(cue.durationMs);
    const startedAt = now();
    active = {
      id: ++idCounter,
      ...cue,
      durationMs,
      startedAt,
      endsAt: startedAt + durationMs,
    };
    onChange(active);
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

  const enqueue = (cue: Cue) => {
    queue.push(cue);
    startNext();
  };

  return {
    enqueue,
    clear,
    snapshot: () => ({
      active,
      pending: [...queue],
    }),
  };
}
