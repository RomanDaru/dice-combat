import type { StatusTimingPhase } from "../engine/status/types";

export type DefenseCarryOverPolicy = {
  owner?: boolean;
  opponent?: boolean;
};

export type DefenseVersion = "v1" | "v2";

export type DefenseDieValue = 1 | 2 | 3 | 4 | 5 | 6;

export type DefenseFieldId = string;

export type DefenseField = {
  id: DefenseFieldId;
  faces: DefenseDieValue[];
  label?: string;
};

export type DefenseStatusExpiry =
  | { type: "nextAttack" }
  | { type: "endOfRound" }
  | { type: "endOfYourNextTurn" }
  | { type: "afterNTurns"; turns: number };

export type DefenseSchema = {
  dice: number;
  fields: DefenseField[];
  rules: DefenseRule[];
  /**
   * When true, unused faces in the partition will only emit a warning instead
   * of being treated as a validation failure.
   */
  allowIdleFaces?: boolean;
};

export type DefenseRule = {
  id: string;
  label?: string;
  matcher: DefenseMatcherConfig;
  effects: DefenseEffectConfig[];
};

export type DefenseMatcherConfig =
  | CountFieldMatcherConfig
  | PairsFieldMatcherConfig
  | ExactFaceMatcherConfig
  | ComboMatcherConfig;

export type CountFieldMatcherConfig = {
  type: "countField";
  fieldId: DefenseFieldId;
  per?: number;
  cap?: number;
  min?: number;
};

export type PairsFieldMatcherConfig = {
  type: "pairsField";
  fieldId: DefenseFieldId;
  pairs?: number;
  cap?: number;
};

export type ExactFaceMatcherConfig = {
  type: "exactFace";
  face: DefenseDieValue;
  count: number;
};

export type ComboMatcherFieldRequirement = {
  id: DefenseFieldId;
  min: number;
};

export type ComboMatcherConfig = {
  type: "combo";
  fields: ComboMatcherFieldRequirement[];
  allowExtra?: boolean;
};

export type DefenseEffectTarget = "self" | "opponent" | "ally";

export type DefenseEffectCommon = {
  id?: string;
  target?: DefenseEffectTarget;
  conditions?: DefenseEffectConditions;
};

export type DefenseEffectConditions = {
  requiresOpponentStatus?: {
    status: string;
    minStacks?: number;
  };
  requiresSelfStatus?: {
    status: string;
    minStacks?: number;
  };
};

export type DealPerEffectConfig = DefenseEffectCommon & {
  type: "dealPer";
  amount: number;
  cap?: number;
};

export type FlatBlockEffectConfig = DefenseEffectCommon & {
  type: "flatBlock";
  amount: number;
  cap?: number;
};

export type BlockPerEffectConfig = DefenseEffectCommon & {
  type: "blockPer";
  amount: number;
  cap?: number;
};

export type ReflectEffectConfig = DefenseEffectCommon & {
  type: "reflect";
  amount: number;
  cap?: number;
};

export type GainStatusEffectConfig = DefenseEffectCommon & {
  type: "gainStatus";
  status: string;
  stacks?: number;
  amount?: number;
  stackCap?: number;
  usablePhase?: StatusTimingPhase;
  expires?: DefenseStatusExpiry;
  cleansable?: boolean;
  carryOverOnKO?: DefenseCarryOverPolicy;
};

export type ApplyStatusToOpponentEffectConfig = DefenseEffectCommon & {
  type: "applyStatusToOpponent";
  status: string;
  stacks?: number;
  amount?: number;
  stackCap?: number;
  expires?: DefenseStatusExpiry;
  carryOverOnKO?: DefenseCarryOverPolicy;
};

export type PreventHalfEffectConfig = DefenseEffectCommon & {
  type: "preventHalf";
  stacks?: number;
  usablePhase?: StatusTimingPhase;
  expires?: DefenseStatusExpiry;
  carryOverOnKO?: DefenseCarryOverPolicy;
};

export type BuffNextAttackEffectConfig = DefenseEffectCommon & {
  type: "buffNextAttack";
  amount: number;
  stacks?: number;
  cap?: number;
  payload?: Record<string, unknown>;
};

export type HealEffectConfig = DefenseEffectCommon & {
  type: "heal";
  amount: number;
};

export type CleanseEffectConfig = DefenseEffectCommon & {
  type: "cleanse";
  statuses?: string[];
  amount?: number;
};

export type TransferStatusEffectConfig = DefenseEffectCommon & {
  type: "transferStatus";
  status: string;
  amount?: number;
  from: "self" | "opponent";
  to: "self" | "opponent";
};

export type RerollSelectionPolicy =
  | "highestNonMatching"
  | "lowest"
  | "highest"
  | "random"
  | "custom";

export type RerollDiceEffectConfig = DefenseEffectCommon & {
  type: "rerollDice";
  count: number;
  fields?: DefenseFieldId[];
  selectionPolicy?: RerollSelectionPolicy | { type: string; [key: string]: unknown };
};

export type DefenseEffectConfig =
  | DealPerEffectConfig
  | FlatBlockEffectConfig
  | BlockPerEffectConfig
  | ReflectEffectConfig
  | GainStatusEffectConfig
  | ApplyStatusToOpponentEffectConfig
  | PreventHalfEffectConfig
  | BuffNextAttackEffectConfig
  | HealEffectConfig
  | CleanseEffectConfig
  | TransferStatusEffectConfig
  | RerollDiceEffectConfig;
