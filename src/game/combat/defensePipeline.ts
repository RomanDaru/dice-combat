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
  const availableChi = defender.tokens.chi ?? 0;
  if (availableChi <= 0 || requestedChi <= 0) {
    return {
      defenderAfter: defender,
      resolution: {
        ...baseResolution,
        chiSpent: 0,
      },
    };
  }

  const chiBudget = Math.min(requestedChi, availableChi);
  const remainingDamage = Math.max(0, incomingDamage - baseResolution.block);
  const chiSpent = Math.min(chiBudget, remainingDamage);

  if (chiSpent <= 0) {
    return {
      defenderAfter: defender,
      resolution: {
        ...baseResolution,
        chiSpent: 0,
      },
    };
  }

  const defenderAfter: PlayerState = {
    ...defender,
    tokens: {
      ...defender.tokens,
      chi: Math.max(0, availableChi - chiSpent),
    },
  };

  const resolution: ResolvedDefenseState = {
    ...baseResolution,
    block: baseResolution.block + chiSpent,
    chiSpent,
  };

  return {
    defenderAfter,
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




