import { describe, it, expect } from "vitest";
import { StatsTracker } from "../stats/tracker";

describe("defense telemetry totals", () => {
  it("aggregates defenseMeta.totals via updateGameMeta", () => {
    const stats = new StatsTracker();
    stats.beginGame({
      heroId: "TestHero" as any,
      opponentHeroId: "TestOpponent" as any,
      seed: 123,
      defenseMeta: {
        enableDefenseV2: true,
        defenseDslVersion: "test",
      },
    });

    stats.updateGameMeta({
      defenseMeta: {
        enableDefenseV2: true,
        defenseDslVersion: "test",
        totals: {
          blockFromDefenseRoll: 0,
          blockFromStatuses: 0,
          preventHalfEvents: 0,
          preventAllEvents: 0,
          reflectSum: 0,
          wastedBlockSum: 0,
          schemaDamageDriftCount: 2,
        },
      },
    } as any);

    const snapshot = stats.finalizeGame({
      hp: { you: 27, ai: 30 },
      winner: "ai",
      roundsPlayed: 1,
    });

    expect(snapshot).not.toBeNull();
    const game = snapshot!.gameStats!;
    expect(game.defenseMeta?.totals?.schemaDamageDriftCount ?? 0).toBe(2);
  });
});
