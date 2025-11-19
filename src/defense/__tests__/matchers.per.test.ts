import { describe, expect, it } from "vitest";

import { evaluateDefenseMatcher } from "../matchers";
import { executeDefenseEffects, PREVENT_HALF_STATUS_ID } from "../effects";
import type { DefenseSchema } from "../types";

// Simple schema with three fields used in all tests
const schema: DefenseSchema = {
  dice: 5,
  fields: [
    { id: "LOW", faces: [1, 2] },
    { id: "MID", faces: [3, 4] },
    { id: "HIGH", faces: [5, 6] },
  ],
  rules: [],
};

describe("Defense effects semantics: On vs For each", () => {
  it("On: gainStatus applies once even if multiple dice match", () => {
    const dice = [1, 2, 1, 4, 6]; // LOW appears 3 times
    const match = evaluateDefenseMatcher(
      schema,
      { type: "countField", fieldId: "LOW" },
      dice
    );

    expect(match.matched).toBe(true);
    expect(match.matchCount).toBe(3);

    const { status, traces } = executeDefenseEffects({
      ruleId: "r_on_gain",
      effects: [
        {
          type: "gainStatus",
          status: "chi",
          stacks: 2,
        },
      ],
      match,
    });

    // Applies once (does not multiply by matchCount)
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ status: "chi", stacks: 2 });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ outcome: "applied", value: 2 });
  });

  it("On: preventHalf applies once even if multiple dice match", () => {
    const dice = [1, 2, 1, 4, 6]; // LOW appears 3 times
    const match = evaluateDefenseMatcher(
      schema,
      { type: "countField", fieldId: "LOW" },
      dice
    );

    expect(match.matched).toBe(true);
    expect(match.matchCount).toBe(3);

    const { status } = executeDefenseEffects({
      ruleId: "r_on_prevent",
      effects: [
        {
          type: "preventHalf",
          stacks: 1,
        },
      ],
      match,
    });

    // Applies once
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ status: PREVENT_HALF_STATUS_ID, stacks: 1 });
  });

  it("For each: blockPer scales with the number of matching dice", () => {
    const dice = [1, 2, 1, 4, 6]; // LOW appears 3 times
    const match = evaluateDefenseMatcher(
      schema,
      { type: "countField", fieldId: "LOW" },
      dice
    );

    expect(match.matched).toBe(true);
    expect(match.matchCount).toBe(3);

    const { blocks, traces } = executeDefenseEffects({
      ruleId: "r_for_each_block",
      effects: [
        {
          type: "blockPer",
          amount: 1,
        },
      ],
      match,
    });

    // Scales: 1 block per matching die => 3 total
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ amount: 3 });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ outcome: "applied", value: 3 });
  });
});
