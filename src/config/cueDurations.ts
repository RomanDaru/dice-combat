export type CueDurationKey =
  | "default"
  | "turn"
  | "attackTelegraph"
  | "statusTick"
  | "statusDamage"
  | "defenseSummary"
  | "defenseSummaryLethal"
  | "statusPrompt";

const CUE_DURATION_MS: Record<CueDurationKey, number> = {
  default: 1600,
  turn: 1600,
  attackTelegraph: 2400,
  statusTick: 1800,
  statusDamage: 2800,
  defenseSummary: 4400,
  defenseSummaryLethal: 2600,
  statusPrompt: 2200,
};

export const DEFAULT_CUE_DURATION_MS = CUE_DURATION_MS.default;

export const getCueDuration = (
  key: Exclude<CueDurationKey, "default">,
  fallback?: number
): number => {
  const value = CUE_DURATION_MS[key];
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (
    typeof fallback === "number" &&
    Number.isFinite(fallback) &&
    fallback >= 0
  ) {
    return fallback;
  }
  return DEFAULT_CUE_DURATION_MS;
};

export const cueDurations = CUE_DURATION_MS;
