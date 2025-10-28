import type { PlayerState } from "../types";
import type { ChiDefenseAdjustment, DefensePlanResult } from "./types";
import type { DefenseCalculationResult } from "../types";
import type { ManualEvasiveLog } from "../logging/combatLog";
import { buildManualDefenseLog } from "../logging/defenseLogs";

type AdjustDefenseWithChiArgs = {
  defender: PlayerState;
  abilityDamage: number;
  defenseOutcome: DefenseCalculationResult;
  requestedChi: number;
};

/**
 * Applies reactive chi spending to an existing defense outcome.
 * The calculation mirrors the previous hook logic, but keeps it pure so it can be reused.
 */
export function adjustDefenseWithChi({
  defender,
  abilityDamage,
  defenseOutcome,
  requestedChi,
}: AdjustDefenseWithChiArgs): ChiDefenseAdjustment {
  const availableChi = defender.tokens.chi ?? 0;
  if (availableChi <= 0 || requestedChi <= 0) {
    return {
      defenderAfter: defender,
      defenseOutcome,
      chiSpent: 0,
    };
  }

  const chiBudget = Math.min(requestedChi, availableChi);
  const currentBlocked = defenseOutcome.totalBlock;
  const remainingDamage = Math.max(0, abilityDamage - currentBlocked);
  const chiSpent = Math.min(chiBudget, remainingDamage);

  if (chiSpent <= 0) {
    return {
      defenderAfter: defender,
      defenseOutcome,
      chiSpent: 0,
    };
  }

  const defenderAfter: PlayerState = {
    ...defender,
    tokens: {
      ...defender.tokens,
      chi: Math.max(0, availableChi - chiSpent),
    },
  };

  const totalBlock = currentBlocked + chiSpent;
  const damageDealt = Math.max(0, abilityDamage - totalBlock);
  const modifiersApplied = [
    ...defenseOutcome.modifiersApplied,
    {
      id: "chi_spent_block",
      source: "Chi",
      blockBonus: chiSpent,
      reflectBonus: 0,
      logDetail: `<<resource:Chi>> +${chiSpent}`,
    },
  ];

  const adjustedOutcome: DefenseCalculationResult = {
    ...defenseOutcome,
    totalBlock,
    damageDealt,
    finalDefenderHp: Math.max(0, defender.hp - damageDealt),
    modifiersApplied,
  };

  return {
    defenderAfter,
    defenseOutcome: adjustedOutcome,
    chiSpent,
  };
}

type BuildDefensePlanArgs = {
  defender: PlayerState;
  abilityDamage: number;
  defenseOutcome: DefenseCalculationResult;
  defenseRoll?: number;
  requestedChi: number;
  manualEvasive?: ManualEvasiveLog;
};

export function buildDefensePlan({
  defender,
  abilityDamage,
  defenseOutcome,
  defenseRoll,
  requestedChi,
  manualEvasive,
}: BuildDefensePlanArgs): DefensePlanResult {
  const chiAdjustment = adjustDefenseWithChi({
    defender,
    abilityDamage,
    defenseOutcome,
    requestedChi,
  });

  const manualDefense = buildManualDefenseLog({
    outcome: chiAdjustment.defenseOutcome,
    defenderName: defender.hero.name,
    chiSpent: chiAdjustment.chiSpent,
  });

  return {
    defenderAfter: chiAdjustment.defenderAfter,
    defense: {
      defenseRoll,
      manualDefense,
      defenseOutcome: chiAdjustment.defenseOutcome,
      manualEvasive,
      defenseChiSpend: chiAdjustment.chiSpent,
    },
    chiSpent: chiAdjustment.chiSpent,
  };
}
