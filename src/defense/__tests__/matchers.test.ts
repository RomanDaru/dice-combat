import { describe, expect, it } from "vitest";

import { evaluateDefenseMatcher } from "../matchers";
import type { DefenseSchema } from "../types";

const schema: DefenseSchema = {
  dice: 5,
  fields: [
    { id: "LOW", faces: [1, 2] },
    { id: "MID", faces: [3, 4] },
    { id: "HIGH", faces: [5, 6] },
  ],
  rules: [],
};

describe("evaluateDefenseMatcher - countField", () => {
  it("counts dice for the requested field", () => {
    const result = evaluateDefenseMatcher(
      schema,
      { type: "countField", fieldId: "LOW" },
      [1, 2, 5, 6, 3]
    );

    expect(result.matched).toBe(true);
    expect(result.matchCount).toBe(2);
    expect(result.matchedDiceIndexes).toEqual([0, 1]);
  });

  it("applies cap and min settings", () => {
    const result = evaluateDefenseMatcher(
      schema,
      { type: "countField", fieldId: "LOW", cap: 1, min: 2 },
      [1, 2, 3, 4, 5]
    );

    expect(result.matched).toBe(false);
    expect(result.matchCount).toBe(1);
  });
});

describe("evaluateDefenseMatcher - pairsField", () => {
  it("requires pairs from multiple fields", () => {
    const result = evaluateDefenseMatcher(
      schema,
      { type: "pairsField", fieldId: "LOW", pairs: 1 },
      [1, 2, 3, 4, 6]
    );

    expect(result.matched).toBe(true);
    expect(result.matchCount).toBe(1);
    expect(result.metadata?.totalPairs).toBe(1);
    expect(result.matchedDiceIndexes.sort()).toEqual([0, 1]);
  });

  it("fails when allowExtra is false and extra dice are present", () => {
    const result = evaluateDefenseMatcher(
      schema,
      { type: "pairsField", fieldId: "LOW", pairs: 2 },
      [1, 1, 2, 4, 5]
    );

    expect(result.matched).toBe(false);
  });

  it("honors cap when allowExtra is true", () => {
    const result = evaluateDefenseMatcher(
      schema,
      { type: "pairsField", fieldId: "HIGH", pairs: 1, cap: 1 },
      [5, 5, 6, 6, 4]
    );

    expect(result.matched).toBe(true);
    expect(result.matchCount).toBe(1);
    expect(result.metadata?.totalPairs).toBe(2);
  });
});

describe("evaluateDefenseMatcher - exactFace", () => {
  it("matches when the requested face appears enough times", () => {
    const result = evaluateDefenseMatcher(
      schema,
      { type: "exactFace", face: 6, count: 2 },
      [6, 6, 2, 3, 5]
    );

    expect(result.matched).toBe(true);
    expect(result.matchCount).toBe(2);
    expect(result.matchedDiceIndexes.sort()).toEqual([0, 1]);
  });

  it("fails when not enough dice match the face", () => {
    const result = evaluateDefenseMatcher(
      schema,
      { type: "exactFace", face: 5, count: 2 },
      [6, 2, 3, 4, 5]
    );

    expect(result.matched).toBe(false);
    expect(result.matchCount).toBe(1);
    expect(result.matchedDiceIndexes).toEqual([]);
  });
});

describe("evaluateDefenseMatcher - combo", () => {
  it("matches field recipes and captures indexes", () => {
    const result = evaluateDefenseMatcher(
      schema,
      {
        type: "combo",
        fields: [
          { id: "LOW", min: 1 },
          { id: "HIGH", min: 1 },
        ],
        allowExtra: true,
      },
      [1, 5, 3, 4, 2]
    );

    expect(result.matched).toBe(true);
    expect(result.matchCount).toBe(2);
    expect(result.matchedDiceIndexes.sort()).toEqual([0, 1]);
  });

  it("fails when extra dice are present and allowExtra is false", () => {
    const result = evaluateDefenseMatcher(
      schema,
      {
        type: "combo",
        fields: [
          { id: "LOW", min: 1 },
          { id: "MID", min: 1 },
        ],
        allowExtra: false,
      },
      [1, 2, 3, 4, 5]
    );

    expect(result.matched).toBe(false);
    expect(result.matchedDiceIndexes).toEqual([]);
  });
});
