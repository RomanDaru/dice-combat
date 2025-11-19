import { describe, expect, it } from "vitest";

import { resolveDefenseSchemaRoll } from "../defenseSchemaRuntime";
import type { Hero, PlayerState } from "../../types";

const stubAi = () => [false, false, false, false, false];

const schemaHero: Hero = {
  id: "monk-test",
  name: "Monk Test",
  maxHp: 30,
  offensiveBoard: {},
  defensiveBoard: {},
  ai: { chooseHeld: stubAi },
  defenseVersion: "v2",
  defenseSchema: {
    dice: 4,
    fields: [
      { id: "LOW_123", faces: [1, 2, 3], label: "Low" },
      { id: "MID_45", faces: [4, 5], label: "Chi" },
    ],
    rules: [
      {
        id: "chi_gain",
        label: "Gain Chi",
        matcher: { type: "countField", fieldId: "MID_45" },
        effects: [
          {
            type: "gainStatus",
            status: "chi",
            amount: 1,
            stackCap: 3,
          },
        ],
      },
    ],
  },
};

const makePlayer = (tokens: PlayerState["tokens"] = {}): PlayerState => ({
  hero: schemaHero,
  hp: schemaHero.maxHp,
  tokens: { ...tokens },
});

describe("defenseSchemaRuntime - gainStatus handling", () => {
  it("queues chi gains for the next turn", () => {
    const result = resolveDefenseSchemaRoll({
      hero: schemaHero,
      dice: [4, 4, 5, 2],
      attacker: makePlayer(),
      defender: makePlayer({ chi: 1 }),
      incomingDamage: 6,
    });

    expect(result.updatedDefender.tokens.chi).toBe(1);
    expect(result.pendingStatusGrants).toHaveLength(1);
    expect(result.pendingStatusGrants[0]).toMatchObject({
      status: "chi",
      stacks: 3,
      stackCap: 3,
      usablePhase: "nextTurn",
    });
  });

  it("honors stack caps when those gains resolve", () => {
    const result = resolveDefenseSchemaRoll({
      hero: schemaHero,
      dice: [4, 4, 5, 5],
      attacker: makePlayer(),
      defender: makePlayer({ chi: 5 }),
      incomingDamage: 6,
    });

    expect(result.updatedDefender.tokens.chi).toBe(5);
    expect(result.pendingStatusGrants).toHaveLength(1);
    const grant = result.pendingStatusGrants[0];
    const currentStacks = 5;
    const cap = grant.stackCap ?? currentStacks + grant.stacks;
    const nextStacks = Math.min(cap, currentStacks + grant.stacks);
    expect(nextStacks).toBe(3);
  });

  it("throws when dice count does not match the schema definition", () => {
    expect(() =>
      resolveDefenseSchemaRoll({
        hero: schemaHero,
        dice: [4, 4, 5],
        attacker: makePlayer(),
        defender: makePlayer(),
        incomingDamage: 4,
      })
    ).toThrow(/expected 4 dice but received 3/i);
  });
});
