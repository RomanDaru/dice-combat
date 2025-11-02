import { describe, expect, it } from "vitest";
import { adjustDefenseWithChi, buildDefensePlan } from "../defensePipeline";
import { HEROES } from "../../heroes";
import type { BaseDefenseResolution } from "../types";
import type { PlayerState } from "../../types";
import { aggregateStatusSpendSummaries, getStacks } from "../../../engine/status";

const createBaseResolution = (
  overrides: Partial<BaseDefenseResolution> = {}
): BaseDefenseResolution => ({
  selection: {
    roll: { dice: [1, 2, 3, 4, 5], combos: [], options: [] },
    selected: null,
  },
  baseBlock: 2,
  reflect: 0,
  heal: 0,
  appliedTokens: {},
  ...overrides,
});

const createPlayer = (chi: number): PlayerState => ({
  hero: HEROES.Pyromancer,
  hp: 20,
  tokens: { burn: 0, chi, evasive: 0 },
});

describe("defensePipeline", () => {
  it("conserves outcome when no chi is spent", () => {
    const defender = createPlayer(0);
    const baseResolution = createBaseResolution();

    const result = adjustDefenseWithChi({
      defender,
      incomingDamage: 6,
      baseResolution,
      requestedChi: 2,
    });

    expect(result.resolution.statusSpends).toHaveLength(0);
    expect(getStacks(result.defenderAfter.tokens, "chi", 0)).toBe(0);
    expect(result.resolution.baseBlock).toBe(baseResolution.baseBlock);
  });

  it("spends chi to reduce incoming damage", () => {
    const defender = createPlayer(3);
    const baseResolution = createBaseResolution();

    const result = adjustDefenseWithChi({
      defender,
      incomingDamage: 6,
      baseResolution,
      requestedChi: 2,
    });

    expect(result.resolution.statusSpends).toHaveLength(1);
    const spend = result.resolution.statusSpends[0];
    expect(spend.id).toBe("chi");
    expect(spend.stacksSpent).toBe(2);
    expect(getStacks(result.defenderAfter.tokens, "chi", 0)).toBe(1);
    const totals = aggregateStatusSpendSummaries(result.resolution.statusSpends);
    expect(result.resolution.baseBlock).toBe(baseResolution.baseBlock);
    expect(totals.bonusBlock).toBeGreaterThan(0);
    expect(result.resolution.baseBlock + totals.bonusBlock).toBe(6);
  });

  it("builds defense plan with chi spend applied", () => {
    const defender = createPlayer(2);
    const baseResolution = createBaseResolution({ baseBlock: 2 });

    const plan = buildDefensePlan({
      defender,
      incomingDamage: 6,
      baseResolution,
      requestedChi: 1,
    });

    expect(plan.defense.statusSpends).toHaveLength(1);
    const spend = plan.defense.statusSpends[0];
    expect(spend.id).toBe("chi");
    expect(spend.stacksSpent).toBe(1);
    expect(getStacks(plan.defenderAfter.tokens, "chi", 0)).toBe(1);
    const totals = aggregateStatusSpendSummaries(plan.defense.statusSpends);
    expect(plan.defense.baseBlock).toBe(baseResolution.baseBlock);
    expect(plan.defense.baseBlock + totals.bonusBlock).toBeGreaterThan(
      baseResolution.baseBlock
    );
  });
});


