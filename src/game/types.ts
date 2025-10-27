import type { GameDispatch, GameState } from "./state";

export type Combo =
  | "5OAK" | "4OAK" | "FULL_HOUSE" | "3OAK" | "PAIR_PAIR" | "SMALL_STRAIGHT" | "LARGE_STRAIGHT";

export type Ability = {
  combo: Combo;
  damage: number;
  ultimate?: boolean;
  apply?: Partial<{ burn: number; chi: number; evasive: number }>;
  label?: string;
};

export type HeroId = string;

export type DefenseRoll = { roll: number; reduced: number; reflect: number };
export type DefenseFromRoll = (input: { roll: number; tokens: Tokens }) => {
  reduced: number;
  reflect: number;
};
export type DefenseRoller = (tokens: Tokens) => DefenseRoll;

export type AiDecisionContext = {
  dice: number[];
  rollsRemaining: number;
  tokens: Tokens;
  hero: Hero;
};

export interface Hero {
  id: HeroId;
  name: string;
  maxHp: number;
  abilities: Ability[];
  defense: {
    fromRoll: DefenseFromRoll;
    roll: DefenseRoller;
  };
  ai: {
    chooseHeld: (context: AiDecisionContext) => boolean[];
  };
}

export type Side = "you" | "ai";
export type Phase =
  | "standoff"
  | "upkeep"
  | "roll"
  | "attack"
  | "defense"
  | "finished";

export type Tokens = { burn: number; chi: number; evasive: number };
export type PlayerState = { hero: Hero; hp: number; tokens: Tokens };
export type TestResult = { name: string; pass: boolean; details?: string };

export type DefenseModifierInfo = {
  id: string;
  source: string;
  blockBonus: number;
  reflectBonus: number;
  logDetail: string;
};

export type DefenseCalculationResult = {
  threatenedDamage: number;
  defenseRoll: number;
  baseBlock: number;
  baseBlockLog: string;
  modifiersApplied: DefenseModifierInfo[];
  totalBlock: number;
  totalReflect: number;
  damageDealt: number;
  finalAttackerHp: number;
  finalDefenderHp: number;
  maxAttackerHp: number;
  maxDefenderHp: number;
  attackerName: string;
  defenderName: string;
};

export type ActiveAbilityPhase = "upkeep" | "roll" | "attack" | "defense" | "end";

export type ActiveAbilityCost = {
  tokens?: Partial<Tokens>;
  cooldown?: number;
  [key: string]: unknown;
};

export type ActiveAbilityContext = {
  state: Readonly<GameState>;
  dispatch: GameDispatch;
  phase: Phase;
  turn: Side;
  side: Side;
  actingPlayer: PlayerState;
  opposingPlayer: PlayerState;
  pendingAttack: GameState["pendingAttack"];
  abilityId: string;
  pushLog: (entry: string | string[], options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
};

export type ActiveAbilityOutcome = {
  actingPlayer?: PlayerState;
  opposingPlayer?: PlayerState;
  logs?: Array<string | string[]>;
  damage?: Array<{ side: Side; amount: number; kind?: "hit" | "reflect" }>;
  tokensConsumed?: Partial<Tokens>;
  statePatch?: Partial<GameState>;
  nextPhase?: Phase;
  controllerAction?: { type: string; payload?: unknown };
};

export type ActiveAbility = {
  id: string;
  label: string;
  description?: string;
  phase: ActiveAbilityPhase | ActiveAbilityPhase[];
  cost?: ActiveAbilityCost;
  canUse: (context: ActiveAbilityContext) => boolean;
  execute: (context: ActiveAbilityContext) => ActiveAbilityOutcome | void;
};
