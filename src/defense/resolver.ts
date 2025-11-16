import type { DefenseMatcherEvaluation } from "./matchers";
import { createDefenseRollStats, evaluateDefenseMatcher } from "./matchers";
import { executeDefenseEffects } from "./effects";
import type {
  DefenseDieValue,
  DefenseSchema,
  DefenseRule,
  DefenseEffectConfig,
} from "./types";
import type {
  DefenseBlockContribution,
  DefenseDamageContribution,
  DefenseEffectsResult,
  DefenseEffectTrace,
  DefenseStatusGrant,
  DefenseParticipantSnapshot,
} from "./effects";
import { getStatus, type StatusStacks } from "../engine/status";

export type DefenseRuleExecution = {
  id: string;
  label?: string;
  matched: boolean;
  matcher: DefenseMatcherEvaluation;
  effects: DefenseEffectTrace[];
  block: DefenseBlockContribution[];
  damage: DefenseDamageContribution[];
  status: DefenseStatusGrant[];
};

export type DefensePipelineCheckpoints = {
  rawDamage: number;
  afterFlat: number;
  afterPrevent: number;
  afterBlock: number;
  afterReflect: number;
  finalDamage: number;
};

export type DefenseSchemaResolution = {
  dice: DefenseDieValue[];
  rules: DefenseRuleExecution[];
  checkpoints: DefensePipelineCheckpoints;
  totalBlock: number;
  totalDamage: number;
  statusGrants: DefenseStatusGrant[];
  schemaHash?: string | null;
  logs: string[];
};

export type ResolveDefenseSchemaArgs = {
  schema: DefenseSchema;
  dice: DefenseDieValue[];
  incomingDamage: number;
  selfStatuses?: StatusStacks;
  opponentStatuses?: StatusStacks;
  schemaHash?: string | null;
};

const asParticipantSnapshot = (
  stacks?: StatusStacks
): DefenseParticipantSnapshot => ({
  statuses: stacks ? { ...stacks } : {},
});

const clampStacksForGrant = (
  current: number,
  grant: DefenseStatusGrant
): number => {
  const stacksToAdd = grant.stacks ?? 0;
  if (stacksToAdd <= 0) {
    return current;
  }
  let next = current + stacksToAdd;
  if (typeof grant.stackCap === "number") {
    next = Math.min(next, grant.stackCap);
  }
  const statusDef = getStatus(grant.status);
  if (typeof statusDef?.maxStacks === "number") {
    next = Math.min(next, statusDef.maxStacks);
  }
  return Math.max(0, next);
};

const applyGrantToSnapshot = (
  snapshot: DefenseParticipantSnapshot,
  grant: DefenseStatusGrant
) => {
  const current = snapshot.statuses[grant.status] ?? 0;
  const next = clampStacksForGrant(current, grant);
  if (next === current) return;
  snapshot.statuses = {
    ...snapshot.statuses,
    [grant.status]: next,
  };
};

const mergeStatusGrantsIntoParticipants = (
  participants: {
    self: DefenseParticipantSnapshot;
    opponent: DefenseParticipantSnapshot;
  },
  grants: DefenseStatusGrant[]
) => {
  grants.forEach((grant) => {
    const targetSnapshot =
      grant.target === "opponent" ? participants.opponent : participants.self;
    applyGrantToSnapshot(targetSnapshot, grant);
  });
};

const collectLogsForRule = (
  rule: DefenseRule,
  match: DefenseMatcherEvaluation,
  effects: DefenseEffectsResult
): string[] => {
  const lines: string[] = [];
  const label = rule.label ?? rule.id;
  if (!match.matched) {
    lines.push(`Rule "${label}" did not match.`);
    return lines;
  }
  lines.push(
    `Rule "${label}" matched (count=${match.matchCount}).`
  );
  effects.traces.forEach((trace) => {
    const effectLabel = trace.effectId
      ? `${trace.effectType}#${trace.effectId}`
      : trace.effectType;
    if (trace.outcome === "applied") {
      lines.push(
        `  • ${effectLabel} applied to ${trace.target} (value=${trace.value ?? 0}).`
      );
    } else {
      lines.push(
        `  • ${effectLabel} skipped (${trace.reason ?? "unknown reason"}).`
      );
    }
  });
  return lines;
};

type BlockStageTotals = { flat: number; additional: number };

const aggregateBlockStages = (
  rules: DefenseRuleExecution[],
  target: "self" | "opponent" | "ally" = "self"
): BlockStageTotals =>
  rules.reduce<BlockStageTotals>(
    (totals, rule) => {
      rule.block.forEach((entry) => {
        if (entry.target !== target) return;
        if (entry.stage === "additional") {
          totals.additional += entry.amount;
        } else {
          totals.flat += entry.amount;
        }
      });
      return totals;
    },
    { flat: 0, additional: 0 }
  );

const aggregateDamage = (
  contributions: DefenseDamageContribution[],
  target: "self" | "opponent" | "ally" = "opponent"
) =>
  contributions
    .filter((entry) => entry.target === target)
    .reduce((sum, entry) => sum + entry.amount, 0);

const flattenStatusGrants = (
  rules: DefenseRuleExecution[]
): DefenseStatusGrant[] =>
  rules.flatMap((rule) => rule.status);

const buildCheckpoints = (
  incomingDamage: number,
  totals: {
    flatBlock: number;
    statusPrevent: number;
    additionalBlock: number;
    reflect: number;
  }
): DefensePipelineCheckpoints => {
  const rawDamage = Math.max(0, incomingDamage);
  const afterFlat = Math.max(0, rawDamage - totals.flatBlock);
  const afterPrevent = Math.max(0, afterFlat - totals.statusPrevent);
  const afterBlock = Math.max(0, afterPrevent - totals.additionalBlock);
  // Reflect currently does not reduce defender damage; keep stage for telemetry.
  const afterReflect = Math.max(0, afterBlock);
  const finalDamage = afterReflect;
  return {
    rawDamage,
    afterFlat,
    afterPrevent,
    afterBlock,
    afterReflect,
    finalDamage,
  };
};

const resolveRule = (
  schema: DefenseSchema,
  rule: DefenseRule,
  dice: DefenseDieValue[],
  stats: ReturnType<typeof createDefenseRollStats>,
  participants: {
    self: DefenseParticipantSnapshot;
    opponent: DefenseParticipantSnapshot;
  }
): { execution: DefenseRuleExecution; logs: string[] } => {
  const matcher = evaluateDefenseMatcher(
    schema,
    rule.matcher,
    dice,
    stats
  );
  let effects: DefenseEffectsResult = {
    blocks: [],
    damage: [],
    status: [],
    traces: [],
  };
  if (matcher.matched) {
    effects = executeDefenseEffects({
      ruleId: rule.id,
      effects: rule.effects as DefenseEffectConfig[],
      match: matcher,
      self: participants.self,
      opponent: participants.opponent,
    });
  }
  const execution: DefenseRuleExecution = {
    id: rule.id,
    label: rule.label,
    matched: matcher.matched,
    matcher,
    effects: effects.traces,
    block: effects.blocks,
    damage: effects.damage,
    status: effects.status,
  };
  return {
    execution,
    logs: collectLogsForRule(rule, matcher, effects),
  };
};

export const resolveDefenseSchema = ({
  schema,
  dice,
  incomingDamage,
  selfStatuses,
  opponentStatuses,
  schemaHash,
}: ResolveDefenseSchemaArgs): DefenseSchemaResolution => {
  const diceValues: DefenseDieValue[] = [...dice];
  const stats = createDefenseRollStats(schema, diceValues);
  const participants = {
    self: asParticipantSnapshot(selfStatuses),
    opponent: asParticipantSnapshot(opponentStatuses),
  };

  const rules: DefenseRuleExecution[] = [];
  const logs: string[] = [];

  schema.rules.forEach((rule) => {
    const outcome = resolveRule(schema, rule, diceValues, stats, participants);
    rules.push(outcome.execution);
    logs.push(...outcome.logs);
    if (outcome.execution.status.length) {
      mergeStatusGrantsIntoParticipants(participants, outcome.execution.status);
    }
  });

  const blockStages = aggregateBlockStages(rules, "self");
  const totalBlock = blockStages.flat + blockStages.additional;

  const totalDamage = rules.reduce(
    (sum, rule) => sum + aggregateDamage(rule.damage, "opponent"),
    0
  );

  const checkpoints = buildCheckpoints(incomingDamage, {
    flatBlock: blockStages.flat,
    statusPrevent: 0,
    additionalBlock: blockStages.additional,
    reflect: totalDamage,
  });

  return {
    dice: diceValues,
    rules,
    checkpoints,
    totalBlock,
    totalDamage,
    statusGrants: flattenStatusGrants(rules),
    schemaHash,
    logs,
  };
};
