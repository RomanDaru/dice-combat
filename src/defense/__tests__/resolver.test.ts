import { describe, expect, it } from "vitest";

import { resolveDefenseSchema } from "../resolver";
import type { DefenseSchema } from "../types";

const schema: DefenseSchema = {
  dice: 3,
  fields: [
    { id: "LOW", faces: [1, 2] },
    { id: "HIGH", faces: [5, 6] },
  ],
  rules: [
    {
      id: "low_block",
      matcher: { type: "countField", fieldId: "LOW" },
      effects: [{ type: "blockPer", amount: 2, cap: 4 }],
    },
    {
      id: "high_status",
      matcher: { type: "countField", fieldId: "HIGH", min: 2 },
      effects: [{ type: "gainStatus", status: "chi", stacks: 1 }],
    },
    {
      id: "deal_damage",
      matcher: { type: "pairsField", fieldId: "HIGH", pairs: 1 },
      effects: [{ type: "dealPer", amount: 1 }],
    },
  ],
};

describe("resolveDefenseSchema", () => {
  it("aggregates block, damage, statuses, and logs per rule", () => {
    const result = resolveDefenseSchema({
      schema,
      dice: [1, 5, 6],
      incomingDamage: 8,
    });

    expect(result.dice).toEqual([1, 5, 6]);
    expect(result.totalBlock).toBe(2);
    expect(result.totalDamage).toBe(1);
    expect(result.statusGrants).toHaveLength(1);
    expect(result.statusGrants[0]).toMatchObject({
      status: "chi",
      stacks: 1,
      usablePhase: "nextTurn",
    });
    expect(result.rules).toHaveLength(3);
    expect(result.rules[0].matched).toBe(true);
    expect(result.rules[1].matched).toBe(true);
    expect(result.logs.length).toBeGreaterThan(0);
    expect(result.checkpoints).toMatchObject({
      rawDamage: 8,
      afterFlat: 8,
      afterPrevent: 8,
      afterBlock: 6,
      afterReflect: 6,
      finalDamage: 6,
    });
  });

  it("honors min requirements and captures unmatched rules", () => {
    const result = resolveDefenseSchema({
      schema,
      dice: [1, 2, 3],
      incomingDamage: 5,
    });

    const highStatusRule = result.rules.find(
      (rule) => rule.id === "high_status"
    );
    expect(highStatusRule?.matched).toBe(false);
    expect(result.totalDamage).toBe(0);
    expect(result.statusGrants).toHaveLength(0);
    expect(result.checkpoints.finalDamage).toBe(1); // 5 raw - 4 block cap
  });
});
