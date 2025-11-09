export type InitiativeBucketId = "first" | "second";

export type HpBin = {
  id: string;
  label: string;
  min: number;
  max: number;
};

export const ATTACKER_HP_BINS: HpBin[] = [
  { id: "hp_0_10", label: "HP 0-10", min: 0, max: 10 },
  { id: "hp_11_20", label: "HP 11-20", min: 11, max: 20 },
  { id: "hp_21_plus", label: "HP 21+", min: 21, max: Infinity },
];

export const TIERING_CONSTANTS = {
  mitigations: {
    alphaHeal: 1,
    betaBlock: 0.5,
    gammaDot: 1,
  },
  ci: {
    confidence: 0.95,
    zValue: 1.96,
    bootstrapEnabled: false,
  },
  fdr: {
    q: 0.1,
  },
  filters: {
    bucket: {
      minUsesLowRun: 20,
      minUsesDefault: 30,
      minUsesHighRun: 50,
      lowRunCutoff: 2000,
      highRunCutoff: 10000,
      minOpportunityRate: 0.01,
    },
    ability: {
      minUsesHard: 200,
      minUsesSoft: 100,
      minPickRateForSoft: 0.4,
      minOpportunityRate: 0.1,
      watchlistOpportunityRate: 0.05,
      nichePenaltyThreshold: 0.15,
    },
  },
  thresholds: {
    trap: {
      ev: -0.5,
      releaseEv: -0.3,
      uplift: -0.03,
      minPickRate: 0.4,
    },
    overtuned: {
      ev: 0.5,
      releaseEv: 0.3,
      uplift: 0.03,
      minPickRate: 0.4,
    },
    consistencyRequired: 2 / 3,
  },
  scoreWeights: {
    ev: 0.5,
    uplift: 0.3,
    pickRate: 0.1,
    consistency: 0.2,
    variancePenalty: 0.2,
    nichePenalty: 0.2,
  },
};

export const SCORE_THRESHOLDS = {
  trap: -0.8,
  overtuned: 0.8,
};

export const deriveBucketUseThreshold = (totalGames: number): number => {
  if (totalGames >= TIERING_CONSTANTS.filters.bucket.highRunCutoff) {
    return TIERING_CONSTANTS.filters.bucket.minUsesHighRun;
  }
  if (totalGames <= TIERING_CONSTANTS.filters.bucket.lowRunCutoff) {
    return TIERING_CONSTANTS.filters.bucket.minUsesLowRun;
  }
  return TIERING_CONSTANTS.filters.bucket.minUsesDefault;
};

export const INITIATIVE_BUCKETS: InitiativeBucketId[] = ["first", "second"];
