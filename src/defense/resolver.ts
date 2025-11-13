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
import type { StatusStacks } from "../engine/status";

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
  afterFlatBlock: number;
  afterPrevent: number;
  finalDamage: number;
};

export type DefenseSchemaResolution = {
  dice: DefenseDieValue[];
  rules: DefenseRuleExecution[];
  checkpoints: DefensePipelineCheckpoints;
  totalBlock: number;
  totalDamage: number;
  statusGrants: DefenseStatusGrant[];
  logs: string[];
};

export type ResolveDefenseSchemaArgs = {
  schema: DefenseSchema;
  dice: DefenseDieValue[];
  incomingDamage: number;
  selfStatuses?: StatusStacks;
  opponentStatuses?: StatusStacks;
};

const asParticipantSnapshot = (
  stacks?: StatusStacks
): DefenseParticipantSnapshot => ({
  statuses: stacks ?? {},
});

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

const aggregateBlock = (
  contributions: DefenseBlockContribution[],
  target: "self" | "opponent" | "ally" = "self"
) =>
  contributions
    .filter((entry) => entry.target === target)
    .reduce((sum, entry) => sum + entry.amount, 0);

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
  totalFlatBlock: number
): DefensePipelineCheckpoints => {
  const rawDamage = Math.max(0, incomingDamage);
  const afterFlatBlock = Math.max(0, rawDamage - totalFlatBlock);
  // Prevent/reflect are not implemented yet; keep placeholders so downstream
  // consumers can wire up without schema changes later.
  const afterPrevent = afterFlatBlock;
  const finalDamage = afterPrevent;
  return {
    rawDamage,
    afterFlatBlock,
    afterPrevent,
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
  });

  const totalBlock = rules.reduce(
    (sum, rule) => sum + aggregateBlock(rule.block, "self"),
    0
  );

  const totalDamage = rules.reduce(
    (sum, rule) => sum + aggregateDamage(rule.damage, "opponent"),
    0
  );

  const checkpoints = buildCheckpoints(incomingDamage, totalBlock);

  return {
    dice: diceValues,
    rules,
    checkpoints,
    totalBlock,
    totalDamage,
    statusGrants: flattenStatusGrants(rules),
    logs,
  };
};

