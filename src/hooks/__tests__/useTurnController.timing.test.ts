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
    const execute = vi.fn(() => true);

    const scheduled = scheduler.schedule(
      {
        descriptor: { side: "ai", phase: "turnTransition" },
        durationMs: 500,
        execute,
      },
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
    expect(execute).not.toHaveBeenCalled();

    timers[0]?.();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("clears the active transition when the battle ends early", () => {
    const { scheduler, timers } = makeScheduler();
    const onChange = vi.fn<(transition: ActiveTransition | null) => void>();
    const execute = vi.fn(() => false);

    scheduler.schedule(
      {
        descriptor: { side: "you", phase: "turnTransition" },
        durationMs: 300,
        execute,
      },
      onChange
    );

    timers[0]?.();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("skips holds for zero-duration transitions", () => {
    const { scheduler, setTimer } = makeScheduler();
    const onChange = vi.fn<(transition: ActiveTransition | null) => void>();
    const execute = vi.fn(() => true);

    scheduler.schedule(
      {
        descriptor: { side: "ai", phase: "end" },
        durationMs: 0,
        execute,
      },
      onChange
    );

    expect(setTimer).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
