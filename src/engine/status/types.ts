export type StatusId = string;

export type StatusKind = "positive" | "negative";

export type StatusPhase =
  | "upkeep"
  | "attackRoll"
  | "defenseRoll"
  | "resolve";

export type StatusModifyPhase = "attack" | "defense";

export type StatusSpendApplyResult = {
  bonusDamage?: number;
  bonusBlock?: number;
  negateIncoming?: boolean;
  log?: string;
  success?: boolean;
};

export type StatusSpendApplyContext = {
  phase: StatusPhase;
  roll?: number;
  baseDamage?: number;
  baseBlock?: number;
};

export interface StatusSpend {
  costStacks: number;
  allowedPhases: StatusPhase[];
  needsRoll?: boolean;
  apply: (ctx: StatusSpendApplyContext) => StatusSpendApplyResult;
}

export interface StatusTickResult {
  damage?: number;
  nextStacks: number;
  log?: string;
  prompt?: boolean;
}

export interface StatusCleanseRollResult {
  success: boolean;
  nextStacks: number;
  log: string;
}

export interface StatusCleanseRoll {
  type: "roll";
  threshold: number;
  resolve: (roll: number, currentStacks: number) => StatusCleanseRollResult;
  animationDuration?: number;
}

export interface StatusModifyContext {
  phase: StatusModifyPhase;
  attackerSide: "you" | "ai";
  defenderSide: "you" | "ai";
  baseDamage: number;
  baseBlock: number;
}

export interface StatusModifyResult {
  baseDamage?: number;
  baseBlock?: number;
  log?: string;
}

export interface StatusDef {
  id: StatusId;
  kind: StatusKind;
  name: string;
  icon: string;
  maxStacks?: number;
  priority?: number;
  onTick?: (stacks: number) => StatusTickResult | undefined;
  spend?: StatusSpend;
  cleanse?: StatusCleanseRoll;
  onModify?: (
    instance: { id: string; stacks: number },
    ctx: StatusModifyContext
  ) => StatusModifyResult | undefined;
}

export type StatusRegistry = Record<StatusId, StatusDef>;

export type StatusSpendSummary = {
  id: StatusId;
  stacksSpent: number;
  bonusDamage: number;
  bonusBlock: number;
  negateIncoming: boolean;
  successCount: number;
  logs: string[];
  results: StatusSpendApplyResult[];
};

export type AggregatedStatusSpends = {
  bonusDamage: number;
  bonusBlock: number;
  negateIncoming: boolean;
  logs: string[];
  byStatus: Record<StatusId, StatusSpendSummary>;
};

const cloneSummary = (summary: StatusSpendSummary): StatusSpendSummary => ({
  ...summary,
  logs: [...summary.logs],
  results: [...summary.results],
});

const mergeSummary = (
  target: StatusSpendSummary,
  source: StatusSpendSummary
) => {
  target.stacksSpent += source.stacksSpent;
  target.bonusDamage += source.bonusDamage;
  target.bonusBlock += source.bonusBlock;
  target.negateIncoming ||= source.negateIncoming;
  target.successCount += source.successCount;
  if (source.logs.length) target.logs.push(...source.logs);
  if (source.results.length) target.results.push(...source.results);
};

export const aggregateStatusSpendSummaries = (
  summaries: StatusSpendSummary[]
): AggregatedStatusSpends => {
  if (summaries.length === 0) {
    return {
      bonusDamage: 0,
      bonusBlock: 0,
      negateIncoming: false,
      logs: [],
      byStatus: {},
    };
  }
  const byStatus = new Map<StatusId, StatusSpendSummary>();
  summaries.forEach((summary) => {
    const existing = byStatus.get(summary.id);
    if (!existing) {
      byStatus.set(summary.id, cloneSummary(summary));
    } else {
      mergeSummary(existing, summary);
    }
  });
  const aggregated: AggregatedStatusSpends = {
    bonusDamage: 0,
    bonusBlock: 0,
    negateIncoming: false,
    logs: [],
    byStatus: {},
  };
  Array.from(byStatus.values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((entry) => {
      aggregated.byStatus[entry.id] = entry;
      aggregated.bonusDamage += entry.bonusDamage;
      aggregated.bonusBlock += entry.bonusBlock;
      aggregated.negateIncoming ||= entry.negateIncoming;
      if (entry.logs.length) aggregated.logs.push(...entry.logs);
    });
  if (aggregated.logs.length) {
    aggregated.logs = aggregated.logs.filter((line): line is string =>
      Boolean(line)
    );
  }
  return aggregated;
};
