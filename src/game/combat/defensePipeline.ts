import { getStatus, spendStatus } from "../../engine/status";
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
  if (!spendDef) {
    return {
      defenderAfter: defender,
      resolution: {
        ...baseResolution,
        chiSpent: 0,
        chiBonusBlock: 0,
      },
    };
  }

  const availableChi = defender.tokens.chi ?? 0;
  if (availableChi <= 0 || requestedChi <= 0) {
    return {
      defenderAfter: defender,
      resolution: {
        ...baseResolution,
        chiSpent: 0,
        chiBonusBlock: 0,
      },
    };
  }

  const chiBudget = Math.min(requestedChi, availableChi);
  const remainingDamage = Math.max(0, incomingDamage - baseResolution.block);
  const maxChiToUse = Math.min(chiBudget, remainingDamage);

  if (maxChiToUse <= 0) {
    return {
      defenderAfter: defender,
      resolution: {
        ...baseResolution,
        chiSpent: 0,
        chiBonusBlock: 0,
      },
    };
  }

  let workingTokens = defender.tokens;
  let totalBonusBlock = 0;
  let totalSpent = 0;
  const defenseRoll = baseResolution.selection.roll?.dice ?? [];
  const highestDie = defenseRoll.length ? Math.max(...defenseRoll) : undefined;

  for (let i = 0; i < maxChiToUse; i += 1) {
    const ctx = {
      phase: "defenseRoll" as const,
      roll: highestDie,
      baseBlock: baseResolution.block + totalBonusBlock,
    };
    const spendResult = spendStatus(workingTokens, "chi", "defenseRoll", ctx);
    if (!spendResult) break;
    totalBonusBlock += spendResult.spend.bonusBlock ?? 0;
    totalSpent += spendDef.costStacks;
    workingTokens = spendResult.next;
    if (baseResolution.block + totalBonusBlock >= incomingDamage) {
      break;
    }
  }

  if (totalSpent <= 0) {
    return {
      defenderAfter: defender,
      resolution: {
        ...baseResolution,
        chiSpent: 0,
        chiBonusBlock: 0,
      },
    };
  }

  const resolution: ResolvedDefenseState = {
    ...baseResolution,
    block: baseResolution.block + totalBonusBlock,
    chiSpent: totalSpent,
    chiBonusBlock: totalBonusBlock,
  };

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
