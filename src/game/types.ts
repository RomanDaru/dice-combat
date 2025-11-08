import type { GameDispatch, GameState } from "./state";
import type { HeroSkinId } from "./visuals";

export type Combo =
  | "5OAK" | "4OAK" | "FULL_HOUSE" | "3OAK" | "PAIR_PAIR" | "SMALL_STRAIGHT" | "LARGE_STRAIGHT";

export type AbilityPresentation = {
  label?: string;
  displayName?: string;
  iconId?: string;
  tooltip?: string;
};

type AbilityApplyMap = Partial<{ burn: number; chi: number; evasive: number; purify: number }>;

export type OffensiveAbility = AbilityPresentation & {
  combo: Combo;
  damage: number;
  ultimate?: boolean;
  applyPreDamage?: AbilityApplyMap;
  applyPostDamage?: AbilityApplyMap;
  /**
   * @deprecated Use applyPreDamage/applyPostDamage to express timing.
   * Retained temporarily for legacy hero data.
   */
  apply?: AbilityApplyMap;
};

export type DefensiveAbility = AbilityPresentation & {
  combo: Combo;
  block?: number;
  reflect?: number;
  heal?: number;
  retaliatePercent?: number;
  apply?: AbilityApplyMap;
};

export type OffensiveAbilityBoard = Partial<Record<Combo, OffensiveAbility>>;
export type DefensiveAbilityBoard = Partial<Record<Combo, DefensiveAbility>>;

export type HeroId = string;

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
  skin?: HeroSkinId;
  offensiveBoard: OffensiveAbilityBoard;
  defensiveBoard: DefensiveAbilityBoard;
  ai: {
    chooseHeld: (context: AiDecisionContext) => boolean[];
  };
}

export type Side = "you" | "ai";
export type Phase =
  | "standoff"
  | "turnTransition"
  | "upkeep"
  | "roll"
  | "attack"
  | "defense"
  | "end"
  | "finished";

export type Tokens = Record<string, number>;
export type PlayerState = { hero: Hero; hp: number; tokens: Tokens };
export type TestResult = { name: string; pass: boolean; details?: string };

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


