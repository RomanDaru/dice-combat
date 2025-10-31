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
