import { describe, expect, it } from "vitest";
import {
  addStacks,
  aggregateStatusSpendSummaries,
  createStatusSpendSummary,
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

  it("rejects chi defense spend when base block is zero", () => {
    const stacks: StatusStacks = addStacks({}, "chi", 1);
    const result = spendStatus(stacks, "chi", "defenseRoll", {
      phase: "defenseRoll",
      roll: 5,
      baseBlock: 0,
    });
    expect(result).toBeNull();
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

  it("aggregates multiple status summaries", () => {
    const chiSummary = createStatusSpendSummary("chi", 2, [
      { bonusDamage: 1, log: "Chi -> +1 damage" },
      { bonusDamage: 2, log: "Chi -> +2 damage" },
    ]);
    const evasiveSummary = createStatusSpendSummary("evasive", 1, [
      { negateIncoming: true, success: true, log: "Evasive success" },
    ]);
    const totals = aggregateStatusSpendSummaries([
      chiSummary,
      createStatusSpendSummary("chi", 1, [
        { bonusDamage: 1, log: "Chi -> +1 damage" },
      ]),
      evasiveSummary,
    ]);

    expect(totals.bonusDamage).toBe(4);
    expect(totals.bonusBlock).toBe(0);
    expect(totals.negateIncoming).toBe(true);
    expect(Object.keys(totals.byStatus).sort()).toEqual(["chi", "evasive"]);
    expect(totals.byStatus.chi.stacksSpent).toBe(3);
  });
});
