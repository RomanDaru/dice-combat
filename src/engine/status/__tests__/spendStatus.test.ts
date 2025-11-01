import { describe, expect, it } from "vitest";
import {
  addStacks,
  spendStatus,
  type StatusStacks,
} from "../index";

describe("spendStatus", () => {
  it("spends chi during attack roll and returns bonus damage", () => {
    const stacks: StatusStacks = addStacks({}, "chi", 2);
    const result = spendStatus(stacks, "chi", "attackRoll", {
      phase: "attackRoll",
      baseDamage: 3,
    });
    expect(result).not.toBeNull();
    expect(result?.next.chi).toBe(1);
    expect(result?.spend.bonusDamage).toBe(1);
  });

  it("requires roll for evasive spend", () => {
    const stacks: StatusStacks = addStacks({}, "evasive", 1);
    const missingRoll = spendStatus(stacks, "evasive", "defenseRoll", {
      phase: "defenseRoll",
    });
    expect(missingRoll).toBeNull();

    const failed = spendStatus(stacks, "evasive", "defenseRoll", {
      phase: "defenseRoll",
      roll: 3,
    });
    expect(failed).not.toBeNull();
    expect(failed?.spend.success).toBe(false);
    expect(failed?.next.evasive ?? 0).toBe(0);

    const replenished = addStacks({}, "evasive", 1);
    const success = spendStatus(replenished, "evasive", "defenseRoll", {
      phase: "defenseRoll",
      roll: 5,
    });
    expect(success).not.toBeNull();
    expect(success?.spend.success).toBe(true);
    expect(success?.spend.negateIncoming).toBe(true);
  });

  it("rejects spending in disallowed phase", () => {
    const stacks: StatusStacks = addStacks({}, "chi", 1);
    const spend = spendStatus(stacks, "chi", "resolve", {
      phase: "resolve",
    });
    expect(spend).toBeNull();
  });
});
