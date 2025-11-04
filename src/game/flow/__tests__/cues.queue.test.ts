import { describe, expect, it, vi } from "vitest";
import {
  createCueQueue,
  DEFAULT_CUE_DURATION_MS,
  type ActiveCue,
  type Cue,
} from "../cues";

type TimerHandle = {
  duration: number;
  callback: () => void;
};

const makeController = (
  options: Partial<Parameters<typeof createCueQueue>[0]> = {}
) => {
  let currentTime = 0;
  const timers = new Set<TimerHandle>();
  const onChange = vi.fn<(cue: ActiveCue | null) => void>();

  const schedule = vi.fn<(duration: number, cb: () => void) => () => void>(
    (duration, cb) => {
      const handle: TimerHandle = {
        duration,
        callback: () => {
          timers.delete(handle);
          cb();
        },
      };
      timers.add(handle);
      return () => {
        timers.delete(handle);
      };
    }
  );

  const controller = createCueQueue({
    now: () => currentTime,
    onChange,
    schedule: (duration, cb) => schedule(duration, cb),
    ...options,
  });

  const runTimers = () => {
    [...timers].forEach((handle) => handle.callback());
  };

  const setTime = (value: number) => {
    currentTime = value;
  };

  return { controller, onChange, schedule, setTime, runTimers };
};

const makeCue = (overrides: Partial<Cue> = {}): Cue => ({
  kind: "status",
  title: "Status",
  ...overrides,
});

describe("createCueQueue", () => {
  it("plays cues sequentially and respects FIFO order", () => {
    const { controller, onChange, runTimers, schedule } = makeController();

    controller.enqueue(makeCue({ title: "First", durationMs: 500 }));
    controller.enqueue(makeCue({ title: "Second", durationMs: 400 }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "First", repeat: 1 })
    );
    expect(schedule).toHaveBeenCalledTimes(1);

    runTimers();

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      null
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Second", repeat: 1 })
    );
  });

  it("queues cues while another is active", () => {
    const { controller, onChange } = makeController();

    controller.enqueue(makeCue({ title: "Active", durationMs: 1_000 }));
    controller.enqueue(makeCue({ title: "Queued", durationMs: 1_000 }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().pending).toHaveLength(1);
    expect(controller.snapshot().pending[0]?.title).toBe("Queued");
  });

  it("clears timers and active cue on clear()", () => {
    const { controller, onChange } = makeController();

    controller.enqueue(makeCue({ title: "Active", durationMs: 1_000 }));
    controller.clear();

    expect(onChange).toHaveBeenCalledWith(null);
    expect(controller.snapshot().active).toBeNull();
    expect(controller.snapshot().pending).toHaveLength(0);
  });

  it("supports interrupting an active cue", () => {
    const { controller, onChange } = makeController();

    controller.enqueue(makeCue({ title: "Interrupt me", durationMs: 1_000 }));
    const interrupted = controller.interrupt();

    expect(interrupted).toBe(true);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(controller.snapshot().active).toBeNull();
  });

  it("does not block the queue on zero-duration cues", () => {
    const { controller, onChange } = makeController();

    controller.enqueue(makeCue({ title: "Zero", durationMs: 0 }));
    controller.enqueue(makeCue({ title: "Next", durationMs: 500 }));

    const sequence = onChange.mock.calls.map(([value]) => {
      if (value === null) {
        return "null";
      }
      return (value as ActiveCue).title;
    });

    expect(sequence).toEqual(["Zero", "null", "Next"]);
  });

  it("enforces max queue size and drops lowest priority entries", () => {
    const { controller } = makeController({
      maxPending: 2,
      shouldDefer: () => true,
    });

    controller.enqueue(makeCue({ title: "keep-me", priority: "normal" }));
    controller.enqueue(makeCue({ title: "drop-me", priority: "low" }));
    controller.enqueue(makeCue({ title: "urgent", priority: "urgent" }));

    const pending = controller.snapshot().pending.map((cue) => cue.title);
    expect(pending).toEqual(["urgent", "keep-me"]);
  });

  it("keeps urgent cues first in pending queue while a low-priority cue is active", () => {
    const { controller, runTimers, onChange } = makeController();

    controller.enqueue(makeCue({ title: "Status Tick", priority: "low", durationMs: 200 }));
    expect(onChange).toHaveBeenCalledTimes(1);
    controller.enqueue(makeCue({ title: "Lethal Telegraph", priority: "urgent", durationMs: 300 }));

    const pending = controller.snapshot().pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]?.title).toBe("Lethal Telegraph");

    runTimers();

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Lethal Telegraph" })
    );
  });

  it("merges duplicate cues by mergeKey for the active cue", () => {
    const { controller, onChange, setTime } = makeController();

    controller.enqueue(
      makeCue({
        title: "Poison",
        durationMs: DEFAULT_CUE_DURATION_MS,
        mergeKey: "poison",
        mergeWindowMs: 2_000,
      })
    );

    setTime(500);
    controller.enqueue(
      makeCue({
        title: "Poison",
        mergeKey: "poison",
        mergeWindowMs: 2_000,
      })
    );

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Poison", repeat: 2 })
    );
  });

  it("merges duplicate cues by mergeKey for pending items", () => {
    const { controller, setTime } = makeController({
      shouldDefer: () => true,
    });

    controller.enqueue(
      makeCue({
        title: "Poison",
        mergeKey: "poison",
        mergeWindowMs: 2_000,
      })
    );

    const pending = controller.snapshot().pending[0];
    expect(pending?.repeat).toBe(1);

    controller.enqueue(
      makeCue({
        title: "Poison",
        mergeKey: "poison",
        mergeWindowMs: 2_000,
      })
    );

    setTime(100);

    const mergedPending = controller.snapshot().pending[0];
    expect(mergedPending?.repeat).toBe(2);
  });

  it("deduplicates cues using default merge key when not provided", () => {
    const { controller, onChange, setTime } = makeController();

    controller.enqueue(
      makeCue({
        kind: "attack",
        title: "Lethal Strike",
        subtitle: "Hero deals 10 dmg",
        side: "you",
      })
    );

    setTime(500);
    controller.enqueue(
      makeCue({
        kind: "attack",
        title: "Lethal Strike",
        subtitle: "Hero deals 10 dmg",
        side: "you",
      })
    );

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ repeat: 2 })
    );

    controller.enqueue(
      makeCue({
        kind: "attack",
        title: "Lethal Strike",
        subtitle: "Hero deals 12 dmg",
        side: "you",
      })
    );

    const pending = controller.snapshot().pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]?.repeat).toBe(1);
  });

  it("defers starting cues when shouldDefer returns true", () => {
    let transitionActive = true;
    const { controller, onChange, setTime } = makeController({
      shouldDefer: (cue) =>
        transitionActive && cue.allowDuringTransition !== true,
    });

    controller.enqueue(
      makeCue({ title: "Wait", durationMs: 500, allowDuringTransition: false })
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(controller.snapshot().pending).toHaveLength(1);

    transitionActive = false;
    controller.poke();
    setTime(100);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Wait" })
    );
  });

  it("plays allowDuringTransition cues even when deferred", () => {
    const { controller, onChange } = makeController({
      shouldDefer: (cue) => cue.allowDuringTransition !== true,
    });

    controller.enqueue(
      makeCue({
        title: "Deferred",
        durationMs: 500,
        allowDuringTransition: false,
      })
    );

    expect(onChange).not.toHaveBeenCalled();

    controller.enqueue(
      makeCue({
        title: "Critical",
        durationMs: 400,
        allowDuringTransition: true,
      })
    );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Critical" })
    );
  });
});
