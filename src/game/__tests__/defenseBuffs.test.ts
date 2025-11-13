import { describe, expect, it } from "vitest";

import {
  buildPendingDefenseBuffsFromGrants,
  partitionPendingDefenseBuffs,
} from "../defenseBuffs";
import type { DefenseStatusGrant } from "../../defense/effects";

const createGrant = (
  overrides: Partial<DefenseStatusGrant> = {}
): DefenseStatusGrant => ({
  status: "chi",
  stacks: 2,
  usablePhase: "nextTurn",
  target: "self",
  source: { ruleId: "rule_alpha", effectId: "effect_beta" },
  ...overrides,
});

describe("defenseBuffs", () => {
  it("builds pending buffs for defender and attacker targets", () => {
    const grants: DefenseStatusGrant[] = [
      createGrant(),
      createGrant({ target: "opponent", status: "burn" }),
    ];

    const buffs = buildPendingDefenseBuffsFromGrants(grants, {
      attackerSide: "ai",
      defenderSide: "you",
      round: 3,
      turnId: "turn_xyz",
    });

    expect(buffs).toHaveLength(2);
    const defenderBuff = buffs.find((buff) => buff.statusId === "chi");
    const attackerBuff = buffs.find((buff) => buff.statusId === "burn");
    expect(defenderBuff).toMatchObject({
      owner: "you",
      usablePhase: "nextTurn",
      createdAt: { round: 3, turnId: "turn_xyz" },
    });
    expect(attackerBuff).toMatchObject({
      owner: "ai",
      statusId: "burn",
    });
  });

  it("partitions buffs that are ready on next turn", () => {
    const [pendingBuff] = buildPendingDefenseBuffsFromGrants([createGrant()], {
      attackerSide: "ai",
      defenderSide: "you",
      round: 1,
      turnId: "turn_old",
    });

    const result = partitionPendingDefenseBuffs([pendingBuff], {
      phase: "nextTurn",
      owner: "you",
      turnId: "turn_new",
      round: 2,
    });

    expect(result.ready).toHaveLength(1);
    expect(result.pending).toHaveLength(0);
  });
});
