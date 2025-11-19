import { describe, expect, it } from "vitest";

import {
  buildPendingDefenseBuffsFromGrants,
  partitionBuffsByKo,
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
      createGrant({
        target: "opponent",
        status: "burn",
        carryOverOnKO: { owner: true },
      }),
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
      carryOverOnKO: { owner: true },
    });
  });

  it("preserves carryOverOnKO metadata on pending buffs", () => {
    const [buff] = buildPendingDefenseBuffsFromGrants(
      [
        createGrant({
          carryOverOnKO: { owner: true, opponent: false },
        }),
      ],
      {
        attackerSide: "ai",
        defenderSide: "you",
        round: 2,
        turnId: "turn_meta",
      }
    );

    expect(buff.carryOverOnKO).toEqual({ owner: true, opponent: false });
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
    expect(result.expired).toHaveLength(0);
  });

  it("expires buffs flagged for next attack commitment", () => {
    const [buff] = buildPendingDefenseBuffsFromGrants(
      [
        createGrant({
          usablePhase: "preDefenseRoll",
          expires: { type: "nextAttack" },
        }),
      ],
      {
        attackerSide: "ai",
        defenderSide: "you",
        round: 5,
        turnId: "turn_xy",
      }
    );

    const result = partitionPendingDefenseBuffs([buff], {
      phase: "nextAttackCommit",
      owner: "you",
      turnId: "turn_new",
      round: 5,
    });

    expect(result.ready).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
    expect(result.expired).toHaveLength(1);
    expect(result.expired[0]?.reason).toBe("next attack committed");
  });

  it("expires buffs at end of round", () => {
    const [buff] = buildPendingDefenseBuffsFromGrants(
      [
        createGrant({
          usablePhase: "preDefenseRoll",
          expires: { type: "endOfRound" },
        }),
      ],
      {
        attackerSide: "ai",
        defenderSide: "you",
        round: 2,
        turnId: "turn_ab",
      }
    );

    const result = partitionPendingDefenseBuffs([buff], {
      phase: "turnStart",
      owner: "you",
      turnId: "turn_cd",
      round: 3,
    });

    expect(result.ready).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
    expect(result.expired).toHaveLength(1);
    expect(result.expired[0]?.reason).toBe("round ended");
  });

  it("counts down afterNTurns expirations per owner turn", () => {
    const [buff] = buildPendingDefenseBuffsFromGrants(
      [
        createGrant({
          usablePhase: "preDefenseRoll",
          expires: { type: "afterNTurns", turns: 2 },
        }),
      ],
      {
        attackerSide: "ai",
        defenderSide: "you",
        round: 4,
        turnId: "turn_seed",
      }
    );

    const first = partitionPendingDefenseBuffs([buff], {
      phase: "turnEnd",
      owner: "you",
      turnId: "turn_one",
      round: 4,
    });
    expect(first.expired).toHaveLength(0);
    expect(first.pending[0]?.turnsRemaining).toBe(1);

    const second = partitionPendingDefenseBuffs(first.pending, {
      phase: "turnEnd",
      owner: "you",
      turnId: "turn_two",
      round: 4,
    });

    expect(second.expired).toHaveLength(1);
    expect(second.expired[0]?.reason).toBe("turn window elapsed");
  });

  it("expires buffs after the defender completes their next turn", () => {
    const [buff] = buildPendingDefenseBuffsFromGrants(
      [
        createGrant({
          usablePhase: "preDefenseRoll",
          expires: { type: "endOfYourNextTurn" },
        }),
      ],
      {
        attackerSide: "ai",
        defenderSide: "you",
        round: 6,
        turnId: "turn_attack",
      }
    );

    const result = partitionPendingDefenseBuffs([buff], {
      phase: "turnEnd",
      owner: "you",
      turnId: "turn_you_end",
      round: 6,
    });

    expect(result.expired).toHaveLength(1);
    expect(result.expired[0]?.reason).toBe("end of turn");
  });

  it("expires buffs when KO hits owner/opponent unless carry-over is set", () => {
    const [opponentFacingBuff, ownerBuff, resilientBuff] =
      buildPendingDefenseBuffsFromGrants(
        [
          createGrant({
            usablePhase: "preDefenseRoll",
          }),
          createGrant({
            target: "opponent",
            status: "burn",
          }),
          createGrant({
            usablePhase: "preDefenseRoll",
            carryOverOnKO: { opponent: true },
          }),
        ],
        {
          attackerSide: "ai",
          defenderSide: "you",
          round: 7,
          turnId: "turn_ko",
        }
      );

    const { pending, expired } = partitionBuffsByKo(
      [opponentFacingBuff, ownerBuff, resilientBuff],
      "ai"
    );

    expect(expired).toHaveLength(2);
    expect(expired.map((entry) => entry.reason)).toEqual([
      "opponent KO",
      "owner KO",
    ]);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(resilientBuff.id);
  });
});
