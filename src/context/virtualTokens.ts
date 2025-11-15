import { getStacks, setStacks, type StatusId } from "../engine/status";
import type { PendingDefenseBuff, PlayerState, Side, Tokens } from "../game/types";
import type { StatusTimingPhase } from "../engine/status/types";

export type PendingBuffSummaryEntry = {
  id: string;
  statusId: StatusId;
  stacks: number;
  usablePhase: StatusTimingPhase;
};

export type VirtualTokenDerivationBreakdown = {
  side: Side;
  actualStacks: Tokens;
  afterRequests: Tokens;
  requestDeltaApplied: boolean;
  pendingBuffSummary: PendingBuffSummaryEntry[];
};

export type VirtualTokenDerivationResult = {
  tokens: Tokens;
  breakdown: VirtualTokenDerivationBreakdown;
};

const applyRequestDeductions = (
  tokens: Tokens,
  requests: Record<StatusId, number>
): { tokens: Tokens; changed: boolean } => {
  let adjusted = tokens;
  let changed = false;
  Object.entries(requests).forEach(([rawId, amount]) => {
    if (amount <= 0) return;
    const statusId = rawId as StatusId;
    const current = getStacks(adjusted, statusId, 0);
    if (current <= 0) return;
    const nextValue = Math.max(0, current - amount);
    if (nextValue === current) return;
    adjusted = setStacks(adjusted, statusId, nextValue);
    changed = true;
  });
  return { tokens: adjusted, changed };
};

const summarizePendingBuffs = (
  owner: Side,
  pendingBuffs: PendingDefenseBuff[]
): PendingBuffSummaryEntry[] =>
  pendingBuffs
    .filter((buff) => buff.owner === owner && buff.kind === "status")
    .map((buff) => ({
      id: buff.id,
      statusId: buff.statusId,
      stacks: buff.stacks,
      usablePhase: buff.usablePhase,
    }));

export const deriveVirtualTokensForSide = ({
  player,
  side,
  attackStatusRequests,
  defenseStatusRequests,
  pendingDefenseBuffs,
}: {
  player: PlayerState | undefined;
  side: Side;
  attackStatusRequests: Record<StatusId, number>;
  defenseStatusRequests: Record<StatusId, number>;
  pendingDefenseBuffs: PendingDefenseBuff[];
}): VirtualTokenDerivationResult => {
  const actual = player?.tokens ?? {};
  let working = actual;
  let requestDelta = false;
  if (side === "you") {
    const attackResult = applyRequestDeductions(working, attackStatusRequests);
    working = attackResult.tokens;
    requestDelta ||= attackResult.changed;
    const defenseResult = applyRequestDeductions(working, defenseStatusRequests);
    working = defenseResult.tokens;
    requestDelta ||= defenseResult.changed;
  }
  return {
    tokens: working,
    breakdown: {
      side,
      actualStacks: actual,
      afterRequests: working,
      requestDeltaApplied: requestDelta,
      pendingBuffSummary: summarizePendingBuffs(side, pendingDefenseBuffs),
    },
  };
};
