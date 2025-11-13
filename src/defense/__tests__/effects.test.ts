import { describe, expect, it } from "vitest";

import {
  executeDefenseEffects,
  PREVENT_HALF_STATUS_ID,
} from "../effects";
import type { DefenseEffectConfig } from "../types";
import type { DefenseMatcherEvaluation } from "../matchers";

const baseMatch: DefenseMatcherEvaluation = {
  matched: true,
  matchCount: 2,
  matchedDiceIndexes: [],
  fieldTotals: {},
};

const runEffects = (
  effects: DefenseEffectConfig[],
  overrides: Partial<{
    match: DefenseMatcherEvaluation;
    self: { statuses: Record<string, number> };
    opponent: { statuses: Record<string, number> };
  }> = {}
) =>
  executeDefenseEffects({
    ruleId: "rule_alpha",
    effects,
    match: overrides.match ?? baseMatch,
    self: overrides.self,
    opponent: overrides.opponent,
  });

describe("executeDefenseEffects", () => {
  it("scales dealPer and blockPer with matchCount and honors caps", () => {
    const { damage, blocks } = runEffects([
      { type: "dealPer", amount: 3, cap: 5 },
      { type: "blockPer", amount: 2, cap: 4 },
    ]);

    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({
      amount: 5,
      target: "opponent",
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      amount: 4,
      kind: "blockPer",
      target: "self",
    });
  });

  it("applies flat block with cap", () => {
    const { blocks } = runEffects([
      { type: "flatBlock", amount: 8, cap: 5 },
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].amount).toBe(5);
  });

  it("grants statuses with default usablePhase", () => {
    const { status } = runEffects([
      { type: "gainStatus", status: "chi", stacks: 2 },
    ]);

    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({
      status: "chi",
      stacks: 2,
      usablePhase: "nextTurn",
    });
  });

  it("grants preventHalf stacks with correct defaults", () => {
    const { status } = runEffects([{ type: "preventHalf", stacks: 3 }]);

    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({
      status: PREVENT_HALF_STATUS_ID,
      stacks: 3,
      usablePhase: "preApplyDamage",
    });
  });

  it("skips effects when conditions fail", () => {
    const result = runEffects(
      [
        {
          type: "flatBlock",
          amount: 4,
          conditions: { requiresSelfStatus: { status: "chi", minStacks: 2 } },
        },
      ],
      { self: { statuses: { chi: 1 } } }
    );

    expect(result.blocks).toHaveLength(0);
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0]).toMatchObject({
      outcome: "skipped",
      reason: 'Requires self status "chi" x2',
    });
  });
});
