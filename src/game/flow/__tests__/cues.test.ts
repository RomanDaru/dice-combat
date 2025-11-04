import { describe, expect, it, vi } from "vitest";
import {
  createCueQueue,
  DEFAULT_CUE_DURATION_MS,
  type Cue,
} from "../cues";

const createScheduler = () => {
  const timers: Array<{ duration: number; callback: () => void }> = [];

  const schedule = (duration: number, callback: () => void) => {
    const entry = { duration, callback };
    timers.push(entry);
    return () => {
      const index = timers.indexOf(entry);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    };
  };

  return {
    schedule,
    timers,
    runNext: () => {
      const entry = timers.shift();
      entry?.callback();
    },
  };
};

const buildCue = (overrides: Partial<Cue> = {}): Cue => ({
  kind: "turn",
  title: "Test Cue",
  ...overrides,
});

describe("createCueQueue", () => {
  it("plays cues in FIFO order", () => {
    const changes: Array<string | null> = [];
    const scheduler = createScheduler();
    let now = 1_000;

    const queue = createCueQueue({
      now: () => now,
      onChange: (cue) => {
        changes.push(cue ? `${cue.id}:${cue.title}` : null);
      },
      schedule: scheduler.schedule,
    });

    queue.enqueue(buildCue({ title: "First", durationMs: 400 }));
    queue.enqueue(buildCue({ title: "Second", durationMs: 300 }));

    expect(changes).toEqual(["1:First"]);
    expect(scheduler.timers).toHaveLength(1);

    now += 400;
    scheduler.runNext();

    expect(changes).toEqual(["1:First", null, "2:Second"]);

    now += 300;
    scheduler.runNext();

    expect(changes).toEqual(["1:First", null, "2:Second", null]);
  });

  it("falls back to default duration when missing or invalid", () => {
    const scheduler = createScheduler();
    let now = 2_000;
    const onChange = vi.fn();

    const queue = createCueQueue({
      now: () => now,
      onChange,
      schedule: scheduler.schedule,
    });

    queue.enqueue(buildCue({ durationMs: 0 }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const active = onChange.mock.calls[0][0];
    expect(active?.durationMs).toBe(DEFAULT_CUE_DURATION_MS);
    expect(active?.endsAt).toBe(now + DEFAULT_CUE_DURATION_MS);
  });

  it("clears active cues and pending queue", () => {
    const scheduler = createScheduler();
    const onChange = vi.fn();
    const queue = createCueQueue({
      now: () => 5_000,
      onChange,
      schedule: scheduler.schedule,
    });

    queue.enqueue(buildCue({ title: "Active" }));
    queue.enqueue(buildCue({ title: "Pending" }));

    onChange.mockClear();
    queue.clear();

    expect(onChange).toHaveBeenCalledWith(null);
    expect(queue.snapshot().pending).toHaveLength(0);
  });
});

