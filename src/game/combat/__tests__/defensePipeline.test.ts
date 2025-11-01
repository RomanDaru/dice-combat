import { describe, expect, it } from "vitest";
import { adjustDefenseWithChi, buildDefensePlan } from "../defensePipeline";
import { HEROES } from "../../heroes";
import type { BaseDefenseResolution } from "../types";
import type { PlayerState } from "../../types";
import { selectDefenseOptionByCombo, resolveDefenseSelection } from "../defenseBoard";

const createBaseResolution = (
  overrides: Partial<BaseDefenseResolution> = {}
): BaseDefenseResolution => ({
  selection: {
    roll: { dice: [1, 2, 3, 4, 5], combos: [], options: [] },
    selected: null,
  },
  block: 2,
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

    expect(result.resolution.chiSpent).toBe(0);
    expect(result.defenderAfter.tokens.chi).toBe(0);
    expect(result.resolution.block).toBe(baseResolution.block);
    expect(result.resolution.chiBonusBlock).toBe(0);
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

    expect(result.resolution.chiSpent).toBe(2);
    expect(result.defenderAfter.tokens.chi).toBe(1);
    expect(result.resolution.block).toBe(6);
    expect(result.resolution.chiBonusBlock).toBe(
      result.resolution.block - baseResolution.block
    );
  });

  it("builds defense plan with chi spend applied", () => {
    const defender = createPlayer(2);
    const baseResolution = resolveDefenseSelection(
      selectDefenseOptionByCombo(
        { dice: [1, 1, 1, 1, 1], combos: [], options: [] },
        null
      )
    );

    const plan = buildDefensePlan({
      defender,
      incomingDamage: 6,
      baseResolution,
      requestedChi: 1,
    });

    expect(plan.defense.chiSpent).toBe(1);
    expect(plan.defenderAfter.tokens.chi).toBe(1);
    expect(plan.defense.block).toBe(baseResolution.block + 1);
    expect(plan.defense.chiBonusBlock).toBe(1);
  });
});

