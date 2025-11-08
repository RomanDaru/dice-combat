import type {
  StatusBehaviorConfig,
  StatusBehaviorId,
  StatusDef,
  StatusPhase,
  StatusSpendApplyContext,
  StatusSpendApplyResult,
  StatusTickResult,
} from "../types";

export type BehaviorSpendContext = {
  def: StatusDef;
  config?: StatusBehaviorConfig;
  ctx: StatusSpendApplyContext;
  phase: StatusPhase;
};

export type BehaviorTickContext = {
  def: StatusDef;
  config?: StatusBehaviorConfig;
  stacks: number;
};

export type StatusBehaviorHandlers = {
  applySpend?: (
    context: BehaviorSpendContext
  ) => StatusSpendApplyResult | null | undefined;
  applyTick?: (
    context: BehaviorTickContext
  ) => StatusTickResult | null | undefined;
};
