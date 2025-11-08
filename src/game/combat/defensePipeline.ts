import {
  getStatus,
  spendStatusMany,
  type StatusId,
  type StatusSpendSummary,
} from "../../engine/status";
import type { PlayerState } from "../types";
import type {
  BaseDefenseResolution,
  DefensePlanResult,
  ResolvedDefenseState,
} from "./types";

type BuildDefensePlanArgs = {
  defender: PlayerState;
  incomingDamage: number;
  baseResolution: BaseDefenseResolution;
  spendRequests?: Record<StatusId, number>;
};

export const buildDefensePlan = ({
  defender,
  incomingDamage,
  baseResolution,
  spendRequests = {},
}: BuildDefensePlanArgs): DefensePlanResult => {
  const baseBlock = Math.max(0, baseResolution.baseBlock);
  let workingTokens = defender.tokens;
  const statusSpends: StatusSpendSummary[] = [];

  Object.entries(spendRequests).forEach(([statusId, requestedStacks]) => {
    if (requestedStacks <= 0) return;
    const def = getStatus(statusId);
    const spendDef = def?.spend;
    if (!spendDef) return;
    if (!spendDef.allowedPhases.includes("defenseRoll")) return;
    const costStacks = spendDef.costStacks || 1;
    const attempts =
      costStacks > 0
        ? Math.floor(requestedStacks / costStacks)
        : requestedStacks;
    if (attempts <= 0) return;

    const spendResult = spendStatusMany(
      workingTokens,
      statusId,
      attempts,
      "defenseRoll",
      (iteration, previousCtx) => ({
        ...previousCtx,
        baseBlock:
          typeof previousCtx.baseBlock === "number"
            ? previousCtx.baseBlock
            : baseBlock,
      }),
      { phase: "defenseRoll", baseBlock }
    );
    if (!spendResult) return;
    workingTokens = spendResult.next;
    statusSpends.push(spendResult.summary);
  });

  const defenderAfter =
    workingTokens === defender.tokens
      ? defender
      : {
          ...defender,
          tokens: workingTokens,
        };

  const resolution: ResolvedDefenseState = {
    selection: baseResolution.selection,
    baseBlock,
    reflect: baseResolution.reflect,
    heal: baseResolution.heal,
    appliedTokens: baseResolution.appliedTokens,
    retaliatePercent: baseResolution.retaliatePercent,
    statusSpends,
  };

  return {
    defenderAfter,
    defense: resolution,
  };
};
