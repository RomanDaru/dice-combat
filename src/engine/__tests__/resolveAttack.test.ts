import { beforeAll, describe, expect, it } from "vitest";
import { resolveAttack } from "../resolveAttack";
import {
  createStatusSpendSummary,
  defineStatus,
  type StatusSpendApplyResult,
} from "../status";
import { createInitialState } from "../../game/state";
import { HEROES } from "../../game/heroes";
import type {
  OffensiveAbility,
  PlayerState,
  Tokens,
} from "../../game/types";
import type { ResolvedDefenseState } from "../../game/combat/types";

const makeDefenseState = (
  overrides: Partial<ResolvedDefenseState> = {}
): ResolvedDefenseState => ({
  selection: {
    roll: { dice: [], combos: [], options: [] },
    selected: null,
  },
  baseBlock: 0,
  reflect: 0,
  heal: 0,
  appliedTokens: {},
  retaliatePercent: 0,
  statusSpends: [],
  ...overrides,
});

const clonePlayer = (player: PlayerState, tokens?: Tokens): PlayerState => ({
  ...player,
  tokens: tokens ? { ...tokens } : { ...player.tokens },
});

const chiSpend = (
  bonus: Partial<StatusSpendApplyResult>
) =>
  createStatusSpendSummary("chi", 1, [
    {
      log: "chi spend",
      ...bonus,
    },
  ]);

describe("resolveAttack with modifiers", () => {
  beforeAll(() => {
    defineStatus({
      id: "test_damage_suppression",
      kind: "positive",
      name: "Damage Suppression",
      icon: "S",
      priority: 10,
      onModify: (_instance, ctx) => ({
        baseDamage: 0,
        log: "Damage suppressed.",
      }),
    });

    defineStatus({
      id: "test_block_fortify",
      kind: "positive",
      name: "Block Fortify",
      icon: "B",
      priority: 5,
      onModify: (_instance, ctx) => ({
        baseBlock: ctx.baseBlock + 2,
        log: "Block +2.",
      }),
    });
  });

  it("ignores damage spends when modifiers reduce base damage to zero", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai, {
      ...baseState.players.ai.tokens,
      test_damage_suppression: 1,
    });

    const ability: OffensiveAbility = {
      combo: "3OAK",
      damage: 5,
      label: "Test Strike",
    };

    const resolution = resolveAttack({
      source: "player",
      attackerSide: "you",
      defenderSide: "ai",
      attacker,
      defender,
      ability,
      baseDamage: ability.damage,
      attackStatusSpends: [chiSpend({ bonusDamage: 3 })],
      defense: { resolution: null },
    });

    expect(resolution.updatedDefender.hp).toBe(defender.hp);
    expect(
      resolution.logs.some((line) => line.includes("receives 0 dmg"))
    ).toBe(true);
  });

  it("applies defense modifiers before spends to reduce final damage", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai, {
      ...baseState.players.ai.tokens,
      test_block_fortify: 1,
    });

    const ability: OffensiveAbility = {
      combo: "3OAK",
      damage: 6,
      label: "Heavy Strike",
    };

    const defenseResolution = makeDefenseState({
      baseBlock: 1,
      statusSpends: [chiSpend({ bonusBlock: 1 })],
    });

    const resolution = resolveAttack({
      source: "player",
      attackerSide: "you",
      defenderSide: "ai",
      attacker,
      defender,
      ability,
      baseDamage: ability.damage,
      attackStatusSpends: [],
      defense: { resolution: defenseResolution },
    });

    const expectedDamage = 2;
    expect(resolution.updatedDefender.hp).toBe(defender.hp - expectedDamage);
    expect(
      resolution.logs.some((line) => line.includes("receives 2 dmg"))
    ).toBe(true);
  });

  it("combines base and bonus block without double counting spends", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai);

    const offense: OffensiveAbility = {
      combo: "5OAK",
      damage: 10,
      label: "Crushing Blow",
    };

    const defenseAbility = {
      combo: "FULL_HOUSE",
      ability: {
        combo: "FULL_HOUSE",
        block: 4,
        label: "Guard Stance",
      },
    } as ResolvedDefenseState["selection"]["selected"];

    const defenseResolution = makeDefenseState({
      baseBlock: 4,
      statusSpends: [chiSpend({ bonusBlock: 2, log: "+2 block" })],
      selection: {
        roll: { dice: [], combos: [], options: [] },
        selected: defenseAbility,
      },
    });

    const resolution = resolveAttack({
      source: "player",
      attackerSide: "you",
      defenderSide: "ai",
      attacker,
      defender,
      ability: offense,
      baseDamage: offense.damage,
      attackStatusSpends: [],
      defense: { resolution: defenseResolution },
    });

    expect(resolution.updatedDefender.hp).toBe(defender.hp - 4);
    expect(
      resolution.logs.some((line) => line.includes("Block 4"))
    ).toBe(true);
    expect(
      resolution.logs.some((line) => line.includes("+2 block"))
    ).toBe(true);
  });

  it("short-circuits attack when defense negates incoming damage", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai);

    const offense: OffensiveAbility = {
      combo: "4OAK",
      damage: 12,
      label: "Wild Inferno",
    };

    const resolution = resolveAttack({
      source: "player",
      attackerSide: "you",
      defenderSide: "ai",
      attacker,
      defender,
      ability: offense,
      baseDamage: offense.damage,
      attackStatusSpends: [],
      defense: {
        resolution: makeDefenseState({
          statusSpends: [
            createStatusSpendSummary("evasive", 1, [
              { negateIncoming: true, success: true, log: "Dodge!" },
            ]),
          ],
        }),
      },
    });

    expect(resolution.updatedDefender.hp).toBe(defender.hp);
    expect(resolution.updatedAttacker.hp).toBe(attacker.hp);
    expect(resolution.fx).toHaveLength(0);
    expect(
      resolution.logs.some((line) => line.includes("receives 0 dmg"))
    ).toBe(true);
  });
});
