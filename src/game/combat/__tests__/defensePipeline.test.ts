import { describe, expect, it } from "vitest";
import { buildDefensePlan } from "../defensePipeline";
import { defineStatus } from "../../../engine/status";
import type { PlayerState } from "../../types";

const stubHero = {
  id: "tester",
  name: "Tester",
  maxHp: 30,
  offensiveBoard: {},
  defensiveBoard: {},
  ai: {
    chooseHeld: () => [false, false, false, false, false],
  },
};

defineStatus({
  id: "test_defense_pool",
  name: "Test Guard",
  icon: "TG",
  polarity: "positive",
  activation: "active",
  windows: ["defense:afterRoll"],
  behaviorId: "bonus_pool",
  behaviorConfig: {
    defense: { bonusBlockPerStack: 2 },
  },
  spend: {
    costStacks: 1,
    allowedPhases: ["defenseRoll"],
  },
});

describe("buildDefensePlan", () => {
  it("spends requested defensive statuses regardless of ID", () => {
    const defender: PlayerState = {
      hero: stubHero,
      hp: 18,
      tokens: { test_defense_pool: 3 },
    };

    const result = buildDefensePlan({
      defender,
      incomingDamage: 10,
      baseResolution: {
        selection: {
          roll: { dice: [], combos: [], options: [] },
          selected: null,
        },
        baseBlock: 4,
        reflect: 0,
        heal: 0,
        appliedTokens: {},
        retaliatePercent: 0,
      },
      spendRequests: { test_defense_pool: 2 },
    });

    expect(result.defense.statusSpends).toHaveLength(1);
    const spend = result.defense.statusSpends[0];
    expect(spend.id).toBe("test_defense_pool");
    expect(spend.stacksSpent).toBe(2);
    expect(spend.bonusBlock).toBe(4);
    expect(result.defenderAfter.tokens.test_defense_pool).toBe(1);
  });
});
