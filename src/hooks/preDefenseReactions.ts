import { getStatus, type StatusId } from "../engine/status";
import type { Tokens } from "../game/types";

const isPreDefenseReaction = (statusId: StatusId) => {
  const def = getStatus(statusId);
  return Boolean(
    def &&
      def.behaviorId === "pre_defense_reaction" &&
      def.spend?.allowedPhases.includes("defenseRoll")
  );
};

export const getPreDefenseReactionStatuses = (
  tokens: Tokens
): StatusId[] => {
  const ids: StatusId[] = [];
  Object.entries(tokens).forEach(([rawId, stacks]) => {
    if ((stacks ?? 0) <= 0) return;
    const statusId = rawId as StatusId;
    if (isPreDefenseReaction(statusId)) {
      ids.push(statusId);
    }
  });
  return ids;
};
