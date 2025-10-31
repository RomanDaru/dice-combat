import { describe, expect, it } from "vitest";
import { tickStatuses, addStacks } from "../index";

describe("tickStatuses", () => {
  it("burn stacks decay with damage 4/3/2", () => {
    const start = addStacks({}, "burn", 3);
    const first = tickStatuses(start);
    expect(first.totalDamage).toBe(4);
    expect(first.next.burn).toBe(2);

    const second = tickStatuses(first.next);
    expect(second.totalDamage).toBe(3);
    expect(second.next.burn).toBe(1);

    const third = tickStatuses(second.next);
    expect(third.totalDamage).toBe(2);
    expect((third.next.burn ?? 0)).toBe(0);
  });

  it("produces prompt when stacks remain after damage", () => {
    const start = addStacks({}, "burn", 2);
    const tick = tickStatuses(start);
    expect(tick.prompts).toHaveLength(1);
    expect(tick.prompts[0]).toMatchObject({ id: "burn", stacks: 1 });
  });
});

