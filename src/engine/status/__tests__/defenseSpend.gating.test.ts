import { beforeAll, describe, expect, it } from "vitest";
import { spendStatus, setStacks } from "../runtime";
import { defineStatus, getStatus } from "../registry";

const STATUS_ID = "chi_gating_test";

const ensureStatusDefined = () => {
  if (!getStatus(STATUS_ID)) {
    defineStatus({
      id: STATUS_ID,
      kind: "positive",
      name: "Chi (test)",
      icon: "C",
      spend: {
        costStacks: 1,
        allowedPhases: ["defenseRoll"],
        apply: (ctx) => ({
          bonusBlock: 2,
          log: `+2 block (baseBlock=${ctx.baseBlock ?? 0})`,
        }),
      },
    });
  }
};

beforeAll(() => {
  ensureStatusDefined();
});

describe("defense spend gating when base block is zero", () => {
  it("rejects chi spends if baseBlock <= 0", () => {
    const stacks = setStacks({}, STATUS_ID, 2);

    const result = spendStatus(stacks, STATUS_ID, "defenseRoll", {
      phase: "defenseRoll",
      baseBlock: 0,
    });

    expect(result).toBeNull();
  });

  it("accepts chi spends when baseBlock > 0", () => {
    const stacks = setStacks({}, STATUS_ID, 2);

    const result = spendStatus(stacks, STATUS_ID, "defenseRoll", {
      phase: "defenseRoll",
      baseBlock: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.spend.bonusBlock).toBe(2);
  });
});
