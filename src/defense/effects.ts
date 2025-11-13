import type { DefenseMatcherEvaluation } from "./matchers";
import type {
  BlockPerEffectConfig,
  DealPerEffectConfig,
  DefenseCarryOverPolicy,
  DefenseEffectConfig,
  DefenseEffectTarget,
  DefenseStatusExpiry,
  FlatBlockEffectConfig,
  GainStatusEffectConfig,
  PreventHalfEffectConfig,
} from "./types";
import type {
  StatusId,
  StatusStacks,
  StatusTimingPhase,
} from "../engine/status";

const DEFAULT_TARGET: DefenseEffectTarget = "self";

const defaultTargetForEffect = (
  effectType: DefenseEffectConfig["type"]
): DefenseEffectTarget => {
  switch (effectType) {
    case "dealPer":
      return "opponent";
    default:
      return DEFAULT_TARGET;
  }
};
const DEFAULT_GAIN_STATUS_PHASE: StatusTimingPhase = "nextTurn";
const DEFAULT_PREVENT_PHASE: StatusTimingPhase = "preApplyDamage";

export const PREVENT_HALF_STATUS_ID: StatusId = "prevent_half";

export type DefenseParticipantSnapshot = {
  statuses: StatusStacks;
};

export type DefenseEffectSource = {
  ruleId: string;
  effectId?: string;
  effectIndex: number;
  effectType: DefenseEffectConfig["type"];
};

export type DefenseBlockContribution = {
  amount: number;
  target: DefenseEffectTarget;
  kind: "flatBlock" | "blockPer";
  stage: "flat" | "additional";
  source: DefenseEffectSource;
};

export type DefenseDamageContribution = {
  amount: number;
  target: DefenseEffectTarget;
  source: DefenseEffectSource;
};

export type DefenseStatusGrant = {
  status: StatusId;
  target: DefenseEffectTarget;
  stacks: number;
  usablePhase: StatusTimingPhase;
  expires?: DefenseStatusExpiry;
  stackCap?: number;
  amount?: number;
  cleansable?: boolean;
  carryOverOnKO?: DefenseCarryOverPolicy;
  source: DefenseEffectSource;
};

export type DefenseEffectTrace = DefenseEffectSource & {
  target: DefenseEffectTarget;
  outcome: "applied" | "skipped";
  reason?: string;
  value?: number;
  metadata?: Record<string, unknown>;
};

export type DefenseEffectsResult = {
  blocks: DefenseBlockContribution[];
  damage: DefenseDamageContribution[];
  status: DefenseStatusGrant[];
  traces: DefenseEffectTrace[];
};

export type ExecuteDefenseEffectsArgs = {
  ruleId: string;
  effects: DefenseEffectConfig[];
  match: DefenseMatcherEvaluation;
  self?: DefenseParticipantSnapshot;
  opponent?: DefenseParticipantSnapshot;
};

const ensureParticipant = (
  participant?: DefenseParticipantSnapshot
): DefenseParticipantSnapshot => ({
  statuses: participant?.statuses ?? {},
});

const clampByCap = (value: number, cap?: number) => {
  if (value <= 0) return 0;
  return typeof cap === "number" ? Math.min(value, cap) : value;
};

const getStacks = (statuses: StatusStacks, status: StatusId) =>
  statuses?.[status] ?? 0;

const meetsRequirement = (
  statuses: StatusStacks,
  requirement: { status: string; minStacks?: number }
) => {
  const minStacks = requirement.minStacks ?? 1;
  return getStacks(statuses, requirement.status) >= minStacks;
};

const evaluateConditions = (
  effect: DefenseEffectConfig,
  participants: { self: DefenseParticipantSnapshot; opponent: DefenseParticipantSnapshot }
): { allowed: true } | { allowed: false; reason: string } => {
  const conditions = effect.conditions;
  if (!conditions) {
    return { allowed: true };
  }
  if (
    conditions.requiresSelfStatus &&
    !meetsRequirement(participants.self.statuses, conditions.requiresSelfStatus)
  ) {
    const req = conditions.requiresSelfStatus;
    return {
      allowed: false,
      reason: `Requires self status "${req.status}" x${req.minStacks ?? 1}`,
    };
  }
  if (
    conditions.requiresOpponentStatus &&
    !meetsRequirement(
      participants.opponent.statuses,
      conditions.requiresOpponentStatus
    )
  ) {
    const req = conditions.requiresOpponentStatus;
    return {
      allowed: false,
      reason: `Requires opponent status "${req.status}" x${
        req.minStacks ?? 1
      }`,
    };
  }
  return { allowed: true };
};

const recordTrace = (
  traces: DefenseEffectTrace[],
  source: DefenseEffectSource,
  target: DefenseEffectTarget,
  outcome: DefenseEffectTrace["outcome"],
  detail?: { reason?: string; value?: number; metadata?: Record<string, unknown> }
) => {
  traces.push({
    ...source,
    target,
    outcome,
    ...detail,
  });
};

const applyFlatBlock = (
  effect: FlatBlockEffectConfig,
  source: DefenseEffectSource,
  target: DefenseEffectTarget,
  result: DefenseEffectsResult
) => {
  const amount = clampByCap(effect.amount, effect.cap);
  if (amount > 0) {
    result.blocks.push({
      amount,
      kind: "flatBlock",
      stage: "flat",
      target,
      source,
    });
  }
  recordTrace(result.traces, source, target, "applied", { value: amount });
};

const applyBlockPer = (
  effect: BlockPerEffectConfig,
  source: DefenseEffectSource,
  target: DefenseEffectTarget,
  result: DefenseEffectsResult,
  matchCount: number
) => {
  const amount = clampByCap(effect.amount * matchCount, effect.cap);
  if (amount > 0) {
    result.blocks.push({
      amount,
      kind: "blockPer",
      stage: "additional",
      target,
      source,
    });
  }
  recordTrace(result.traces, source, target, "applied", { value: amount });
};

const applyDealPer = (
  effect: DealPerEffectConfig,
  source: DefenseEffectSource,
  target: DefenseEffectTarget,
  result: DefenseEffectsResult,
  matchCount: number
) => {
  const amount = clampByCap(effect.amount * matchCount, effect.cap);
  if (amount > 0) {
    result.damage.push({
      amount,
      target,
      source,
    });
  }
  recordTrace(result.traces, source, target, "applied", { value: amount });
};

const applyGainStatus = (
  effect: GainStatusEffectConfig,
  source: DefenseEffectSource,
  target: DefenseEffectTarget,
  result: DefenseEffectsResult
) => {
  const stacks = effect.stacks ?? 1;
  const usablePhase = effect.usablePhase ?? DEFAULT_GAIN_STATUS_PHASE;
  result.status.push({
    status: effect.status as StatusId,
    target,
    stacks,
    usablePhase,
    expires: effect.expires,
    stackCap: effect.stackCap,
    amount: effect.amount,
    cleansable: effect.cleansable,
    carryOverOnKO: effect.carryOverOnKO,
    source,
  });
  recordTrace(result.traces, source, target, "applied", {
    value: stacks,
    metadata: { status: effect.status },
  });
};

const applyPreventHalf = (
  effect: PreventHalfEffectConfig,
  source: DefenseEffectSource,
  target: DefenseEffectTarget,
  result: DefenseEffectsResult
) => {
  const stacks = effect.stacks ?? 1;
  const usablePhase = effect.usablePhase ?? DEFAULT_PREVENT_PHASE;
  result.status.push({
    status: PREVENT_HALF_STATUS_ID,
    target,
    stacks,
    usablePhase,
    expires: effect.expires,
    carryOverOnKO: effect.carryOverOnKO,
    source,
  });
  recordTrace(result.traces, source, target, "applied", {
    value: stacks,
    metadata: { status: PREVENT_HALF_STATUS_ID },
  });
};

const createEmptyResult = (): DefenseEffectsResult => ({
  blocks: [],
  damage: [],
  status: [],
  traces: [],
});

export const executeDefenseEffects = ({
  ruleId,
  effects,
  match,
  self,
  opponent,
}: ExecuteDefenseEffectsArgs): DefenseEffectsResult => {
  const result = createEmptyResult();
  const participants = {
    self: ensureParticipant(self),
    opponent: ensureParticipant(opponent),
  };

  effects.forEach((effect, effectIndex) => {
    const source: DefenseEffectSource = {
      ruleId,
      effectId: effect.id,
      effectIndex,
      effectType: effect.type,
    };
    const target = effect.target ?? defaultTargetForEffect(effect.type);
    const conditionCheck = evaluateConditions(effect, participants);
    if (!conditionCheck.allowed) {
      recordTrace(result.traces, source, target, "skipped", {
        reason: conditionCheck.reason,
      });
      return;
    }

    switch (effect.type) {
      case "dealPer":
        applyDealPer(effect, source, target, result, match.matchCount);
        break;
      case "flatBlock":
        applyFlatBlock(effect, source, target, result);
        break;
      case "blockPer":
        applyBlockPer(effect, source, target, result, match.matchCount);
        break;
      case "gainStatus":
        applyGainStatus(effect, source, target, result);
        break;
      case "preventHalf":
        applyPreventHalf(effect, source, target, result);
        break;
      default:
        recordTrace(result.traces, source, target, "skipped", {
          reason: `Effect "${effect.type}" not implemented`,
        });
    }
  });

  return result;
};
