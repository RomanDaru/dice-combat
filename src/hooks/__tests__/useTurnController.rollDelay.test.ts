import { describe, expect, it } from "vitest";
import { computeRollPhaseDelay } from "../useTurnController";

describe("computeRollPhaseDelay", () => {
  it("returns base delay when there are no cues", () => {
    expect(computeRollPhaseDelay(600, [])).toBe(600);
  });

  it("uses the longest cue duration plus buffer", () => {
    const result = computeRollPhaseDelay(600, [800, 400]);
    expect(result).toBe(800 + 200);
  });

  it("ignores negative or non-finite durations", () => {
    const result = computeRollPhaseDelay(500, [Number.NaN, -10, 100]);
    expect(result).toBe(500);
  });

  it("falls back to zero when base delay is invalid", () => {
    const result = computeRollPhaseDelay(Number.NaN, [400]);
    expect(result).toBe(600); // 400 + default buffer (200)
  });
});
