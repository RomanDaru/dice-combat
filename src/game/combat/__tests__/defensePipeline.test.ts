import { describe, expect, it } from "vitest";
import { adjustDefenseWithChi, buildDefensePlan } from "../defensePipeline";
import { HEROES } from "../../heroes";
import type { DefenseCalculationResult, PlayerState } from "../../types";

const createDefenseOutcome = (
  overrides: Partial<DefenseCalculationResult>
): DefenseCalculationResult => ({
  threatenedDamage: 6,
  defenseRoll: 4,
  baseBlock: 2,
  baseBlockLog: "Base Block 2",
  modifiersApplied: [],
  totalBlock: 2,
  totalReflect: 0,
  damageDealt: 4,
  finalAttackerHp: 20,
  finalDefenderHp: 16,
  maxAttackerHp: 20,
  maxDefenderHp: 20,
  attackerName: "Attacker",
  defenderName: "Defender",
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
    const outcome = createDefenseOutcome({});

    const result = adjustDefenseWithChi({
      defender,
      abilityDamage: 6,
      defenseOutcome: outcome,
      requestedChi: 2,
    });

    expect(result.chiSpent).toBe(0);
    expect(result.defenderAfter.tokens.chi).toBe(0);
    expect(result.defenseOutcome.totalBlock).toBe(outcome.totalBlock);
    expect(result.defenseOutcome.damageDealt).toBe(outcome.damageDealt);
  });

  it("spends chi to reduce incoming damage", () => {
    const defender = createPlayer(3);
    const outcome = createDefenseOutcome({});

    const result = adjustDefenseWithChi({
      defender,
      abilityDamage: 6,
      defenseOutcome: outcome,
      requestedChi: 2,
    });

    expect(result.chiSpent).toBe(2);
    expect(result.defenderAfter.tokens.chi).toBe(1);
    expect(result.defenseOutcome.totalBlock).toBe(4);
    expect(result.defenseOutcome.damageDealt).toBe(2);
    expect(result.defenseOutcome.modifiersApplied.at(-1)?.id).toBe(
      "chi_spent_block"
    );
  });

  it("builds defense plan with manual defense log", () => {
    const defender = createPlayer(2);
    const outcome = createDefenseOutcome({});

    const plan = buildDefensePlan({
      defender,
      abilityDamage: 6,
      defenseOutcome: outcome,
      defenseRoll: 3,
      requestedChi: 1,
    });

    expect(plan.chiSpent).toBe(1);
    expect(plan.defenderAfter.tokens.chi).toBe(1);
    expect(plan.defense.manualDefense?.chiUsed).toBe(1);
    expect(plan.defense.defenseChiSpend).toBe(1);
    expect(plan.defense.defenseRoll).toBe(3);
  });
});

