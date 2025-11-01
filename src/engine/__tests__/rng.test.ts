import { describe, expect, it } from "vitest";
import { makeRng } from "../rng";
import { rollDie } from "../../game/combos";

describe("rng determinism", () => {
  it("produces identical dice sequences for the same seed", () => {
    const seed = 123456;
    const rngA = makeRng(seed);
    const rngB = makeRng(seed);

    const sequenceA = Array.from({ length: 10 }, () => rollDie(rngA));
    const sequenceB = Array.from({ length: 10 }, () => rollDie(rngB));

    expect(sequenceB).toEqual(sequenceA);
  });
});
