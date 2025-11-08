export type StatusId = string;

export type StatusPolarity = "positive" | "negative";

export type StatusActivation = "active" | "passive";

export type StatusWindowId =
  | "upkeep:tick"
  | "attack:declare"
  | "attack:preResolve"
  | "attack:roll"
  | "attack:postResolve"
  | "preDefense:start"
  | "defense:beforeRoll"
  | "defense:afterRoll"
  | "defense:reactiveModifiers"
  | "damage:preCalc"
  | "damage:postApply"
  | "turn:preEnd"
  | "turn:postEnd";

export type StatusBehaviorId =
  | "bonus_pool"
  | "pre_defense_reaction"
  | "damage_over_time"
  | "custom_script";

export type StatusBehaviorConfig = Record<string, unknown>;

export interface StatusAttachmentMetadata {
  transferable?: boolean;
}

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
  turnLimited?: boolean;
  diceCount?: number;
  apply?: (ctx: StatusSpendApplyContext) => StatusSpendApplyResult;
}

export type StatusTransferTarget = "self" | "opponent";

export interface StatusTransferConfig {
  mode: "cleanse" | "transfer";
  targetPolarity: StatusPolarity;
  allowedStatuses?: StatusId[];
  target?: StatusTransferTarget;
  transferStacks?: number;
  consumeStacks?: number;
  rollThreshold: number;
  dieSize?: number;
  window?: "upkeep" | "turnEnd";
  successLog?: string;
  failureLog?: string;
  animationDurationMs?: number;
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
  name: string;
  icon: string;
  polarity: StatusPolarity;
  activation: StatusActivation;
  windows: StatusWindowId[];
  behaviorId?: StatusBehaviorId;
  behaviorConfig?: StatusBehaviorConfig;
  attachment?: StatusAttachmentMetadata;
  maxStacks?: number;
  priority?: number;
  onTick?: (stacks: number) => StatusTickResult | undefined;
  spend?: StatusSpend;
  transfer?: StatusTransferConfig;
  cleanse?: StatusCleanseRoll;
  onModify?: (
    instance: { id: string; stacks: number },
    ctx: StatusModifyContext
  ) => StatusModifyResult | undefined;
}

export type StatusRegistry = Record<StatusId, StatusDef>;

export type StatusSpendSummary = {
  id: StatusId;
  name: string;
  icon: string;
  behaviorId?: StatusBehaviorId;
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
