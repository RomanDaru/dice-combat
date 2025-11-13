import type { Side } from "./types";
import type { PendingDefenseBuff } from "./types";
import type { DefenseStatusGrant } from "../defense/effects";
import type { StatusTimingPhase } from "../engine/status/types";

const createBuffId = (turnId: string, index: number) =>
  `pdb_${turnId}_${Date.now().toString(36)}_${index}`;

const resolveOwnerForGrant = (
  grant: DefenseStatusGrant,
  attackerSide: Side,
  defenderSide: Side
): Side => {
  switch (grant.target) {
    case "opponent":
      return attackerSide;
    default:
      return defenderSide;
  }
};

type BuildBuffsContext = {
  attackerSide: Side;
  defenderSide: Side;
  round: number;
  turnId: string;
};

export const buildPendingDefenseBuffsFromGrants = (
  grants: DefenseStatusGrant[],
  context: BuildBuffsContext
): PendingDefenseBuff[] =>
  grants
    .filter((grant) => grant.usablePhase !== "immediate")
    .map((grant, index) => ({
      id: createBuffId(context.turnId, index),
      owner: resolveOwnerForGrant(
        grant,
        context.attackerSide,
        context.defenderSide
      ),
      kind: "status" as const,
      statusId: grant.status,
      stacks: grant.stacks ?? 1,
      usablePhase: grant.usablePhase ?? "nextTurn",
      stackCap: grant.stackCap,
      expires: grant.expires,
      createdAt: {
        round: context.round,
        turnId: context.turnId,
      },
      source: grant.source
        ? {
            ruleId: grant.source.ruleId,
            effectId: grant.source.effectId,
          }
        : undefined,
    }));

export type PendingDefenseBuffTrigger = {
  phase: StatusTimingPhase;
  owner: Side;
  turnId: string;
  round: number;
};

const matchesTrigger = (
  buff: PendingDefenseBuff,
  trigger: PendingDefenseBuffTrigger
) => {
  if (buff.owner !== trigger.owner) return false;
  if (buff.usablePhase === "nextTurn") {
    if (trigger.phase !== "nextTurn") return false;
    return buff.createdAt.turnId !== trigger.turnId;
  }
  return buff.usablePhase === trigger.phase;
};

export const partitionPendingDefenseBuffs = (
  buffs: PendingDefenseBuff[],
  trigger: PendingDefenseBuffTrigger
) => {
  const ready: PendingDefenseBuff[] = [];
  const pending: PendingDefenseBuff[] = [];

  buffs.forEach((buff) => {
    if (matchesTrigger(buff, trigger)) {
      ready.push(buff);
    } else {
      pending.push(buff);
    }
  });

  return { ready, pending };
};
