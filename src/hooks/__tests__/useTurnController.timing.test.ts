import { describe, expect, it, vi } from "vitest";
import type { ActiveTransition } from "../useTurnController";
import { createTransitionScheduler } from "../useTurnController";

const makeScheduler = () => {
  const timers: Array<() => void> = [];
  let idCounter = 0;

  const setTimer = vi.fn<(cb: () => void, duration: number) => ReturnType<typeof setTimeout>>(
    (cb) => {
      timers.push(cb);
      idCounter += 1;
      return idCounter;
    }
  );

  const clearTimer = vi.fn<(id: ReturnType<typeof setTimeout>) => void>();

  const scheduler = createTransitionScheduler({
    now: () => 1_000,
    setTimer,
    clearTimer,
  });

  return { scheduler, timers, setTimer, clearTimer };
};

describe("createTransitionScheduler", () => {
  it("schedules a transition once and fires the callback after the duration", () => {
    const { scheduler, timers, setTimer } = makeScheduler();
    const onChange = vi.fn<(transition: ActiveTransition | null) => void>();
    const startTurn = vi.fn(() => true);

    const scheduled = scheduler.schedule(
      {
        next: "ai",
        prePhase: "turnTransition",
        durationMs: 500,
      },
      startTurn,
      onChange
    );

    expect(scheduled).toBe(true);
    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({
      side: "ai",
      phase: "turnTransition",
      durationMs: 500,
      startedAt: 1_000,
      endsAt: 1_500,
    });
    expect(startTurn).not.toHaveBeenCalled();

    timers[0]?.();

    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("clears the active transition when the battle ends early", () => {
    const { scheduler, timers } = makeScheduler();
    const onChange = vi.fn<(transition: ActiveTransition | null) => void>();
    const startTurn = vi.fn(() => false);

    scheduler.schedule(
      {
        next: "you",
        prePhase: "turnTransition",
        durationMs: 300,
      },
      startTurn,
      onChange
    );

    timers[0]?.();

    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("skips holds for zero-duration transitions", () => {
    const { scheduler, setTimer } = makeScheduler();
    const onChange = vi.fn<(transition: ActiveTransition | null) => void>();
    const startTurn = vi.fn(() => true);

    scheduler.schedule(
      {
        next: "ai",
        prePhase: "end",
        durationMs: 0,
      },
      startTurn,
      onChange
    );

    expect(setTimer).not.toHaveBeenCalled();
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

