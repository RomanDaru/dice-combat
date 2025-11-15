import type { Side } from "./types";
import type { PendingDefenseBuff } from "./types";
import type { DefenseStatusGrant } from "../defense/effects";
import type { DefenseStatusExpiry } from "../defense/types";
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

const normalizeTurnsRemaining = (
  expires?: DefenseStatusExpiry
): number | undefined => {
  if (!expires) return undefined;
  if (expires.type === "afterNTurns") {
    const turns = Math.max(1, expires.turns ?? 1);
    return turns;
  }
  return undefined;
};

export const buildPendingDefenseBuffsFromGrants = (
  grants: DefenseStatusGrant[],
  context: BuildBuffsContext
): PendingDefenseBuff[] =>
  grants
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
      cleansable: grant.cleansable,
      carryOverOnKO: grant.carryOverOnKO,
      turnsRemaining: normalizeTurnsRemaining(grant.expires),
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

const isNewTurnForOwner = (
  buff: PendingDefenseBuff,
  trigger: PendingDefenseBuffTrigger
) => trigger.turnId !== buff.createdAt.turnId;

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

const checkExpirationReason = (
  buff: PendingDefenseBuff,
  trigger: PendingDefenseBuffTrigger
): string | null => {
  const expiry = buff.expires;
  if (!expiry) return null;
  switch (expiry.type) {
    case "nextAttack":
      if (
        trigger.phase === "nextAttackCommit" &&
        trigger.owner === buff.owner &&
        isNewTurnForOwner(buff, trigger)
      ) {
        return "next attack committed";
      }
      break;
    case "endOfRound":
      if (trigger.round > buff.createdAt.round) {
        return "round ended";
      }
      break;
    case "endOfYourNextTurn":
      if (
        trigger.phase === "turnEnd" &&
        trigger.owner === buff.owner &&
        isNewTurnForOwner(buff, trigger)
      ) {
        return "end of turn";
      }
      break;
    case "afterNTurns":
      if (
        typeof buff.turnsRemaining === "number" &&
        buff.turnsRemaining <= 0
      ) {
        return "turn window elapsed";
      }
      break;
    default:
      break;
  }
  return null;
};

const shouldCountTurnEnd = (
  buff: PendingDefenseBuff,
  trigger: PendingDefenseBuffTrigger
) =>
  trigger.phase === "turnEnd" &&
  trigger.owner === buff.owner &&
  isNewTurnForOwner(buff, trigger);

const applyTurnCountdown = (
  buff: PendingDefenseBuff,
  trigger: PendingDefenseBuffTrigger
): { buff: PendingDefenseBuff; expiredReason?: string } => {
  if (
    typeof buff.turnsRemaining !== "number" ||
    buff.turnsRemaining <= 0 ||
    !shouldCountTurnEnd(buff, trigger)
  ) {
    return { buff };
  }
  const nextTurns = buff.turnsRemaining - 1;
  if (nextTurns <= 0) {
    return {
      buff: { ...buff, turnsRemaining: 0 },
      expiredReason: "turn window elapsed",
    };
  }
  return { buff: { ...buff, turnsRemaining: nextTurns } };
};

export type PendingDefenseBuffPartition = {
  ready: PendingDefenseBuff[];
  pending: PendingDefenseBuff[];
  expired: Array<{ buff: PendingDefenseBuff; reason: string }>;
};

export const partitionPendingDefenseBuffs = (
  buffs: PendingDefenseBuff[],
  trigger: PendingDefenseBuffTrigger
) => {
  const ready: PendingDefenseBuff[] = [];
  const pending: PendingDefenseBuff[] = [];
  const expired: Array<{ buff: PendingDefenseBuff; reason: string }> = [];

  buffs.forEach((buff) => {
    const countdownResult = applyTurnCountdown(buff, trigger);
    if (countdownResult.expiredReason) {
      expired.push({
        buff: countdownResult.buff,
        reason: countdownResult.expiredReason,
      });
      return;
    }
    const working = countdownResult.buff;
    const expirationReason = checkExpirationReason(working, trigger);
    if (expirationReason) {
      expired.push({ buff: working, reason: expirationReason });
      return;
    }
    if (matchesTrigger(working, trigger)) {
      ready.push(working);
      return;
    }
    pending.push(working);
  });

  return { ready, pending, expired };
};

const oppositeSide = (side: Side): Side => (side === "you" ? "ai" : "you");

export const partitionBuffsByKo = (
  buffs: PendingDefenseBuff[],
  koSide: Side
) => {
  const pending: PendingDefenseBuff[] = [];
  const expired: Array<{ buff: PendingDefenseBuff; reason: string }> = [];
  const opponent = oppositeSide(koSide);

  buffs.forEach((buff) => {
    const carry = buff.carryOverOnKO ?? {};
    if (buff.owner === koSide) {
      if (carry.owner) {
        pending.push(buff);
      } else {
        expired.push({ buff, reason: "owner KO" });
      }
      return;
    }
    if (buff.owner === opponent) {
      if (carry.opponent) {
        pending.push(buff);
      } else {
        expired.push({ buff, reason: "opponent KO" });
      }
      return;
    }
    pending.push(buff);
  });

  return { pending, expired };
};
