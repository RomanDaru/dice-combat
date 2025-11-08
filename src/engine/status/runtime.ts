import type {
  StatusDef,
  StatusId,
  StatusModifyContext,
  StatusPhase,
  StatusSpendApplyContext,
  StatusSpendApplyResult,
  StatusSpendSummary,
} from "./types";
import { getStatus } from "./registry";
import { getBehaviorHandlers } from "./behaviors";

export type StatusStacks = Record<StatusId, number>;

const clampStacks = (def: StatusDef, stacks: number) => {
  const { maxStacks } = def;
  if (typeof maxStacks === "number") {
    return Math.max(0, Math.min(maxStacks, stacks));
  }
  return Math.max(0, stacks);
};

export function getStacks(
  stacks: StatusStacks,
  id: string,
  fallback = 0
): number {
  return stacks[id] ?? fallback;
}

export function setStacks(
  stacks: StatusStacks,
  id: string,
  next: number
): StatusStacks {
  if (next <= 0 && stacks[id] === undefined) {
    return stacks;
  }
  const def = getStatus(id);
  const clamped = def ? clampStacks(def, next) : Math.max(0, next);
  if (clamped <= 0) {
    const { [id]: _, ...rest } = stacks;
    return rest;
  }
  return { ...stacks, [id]: clamped };
}

export function addStacks(
  stacks: StatusStacks,
  id: string,
  amount: number
): StatusStacks {
  if (amount === 0) return stacks;
  const def = getStatus(id);
  const current = stacks[id] ?? 0;
  const next = current + amount;
  const clamped = def ? clampStacks(def, next) : Math.max(0, next);
  if (clamped <= 0) {
    const { [id]: _, ...rest } = stacks;
    return rest;
  }
  return { ...stacks, [id]: clamped };
}

export type TickResult = {
  next: StatusStacks;
  totalDamage: number;
  logs: string[];
  prompts: Array<{ id: StatusId; stacks: number }>;
};

export function tickStatuses(current: StatusStacks): TickResult {
  let working = { ...current };
  let totalDamage = 0;
  const logs: string[] = [];
  const prompts: Array<{ id: StatusId; stacks: number }> = [];

  Object.entries(current).forEach(([id, stacks]) => {
    const def = getStatus(id);
    if (!def) return;
    const behavior = getBehaviorHandlers(def.behaviorId);
    const result =
      def.onTick?.(stacks) ??
      behavior?.applyTick?.({
        def,
        config: def.behaviorConfig,
        stacks,
      });
    if (!result) return;
    if (typeof result.damage === "number" && result.damage > 0) {
      totalDamage += result.damage;
    }
    if (result.log) logs.push(result.log);
    working = setStacks(working, id, result.nextStacks);
    const nextStacks = working[id as StatusId] ?? 0;
    if (result.prompt && nextStacks > 0) {
      prompts.push({ id: id as StatusId, stacks: nextStacks });
    }
  });

  return { next: working, totalDamage, logs, prompts };
}

export type SpendStatusResult = {
  next: StatusStacks;
  spend: StatusSpendApplyResult;
};

export function spendStatus(
  stacks: StatusStacks,
  id: string,
  phase: StatusPhase,
  ctx: StatusSpendApplyContext
): SpendStatusResult | null {
  const def = getStatus(id);
  if (!def?.spend) return null;
  if (!def.spend.allowedPhases.includes(phase)) return null;
  if (def.spend.needsRoll && typeof ctx.roll !== "number") return null;
  if (
    phase === "attackRoll" &&
    typeof ctx.baseDamage === "number" &&
    ctx.baseDamage <= 0
  ) {
    return null;
  }
  if (
    phase === "defenseRoll" &&
    typeof ctx.baseBlock === "number" &&
    ctx.baseBlock <= 0
  ) {
    return null;
  }

  const current = stacks[id] ?? 0;
  if (current < def.spend.costStacks) return null;

  const behavior = getBehaviorHandlers(def.behaviorId);
  const context = { ...ctx, phase };
  const spendResult =
    def.spend.apply?.(context) ??
    behavior?.applySpend?.({
      def,
      config: def.behaviorConfig,
      ctx: context,
      phase,
    });
  if (!spendResult) return null;
  const remaining = current - def.spend.costStacks;
  const next = setStacks(stacks, id, remaining);
  return { next, spend: spendResult };
}

export type SpendStatusManyResult = {
  next: StatusStacks;
  spends: StatusSpendApplyResult[];
  totalCost: number;
  summary: StatusSpendSummary;
};

export const createStatusSpendSummary = (
  id: StatusId,
  stacksSpent: number,
  spends: StatusSpendApplyResult[]
): StatusSpendSummary => {
  const bonusDamage = spends.reduce(
    (acc, spend) => acc + (spend.bonusDamage ?? 0),
    0
  );
  const bonusBlock = spends.reduce(
    (acc, spend) => acc + (spend.bonusBlock ?? 0),
    0
  );
  const negateIncoming = spends.some((spend) => spend.negateIncoming === true);
  const successCount = spends.reduce(
    (acc, spend) => acc + (spend.success ? 1 : 0),
    0
  );
  const logs = spends
    .map((spend) => spend.log)
    .filter((line): line is string => Boolean(line));

  return {
    id,
    stacksSpent,
    bonusDamage,
    bonusBlock,
    negateIncoming,
    successCount,
    logs,
    results: spends,
  };
};

export function spendStatusMany(
  stacks: StatusStacks,
  id: string,
  attempts: number,
  phase: StatusPhase,
  buildCtx: (
    iteration: number,
    previous: StatusSpendApplyContext
  ) => StatusSpendApplyContext,
  initialCtx: StatusSpendApplyContext
): SpendStatusManyResult | null {
  if (attempts <= 0) return null;
  const def = getStatus(id);
  if (!def?.spend) return null;
  let working = stacks;
  const spends: StatusSpendApplyResult[] = [];
  let totalCost = 0;
  let ctxSnapshot = { ...initialCtx };
  for (let i = 0; i < attempts; i += 1) {
    const ctx = buildCtx(i, ctxSnapshot);
    const result = spendStatus(working, id, phase, ctx);
    if (!result) break;
    working = result.next;
    spends.push(result.spend);
    totalCost += def.spend.costStacks;
    ctxSnapshot = {
      ...ctxSnapshot,
      baseDamage:
        typeof result.spend.bonusDamage === "number"
          ? result.spend.bonusDamage
          : ctx.baseDamage ?? ctxSnapshot.baseDamage,
      baseBlock:
        typeof result.spend.bonusBlock === "number"
          ? (ctx.baseBlock ?? ctxSnapshot.baseBlock ?? 0) +
            result.spend.bonusBlock
          : ctx.baseBlock ?? ctxSnapshot.baseBlock,
      roll: ctx.roll ?? ctxSnapshot.roll,
    };
  }
  if (spends.length === 0) return null;
  return {
    next: working,
    spends,
    totalCost,
    summary: createStatusSpendSummary(id as StatusId, totalCost, spends),
  };
}

export type ModifyResult = {
  ctx: StatusModifyContext;
  logs: string[];
};

export function applyModifiers(
  stacks: StatusStacks,
  ctx: StatusModifyContext
): ModifyResult {
  let current: StatusModifyContext = { ...ctx };
  const logs: string[] = [];

  const ordered = Object.entries(stacks)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const def = getStatus(id);
      return def ? { def, count } : null;
    })
    .filter((entry): entry is { def: StatusDef; count: number } => Boolean(entry))
    .sort((a, b) => (a.def.priority ?? 100) - (b.def.priority ?? 100));

  ordered.forEach(({ def, count }) => {
    if (!def.onModify) return;
    const result = def.onModify({ id: def.id, stacks: count }, current);
    if (!result) return;
    if (result.log) logs.push(result.log);
    current = {
      ...current,
      baseDamage:
        typeof result.baseDamage === "number"
          ? result.baseDamage
          : current.baseDamage,
      baseBlock:
        typeof result.baseBlock === "number"
          ? result.baseBlock
          : current.baseBlock,
    };
  });

  return { ctx: current, logs };
}

