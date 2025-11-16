import { describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";

import {
  applyDefenseTurnStartStats,
  prepareDefenseTurnStart,
} from "../GameController";
import type { Side } from "../../game/types";

const createRef = <T,>(value: T): MutableRefObject<T> =>
  ({ current: value } as MutableRefObject<T>);

describe("turn start lifecycle helpers", () => {
  it("releases nextTurn and turnStart buffs during preparation", () => {
    const currentTurnIdRef = createRef("turn_old");
    const pendingUpkeepRef = createRef({
      you: { turnId: "turn_old", amount: 3 },
      ai: { turnId: "turn_old", amount: 0 },
    });
    const releasePendingDefenseBuffs = vi.fn();

    prepareDefenseTurnStart(
      { currentTurnIdRef, pendingUpkeepRef, releasePendingDefenseBuffs },
      { side: "you", round: 4 }
    );

    expect(pendingUpkeepRef.current.you.amount).toBe(0);
    expect(pendingUpkeepRef.current.you.turnId).toBe(
      currentTurnIdRef.current
    );
    expect(releasePendingDefenseBuffs).toHaveBeenCalledTimes(2);
    expect(releasePendingDefenseBuffs).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: "nextTurn",
        owner: "you",
        round: 4,
        turnId: currentTurnIdRef.current,
      })
    );
    expect(releasePendingDefenseBuffs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        phase: "turnStart",
        owner: "you",
        round: 4,
        turnId: currentTurnIdRef.current,
      })
    );
  });

  it("records lethal upkeep damage and updates first player metadata", () => {
    const currentTurnIdRef = createRef("turn_alpha");
    const pendingUpkeepRef = createRef({
      you: { turnId: "turn_beta", amount: 0 },
      ai: { turnId: "turn_beta", amount: 0 },
    });
    const recordTurn = vi.fn();
    const updateGameMeta = vi.fn();
    const firstPlayerRef = createRef<Side | null>(null);

    applyDefenseTurnStartStats(
      {
        currentTurnIdRef,
        pendingUpkeepRef,
        stats: { recordTurn, updateGameMeta },
        firstPlayerRef,
      },
      { side: "ai", round: 2, statusDamage: 3, hpAfter: 0 }
    );

    expect(recordTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: "turn_alpha",
        attackerSide: "ai",
        phaseDamage: expect.objectContaining({ upkeepDot: 3 }),
      })
    );
    expect(pendingUpkeepRef.current.ai).toEqual({
      turnId: "turn_alpha",
      amount: 0,
    });
    expect(firstPlayerRef.current).toBe("ai");
    expect(updateGameMeta).toHaveBeenCalledWith({ firstPlayer: "ai" });
  });
});
