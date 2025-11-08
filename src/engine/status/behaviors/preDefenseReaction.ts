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
  return result;
};

export const preDefenseReactionBehavior: StatusBehaviorHandlers = {
  applySpend: ({ def, config, ctx }) => {
    const cfg = (config ?? {}) as PreDefenseReactionConfig;
    const threshold = cfg.successThreshold ?? 0;
    if (typeof ctx.roll !== "number") {
      return null;
    }
    const roll = ctx.roll;
    const negateOnSuccess = Boolean(cfg.negateOnSuccess);
    if (roll >= threshold) {
      return buildSuccessResult(def.name, roll, negateOnSuccess, cfg);
    }
    return buildFailureResult(def.name, roll, cfg);
  },
};
