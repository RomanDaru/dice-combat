import type {
  StatusBehaviorConfig,
  StatusBehaviorId,
  StatusDef,
  StatusLifecycleEvent,
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

export type BehaviorLifecycleContext = {
  def: StatusDef;
  config?: StatusBehaviorConfig;
  event: StatusLifecycleEvent;
};

export type StatusBehaviorLifecycleHandlers = {
  onGrant?: (context: BehaviorLifecycleContext) => void;
  onSpend?: (context: BehaviorLifecycleContext) => void;
  onConsume?: (context: BehaviorLifecycleContext) => void;
  onExpire?: (context: BehaviorLifecycleContext) => void;
  onTick?: (context: BehaviorLifecycleContext) => void;
};

export type StatusBehaviorHandlers = {
  applySpend?: (
    context: BehaviorSpendContext
  ) => StatusSpendApplyResult | null | undefined;
  applyTick?: (
    context: BehaviorTickContext
  ) => StatusTickResult | null | undefined;
  lifecycle?: StatusBehaviorLifecycleHandlers;
};
