import { describe, expect, it } from "vitest";
import { makeRng } from "../rng";
import { rollDie } from "../../game/combos";

describe("mulberry32 rng", () => {
  it("produces deterministic dice results for a given seed", () => {
    const seed = 123456;
    const rngA = makeRng(seed);
    const rngB = makeRng(seed);

    const rollsA = Array.from({ length: 20 }, () => rollDie(rngA));
    const rollsB = Array.from({ length: 20 }, () => rollDie(rngB));

    expect(rollsA).toEqual(rollsB);
    expect(
      rollsA.every((value) => Number.isInteger(value) && value >= 1 && value <= 6)
    ).toBe(true);
  });
});
