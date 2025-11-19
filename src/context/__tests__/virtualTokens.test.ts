import { describe, expect, it } from "vitest";
import type { Hero, PendingDefenseBuff, PlayerState, Tokens } from "../../game/types";
import { deriveVirtualTokensForSide } from "../virtualTokens";

const createHero = (): Hero => ({
  id: "test_hero",
  name: "Test Hero",
  maxHp: 30,
  offensiveBoard: {},
  defensiveBoard: {},
  ai: {
    chooseHeld: () => [false, false, false, false, false],
  },
});

const createPlayer = (tokens: Tokens): PlayerState => ({
  hero: createHero(),
  hp: 30,
  tokens,
});

describe("virtual token derivation", () => {
  it("ignores pending grants until their usable phase fires", () => {
    const player = createPlayer({ chi: 1 });
    const pendingBuffs: PendingDefenseBuff[] = [
      {
        id: "buff1",
        owner: "you",
        kind: "status",
        statusId: "chi",
        stacks: 2,
        usablePhase: "nextDefenseCommit",
        createdAt: { round: 1, turnId: "turn1" },
      },
    ];

    const result = deriveVirtualTokensForSide({
      player,
      side: "you",
      attackStatusRequests: {},
      defenseStatusRequests: { chi: 1 },
      pendingDefenseBuffs: pendingBuffs,
    });

    expect(result.tokens.chi ?? 0).toBe(0);
    expect(result.breakdown.pendingBuffSummary).toHaveLength(1);
    expect(result.breakdown.pendingBuffSummary[0]).toMatchObject({
      statusId: "chi",
      usablePhase: "nextDefenseCommit",
    });
  });
});
