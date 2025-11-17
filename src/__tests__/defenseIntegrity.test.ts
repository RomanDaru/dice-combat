import { describe, it, expect } from "vitest";
import { StatsTracker } from "../stats/tracker";

describe("defense integrity drift logging", () => {
  it("counts drift and logs readable diff when schema.finalDamage != actualDamage", () => {
    const stats = new StatsTracker();
    stats.beginGame({
      heroId: "Pyromancer" as any,
      opponentHeroId: "Training Dummy" as any,
      seed: 123,
      defenseMeta: { enableDefenseV2: true, defenseDslVersion: "test" },
    });

    const turnId = "turn_test_integrity_1";
    // Raw 5, actual 3, schema.finalDamage incorrectly says 4 -> drift
    stats.recordTurn({
      id: turnId,
      gameId: "game_x" as any,
      turnId,
      round: 1,
      attackerSide: "ai",
      defenderSide: "you",
      actualDamage: 3,
      damageWithoutBlock: 5,
      damageBlocked: 1,
      damagePrevented: 1,
      phaseDamage: { attack: 5, collateral: 0, counter: 0, upkeepDot: 0 },
      defenseSchema: {
        schemaHash: null,
        dice: [],
        checkpoints: {
          rawDamage: 5,
          afterFlat: 5,
          afterPrevent: 4,
          afterBlock: 4,
          afterReflect: 4,
          finalDamage: 4,
        },
        damageApplied: 3,
        rulesHit: [],
      },
    } as any);

    const snapshot = stats.finalizeGame({
      hp: { you: 27, ai: 30 },
      winner: "ai",
      roundsPlayed: 1,
    });
    expect(snapshot).not.toBeNull();
    const game = snapshot!.gameStats!;
    expect(game.integrity?.log).toMatch(/schema\.finalDamage=4 vs applied=3/);
    expect(game.defenseMeta?.totals?.schemaDamageDriftCount).toBeGreaterThanOrEqual(1);
  });

  it("counts drift when only damageApplied is provided", () => {
    const stats = new StatsTracker();
    stats.beginGame({
      heroId: "Pyromancer" as any,
      opponentHeroId: "Training Dummy" as any,
      seed: 456,
      defenseMeta: { enableDefenseV2: true, defenseDslVersion: "test" },
    });

    const turnId = "turn_test_integrity_2";
    stats.recordTurn({
      id: turnId,
      gameId: "game_x" as any,
      turnId,
      round: 1,
      attackerSide: "ai",
      defenderSide: "you",
      damageWithoutBlock: 5,
      damageBlocked: 1,
      damagePrevented: 1,
      phaseDamage: { attack: 5, collateral: 0, counter: 0, upkeepDot: 0 },
      defenseSchema: {
        schemaHash: null,
        dice: [],
        checkpoints: {
          rawDamage: 5,
          afterFlat: 5,
          afterPrevent: 4,
          afterBlock: 4,
          afterReflect: 4,
          finalDamage: 4,
        },
        damageApplied: 2,
        rulesHit: [],
      },
    } as any);

    const snapshot = stats.finalizeGame({
      hp: { you: 27, ai: 30 },
      winner: "ai",
      roundsPlayed: 1,
    });

    expect(snapshot).not.toBeNull();
    const game = snapshot!.gameStats!;
    expect(game.integrity?.log).toMatch(/schema\.finalDamage=4 vs applied=2/);
    expect(game.defenseMeta?.totals?.schemaDamageDriftCount).toBeGreaterThanOrEqual(1);
  });
});
