import type { StatusSpendApplyResult } from "../types";
import type { StatusBehaviorHandlers } from "./types";

type BonusPoolPhaseConfig = {
  bonusDamagePerStack?: number;
  bonusBlockPerStack?: number;
  logTemplate?: string;
};

type BonusPoolConfig = {
  attack?: BonusPoolPhaseConfig;
  defense?: BonusPoolPhaseConfig;
};

const formatLog = (
  template: string | undefined,
  fallback: string
): string => template ?? fallback;

const createDamageResult = (
  label: string,
  { bonusDamagePerStack, logTemplate }: BonusPoolPhaseConfig
): StatusSpendApplyResult => {
  const bonusDamage = bonusDamagePerStack ?? 0;
  return {
    bonusDamage,
    log: formatLog(logTemplate, `${label} -> +${bonusDamage} damage`),
  };
};

const createBlockResult = (
  label: string,
  { bonusBlockPerStack, logTemplate }: BonusPoolPhaseConfig
): StatusSpendApplyResult => {
  const bonusBlock = bonusBlockPerStack ?? 0;
  return {
    bonusBlock,
    log: formatLog(logTemplate, `${label} -> +${bonusBlock} block`),
  };
};

export const bonusPoolBehavior: StatusBehaviorHandlers = {
  applySpend: ({ def, config, phase }) => {
    const cfg = (config ?? {}) as BonusPoolConfig;
    if (phase === "attackRoll" && cfg.attack?.bonusDamagePerStack) {
      return createDamageResult(def.name, cfg.attack);
    }
    if (phase === "defenseRoll" && cfg.defense?.bonusBlockPerStack) {
      return createBlockResult(def.name, cfg.defense);
    }
    return null;
  },
};
