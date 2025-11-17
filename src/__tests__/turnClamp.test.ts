import { describe, it, expect } from "vitest";
import { StatsTracker } from "../stats/tracker";

describe("turn-level clamp of blocked + prevented", () => {
  it("caps blocked+prevented at rawDamage before storing", () => {
    const stats = new StatsTracker();
    stats.beginGame({
      heroId: "Pyromancer" as any,
      opponentHeroId: "Training Dummy" as any,
      seed: 1,
    });

    const turnId = "turn_clamp_test_1";
    // raw = attack(5) + collateral(0) = 5
    // blocked=4, prevented=4 -> should clamp to prevented=1 (so 4+1=5)
    stats.recordTurn({
      id: turnId,
      gameId: "game_x" as any,
      turnId,
      round: 1,
      attackerSide: "ai",
      defenderSide: "you",
      actualDamage: 0,
      damageWithoutBlock: 5,
      damageBlocked: 4,
      damagePrevented: 4,
      phaseDamage: { attack: 5, collateral: 0, counter: 0, upkeepDot: 0 },
    } as any);

    const snap = stats.getSnapshot();
    const turn = snap.turnStats!.find((t) => t.id === turnId)!;
    expect(turn.damageBlocked).toBe(4);
    expect(turn.damagePrevented).toBe(1);
  });
});

