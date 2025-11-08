import { beforeAll, describe, expect, it } from "vitest";
import { applyAttackStatusSpends } from "../statusSpends";
import { buildDefensePlan } from "../../game/combat/defensePipeline";
import {
  defineStatus,
  getStatus,
  type StatusId,
  type StatusSpendSummary,
} from "../../engine/status";
import type { PlayerState } from "../../game/types";

const stubHero = {
  id: "test_hero",
  name: "Test Hero",
  maxHp: 30,
  offensiveBoard: {},
  defensiveBoard: {},
  ai: { chooseHeld: () => [false, false, false, false, false] },
};

beforeAll(() => {
  if (!getStatus("rage")) {
    defineStatus({
      id: "rage",
      name: "Rage",
      icon: "R",
      polarity: "positive",
      activation: "active",
      windows: ["attack:roll"],
      behaviorId: "bonus_pool",
      behaviorConfig: {
        attack: { bonusDamagePerStack: 2 },
      },
      spend: {
        costStacks: 1,
        allowedPhases: ["attackRoll"],
      },
    });
  }
});

describe("status spends runtime", () => {
  it('applies "Chi" attack spend through the bonus pool handler', () => {
    const result = applyAttackStatusSpends({
      requests: { chi: 1 },
      tokens: { chi: 1 },
      baseDamage: 4,
      getBudget: () => 3,
      consumeBudget: () => {},
    });

    expect(result.bonusDamage).toBe(1);
    expect(result.statusSpends).toHaveLength(1);
  });

  it('applies "Rage" with its own config but the same handler', () => {
    const result = applyAttackStatusSpends({
      requests: { rage: 1 },
      tokens: { rage: 1 },
      baseDamage: 3,
      getBudget: () => 5,
      consumeBudget: () => {},
    });

    expect(result.bonusDamage).toBe(2);
  });

  it('rejects "Evasive" during attackRoll without calling the reaction handler', () => {
    const result = applyAttackStatusSpends({
      requests: { evasive: 1 },
      tokens: { evasive: 1 },
      baseDamage: 5,
      getBudget: () => 1,
      consumeBudget: () => {},
    });

    expect(result.bonusDamage).toBe(0);
    expect(result.statusSpends).toHaveLength(0);
  });

  it('applies "Chi" during defense via buildDefensePlan and grants block', () => {
    const defender: PlayerState = {
      hero: stubHero,
      hp: 20,
      tokens: { chi: 1 },
    };

    const plan = buildDefensePlan({
      defender,
      incomingDamage: 7,
      baseResolution: {
        selection: {
          roll: { dice: [], combos: [], options: [] },
          selected: null,
        },
        baseBlock: 3,
        reflect: 0,
        heal: 0,
        appliedTokens: {},
        retaliatePercent: 0,
      },
      spendRequests: { chi: 1 },
    });

    const spends: StatusSpendSummary[] = plan.defense.statusSpends;
    expect(spends).toHaveLength(1);
    expect(spends[0].id).toBe("chi");
    expect(spends[0].bonusBlock).toBeGreaterThanOrEqual(1);
  });
});
