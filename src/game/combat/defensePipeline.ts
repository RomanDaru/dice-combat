import {
  createStatusSpendSummary,
  getStatus,
  spendStatus,
} from "../../engine/status";
import type {
  StatusSpendApplyResult,
  StatusSpendSummary,
} from "../../engine/status";
import type { PlayerState } from "../types";
import type {
  BaseDefenseResolution,
  DefensePlanResult,
  ResolvedDefenseState,
} from "./types";

type AdjustDefenseWithChiArgs = {
  defender: PlayerState;
  incomingDamage: number;
  baseResolution: BaseDefenseResolution;
  requestedChi: number;
};

export const adjustDefenseWithChi = ({
  defender,
  incomingDamage,
  baseResolution,
  requestedChi,
}: AdjustDefenseWithChiArgs): {
  defenderAfter: PlayerState;
  resolution: ResolvedDefenseState;
} => {
  const chiDef = getStatus("chi");
  const spendDef = chiDef?.spend;
  const baseBlock = Math.max(0, baseResolution.baseBlock);
  const buildResolution = (
    statusSpends: StatusSpendSummary[]
  ): ResolvedDefenseState => ({
    selection: baseResolution.selection,
    baseBlock,
    reflect: baseResolution.reflect,
    heal: baseResolution.heal,
    appliedTokens: baseResolution.appliedTokens,
    retaliatePercent: baseResolution.retaliatePercent,
    statusSpends,
  });

  if (!spendDef) {
    return {
      defenderAfter: defender,
      resolution: buildResolution([]),
    };
  }

  const availableChi = defender.tokens.chi ?? 0;
  if (availableChi <= 0 || requestedChi <= 0 || baseBlock <= 0) {
    return {
      defenderAfter: defender,
      resolution: buildResolution([]),
    };
  }

  const chiBudget = Math.min(requestedChi, availableChi);
  const remainingDamage = Math.max(0, incomingDamage - baseBlock);
  const maxChiToUse = Math.min(chiBudget, remainingDamage);

  if (maxChiToUse <= 0) {
    return {
      defenderAfter: defender,
      resolution: buildResolution([]),
    };
  }

  let workingTokens = defender.tokens;
  let totalBonusBlock = 0;
  let totalStacks = 0;
  const defenseRoll = baseResolution.selection.roll?.dice ?? [];
  const highestDie = defenseRoll.length ? Math.max(...defenseRoll) : undefined;
  const spendResults: StatusSpendApplyResult[] = [];

  for (let i = 0; i < maxChiToUse; i += 1) {
    const ctx = {
      phase: "defenseRoll" as const,
      roll: highestDie,
      baseBlock: baseResolution.baseBlock + totalBonusBlock,
    };
    const spendResult = spendStatus(workingTokens, "chi", "defenseRoll", ctx);
    if (!spendResult) break;
    totalBonusBlock += spendResult.spend.bonusBlock ?? 0;
    totalStacks += spendDef.costStacks;
    workingTokens = spendResult.next;
    spendResults.push(spendResult.spend);
    if (baseResolution.baseBlock + totalBonusBlock >= incomingDamage) {
      break;
    }
  }

  if (totalStacks <= 0 || spendResults.length === 0) {
    return {
      defenderAfter: defender,
      resolution: buildResolution([]),
    };
  }

  const statusSpends: StatusSpendSummary[] = [
    createStatusSpendSummary("chi", totalStacks, spendResults),
  ];

  const resolution = buildResolution(statusSpends);

  return {
    defenderAfter: {
      ...defender,
      tokens: workingTokens,
    },
    resolution,
  };
};

type BuildDefensePlanArgs = {
  defender: PlayerState;
  incomingDamage: number;
  baseResolution: BaseDefenseResolution;
  requestedChi: number;
};

export const buildDefensePlan = ({
  defender,
  incomingDamage,
  baseResolution,
  requestedChi,
}: BuildDefensePlanArgs): DefensePlanResult => {
  const { defenderAfter, resolution } = adjustDefenseWithChi({
    defender,
    incomingDamage,
    baseResolution,
    requestedChi,
  });

  return {
    defenderAfter,
    defense: resolution,
  };
};
