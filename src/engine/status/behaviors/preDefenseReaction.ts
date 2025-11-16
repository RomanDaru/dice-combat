import type { StatusSpendApplyResult } from "../types";
import type { StatusBehaviorHandlers } from "./types";

type PreDefenseReactionConfig = {
  dieSize?: number;
  successThreshold: number;
  negateOnSuccess?: boolean;
  successBlock?: number;
  failBlock?: number;
  successLog?: string;
  failureLog?: string;
  successDamageMultiplier?: number;
  failureDamageMultiplier?: number;
};

const clampMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const buildSuccessResult = (
  label: string,
  roll: number,
  negateOnSuccess: boolean,
  config: PreDefenseReactionConfig
): StatusSpendApplyResult => {
  const result: StatusSpendApplyResult = {
    success: true,
    log:
      config.successLog ??
      `${label} success (roll ${roll}) -> attack negated`,
  };
  if (negateOnSuccess) {
    result.negateIncoming = true;
  }
  if (typeof config.successBlock === "number") {
    result.bonusBlock = config.successBlock;
  }
  if (typeof config.successDamageMultiplier === "number") {
    result.damageMultiplier = clampMultiplier(
      config.successDamageMultiplier
    );
  }
  return result;
};

const buildFailureResult = (
  label: string,
  roll: number,
  config: PreDefenseReactionConfig
): StatusSpendApplyResult => {
  const result: StatusSpendApplyResult = {
    success: false,
    log: config.failureLog ?? `${label} failed (roll ${roll})`,
  };
  if (typeof config.failBlock === "number") {
    result.bonusBlock = config.failBlock;
  }
  if (typeof config.failureDamageMultiplier === "number") {
    result.damageMultiplier = clampMultiplier(
      config.failureDamageMultiplier
    );
  }
  return result;
};

export const preDefenseReactionBehavior: StatusBehaviorHandlers = {
  applySpend: ({ def, config, ctx }) => {
    const cfg = (config ?? {}) as PreDefenseReactionConfig;
    const threshold = cfg.successThreshold ?? 0;
    const requiresRoll = def.spend?.needsRoll !== false;
    if (requiresRoll && typeof ctx.roll !== "number") {
      return null;
    }
    const roll =
      typeof ctx.roll === "number" ? ctx.roll : threshold;
    const negateOnSuccess = Boolean(cfg.negateOnSuccess);
    if (roll >= threshold) {
      return buildSuccessResult(def.name, roll, negateOnSuccess, cfg);
    }
    return buildFailureResult(def.name, roll, cfg);
  },
};
