import { describe, expect, it } from "vitest";
import { buildDefensePlan } from "../defensePipeline";
import { defineStatus, getStacks } from "../../../engine/status";
import type { OffensiveAbility, PlayerState } from "../../types";
import { HEROES } from "../../heroes";
import { resolveAttack } from "../../../engine/resolveAttack";

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

  it("converts Chi spends into bonus block and consumes the stacks", () => {
    const defender: PlayerState = {
      hero: HEROES["Shadow Monk"],
      hp: HEROES["Shadow Monk"].maxHp,
      tokens: { chi: 3 },
    };
    const attacker: PlayerState = {
      hero: HEROES["Pyromancer"],
      hp: HEROES["Pyromancer"].maxHp,
      tokens: {},
    };

    const baseResolution = {
      selection: {
        roll: { dice: [], combos: [], options: [] },
        selected: null,
      },
      baseBlock: 2,
      reflect: 0,
      heal: 0,
      appliedTokens: {},
      retaliatePercent: 0,
    };

    const plan = buildDefensePlan({
      defender,
      incomingDamage: 7,
      baseResolution,
      spendRequests: { chi: 3 },
    });

    const chiSpend = plan.defense.statusSpends.find(
      (spend) => spend.id === "chi"
    );
    expect(chiSpend).toBeDefined();
    expect(chiSpend?.stacksSpent).toBe(3);
    expect(chiSpend?.bonusBlock).toBe(3);
    expect(getStacks(plan.defenderAfter.tokens, "chi", 0)).toBe(0);

    const attackAbility =
      (HEROES["Pyromancer"].offensiveBoard["3OAK"] as OffensiveAbility) ?? {
        combo: "3OAK",
        damage: 7,
        label: "Test Strike",
      };

    const resolution = resolveAttack({
      source: "ai",
      attackerSide: "ai",
      defenderSide: "you",
      attacker,
      defender: plan.defenderAfter,
      ability: attackAbility,
      baseDamage: attackAbility.damage,
      attackStatusSpends: [],
      defense: { resolution: plan.defense },
    });

    expect(resolution.summary.blocked).toBe(5);
    expect(resolution.summary.damageDealt).toBe(
      Math.max(0, attackAbility.damage - 5)
    );
  });
});
