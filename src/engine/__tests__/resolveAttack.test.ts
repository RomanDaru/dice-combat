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

    defineStatus({
      id: "test_block_nullify",
      kind: "negative",
      name: "Block Nullify",
      icon: "N",
      priority: 1,
      onModify: () => ({
        baseBlock: 0,
        log: "Block removed.",
      }),
    });

    defineStatus({
      id: "test_block_seed",
      kind: "positive",
      name: "Block Seed",
      icon: "S",
      priority: 3,
      onModify: (_instance, ctx) => ({
        baseBlock: Math.max(ctx.baseBlock, 1),
        log: "Seed block 1.",
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

  it("ignores defense spends when modifiers reduce base block to zero", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai, {
      ...baseState.players.ai.tokens,
      test_block_nullify: 1,
    });

    const ability: OffensiveAbility = {
      combo: "4OAK",
      damage: 8,
      label: "Null Strike",
    };

    const defenseResolution = makeDefenseState({
      baseBlock: 3,
      statusSpends: [chiSpend({ bonusBlock: 2, log: "+2 block" })],
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

    expect(resolution.updatedDefender.hp).toBe(defender.hp - ability.damage);
  });

  it("clamps damage to zero when block fully absorbs the attack", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai);

    const ability: OffensiveAbility = {
      combo: "PAIR_PAIR",
      damage: 5,
      label: "Soft Hit",
    };

    const defenseResolution = makeDefenseState({
      baseBlock: 8,
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

    expect(resolution.updatedDefender.hp).toBe(defender.hp);
    expect(
      resolution.logs.some((line) => line.includes("receives 0 dmg"))
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
          reflect: 4,
          retaliatePercent: 0.5,
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

  it("applies pure base block without logging spends", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai);

    const ability: OffensiveAbility = {
      combo: "3OAK",
      damage: 7,
      label: "Solid Punch",
    };

    const defenseAbility = {
      combo: "FULL_HOUSE",
      ability: {
        combo: "FULL_HOUSE",
        block: 5,
        label: "Iron Wall",
      },
    } as ResolvedDefenseState["selection"]["selected"];

    const defenseResolution = makeDefenseState({
      baseBlock: 5,
      statusSpends: [],
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
      ability,
      baseDamage: ability.damage,
      attackStatusSpends: [],
      defense: { resolution: defenseResolution },
    });

    expect(resolution.updatedDefender.hp).toBe(defender.hp - 2);
    expect(
      resolution.logs.every((line) => !line.includes("Spend:"))
    ).toBe(true);
  });

  it("does not allow Chi block spend when base block is 0", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai);

    const offense: OffensiveAbility = {
      combo: "3OAK",
      damage: 7,
      label: "Chi Punch",
    };

    const defenseResolution = makeDefenseState({
      baseBlock: 0,
      statusSpends: [chiSpend({ bonusBlock: 3, log: "+3 block" })],
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

    expect(resolution.updatedDefender.hp).toBe(defender.hp - offense.damage);
    expect(
      resolution.logs.some((line) => line.includes("+3 block"))
    ).toBe(false);
  });

  it("applies defense spends when modifiers grant base block", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai, {
      ...baseState.players.ai.tokens,
      test_block_seed: 1,
    });

    const offense: OffensiveAbility = {
      combo: "5OAK",
      damage: 5,
      label: "Precision Shot",
    };

    const defenseResolution = makeDefenseState({
      baseBlock: 0,
      statusSpends: [chiSpend({ bonusBlock: 2, log: "+2 block" })],
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

    expect(resolution.updatedDefender.hp).toBe(defender.hp - 2);
    expect(
      resolution.logs.some((line) => line.includes("+2 block"))
    ).toBe(true);
  });

  it("does not report block from overkill when defender had low HP", () => {
    const baseState = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );
    const attacker = clonePlayer(baseState.players.you);
    const defender = clonePlayer(baseState.players.ai);
    defender.hp = 1;

    const offense: OffensiveAbility = {
      combo: "PAIR_PAIR",
      damage: 4,
      label: "Two pairs",
    };

    const defenseResolution = makeDefenseState({
      baseBlock: 0,
      statusSpends: [],
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

    expect(resolution.updatedDefender.hp).toBe(0);
    const combinedLogs = resolution.logs.join(" ");
    expect(combinedLogs).not.toMatch(/blocked 3/i);
    expect(combinedLogs).toMatch(/receives 1 dmg/i);
  });
});
