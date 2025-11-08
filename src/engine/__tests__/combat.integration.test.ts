import { describe, it, expect } from "vitest";
import { resolveAttack } from "../resolveAttack";
import type { PlayerState, OffensiveAbility, Hero } from "../../game/types";
import type { StatusSpendSummary } from "../status";

const stubHero = (name: string): Hero => ({
  id: name.toLowerCase().replace(/\s+/g, "_"),
  name,
  maxHp: 30,
  offensiveBoard: {},
  defensiveBoard: {},
  ai: {
    chooseHeld: () => [false, false, false, false, false],
  },
});

function mkPlayer(partial: Partial<PlayerState>): PlayerState {
  return {
    hero: partial.hero ?? stubHero("Hero"),
    hp: partial.hp ?? 30,
    tokens: partial.tokens ?? {},
    ...partial,
  };
}

function spendSummary(
  id: string,
  stacks: number,
  bonus: Partial<Pick<StatusSpendSummary, "bonusDamage" | "bonusBlock">> = {}
): StatusSpendSummary {
  return {
    id: id as any,
    stacksSpent: stacks,
    spends: [],
    logs: [],
    bonusDamage: bonus.bonusDamage ?? 0,
    bonusBlock: bonus.bonusBlock ?? 0,
    results: [],
  };
}

const stubAbility = (overrides: Partial<OffensiveAbility> = {}): OffensiveAbility => ({
  combo: overrides.combo ?? "3OAK",
  damage: overrides.damage ?? 0,
  ...overrides,
});

describe("combat engine – resolveAttack integration", () => {
  it("applies attack bonuses, defense block, reflect, and emits detailed summary", () => {
    const attacker = mkPlayer({
      hp: 28,
      hero: stubHero("Blade Monk"),
    });
    const defender = mkPlayer({
      hp: 22,
      hero: stubHero("Ice Golem"),
    });

    const baseDamage = 10;
    const attackStatusSpends: StatusSpendSummary[] = [
      spendSummary("chi", 3, { bonusDamage: 3 }),
    ];

    const defenseResolution = {
      selection: {
        roll: { dice: [1, 2, 3, 4, 5], options: [], combos: [] },
        selected: null,
      },
      baseBlock: 5,
      reflect: 2,
      heal: 0,
      appliedTokens: {},
      retaliatePercent: 0,
      statusSpends: [spendSummary("icewall", 1, { bonusBlock: 2 })],
    };

    const res = resolveAttack({
      source: "player",
      attackerSide: "you",
      defenderSide: "ai",
      attacker,
      defender,
      ability: stubAbility({ combo: "4OAK", damage: baseDamage, label: "Slash" }),
      baseDamage,
      attackStatusSpends,
      defense: { resolution: defenseResolution },
    });

    const expectedDamageToDefender = 6; // (10 + 3) - (5 + 2)
    const expectedReflectToAttacker = 2;

    expect(res.updatedDefender.hp).toBe(defender.hp - expectedDamageToDefender);
    expect(res.updatedAttacker.hp).toBe(attacker.hp - expectedReflectToAttacker);

    expect(
      res.fx.some(
        (fx) => fx.kind === "hit" && fx.side === "ai" && fx.amount === expectedDamageToDefender
      )
    ).toBe(true);
    expect(
      res.fx.some(
        (fx) =>
          fx.kind === "reflect" && fx.side === "you" && fx.amount === expectedReflectToAttacker
      )
    ).toBe(true);

    const summary = res.summary;
    expect(summary.damageDealt).toBe(expectedDamageToDefender);
    expect(summary.blocked).toBe(7);
    expect(summary.reflected).toBe(expectedReflectToAttacker);
    expect(summary.negated ?? false).toBe(false);
    expect(summary.attackerDefeated).toBe(false);
    expect(summary.defenderDefeated).toBe(false);

    expect(res.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "TURN_END",
          payload: expect.objectContaining({
            next: "ai",
            prePhase: "turnTransition",
          }),
        }),
      ])
    );
  });

  it("marks lethal reflect correctly and clamps damage at zero", () => {
    const attacker = mkPlayer({
      hp: 2,
      hero: stubHero("Glass Rogue"),
    });
    const defender = mkPlayer({
      hp: 4,
      hero: stubHero("Thorn Knight"),
    });

    const baseDamage = 3;

    const defenseResolution = {
      selection: { roll: { dice: [6, 6, 6], options: [], combos: [] }, selected: null },
      baseBlock: 5,
      reflect: 3,
      heal: 0,
      appliedTokens: {},
      retaliatePercent: 0,
      statusSpends: [],
    };

    const res = resolveAttack({
      source: "player",
      attackerSide: "you",
      defenderSide: "ai",
      attacker,
      defender,
      ability: stubAbility({ combo: "3OAK", damage: baseDamage, label: "Poke" }),
      baseDamage,
      attackStatusSpends: [],
      defense: { resolution: defenseResolution },
    });

    expect(res.updatedDefender.hp).toBe(defender.hp);
    expect(res.updatedAttacker.hp).toBeLessThanOrEqual(0);

    const summary = res.summary;
    expect(summary.damageDealt).toBe(0);
    expect(summary.blocked).toBeGreaterThanOrEqual(baseDamage);
    expect(summary.reflected).toBe(2);
    expect(summary.attackerDefeated).toBe(true);
    expect(summary.defenderDefeated).toBe(false);
  });
});
