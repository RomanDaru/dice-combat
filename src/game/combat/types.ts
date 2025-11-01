import type {
  Combo,
  DefensiveAbility,
  OffensiveAbility,
  PlayerState,
  Side,
  Tokens,
} from "../types";
import type { GameState } from "../state";
import type { StatusSpendSummary } from "../../engine/status";

export type AttackSource = "player" | "ai";

export type DefenseBoardOption = {
  combo: Combo;
  ability: DefensiveAbility;
};

export type DefenseRollResult = {
  dice: number[];
  combos: Combo[];
  options: DefenseBoardOption[];
};

export type DefenseSelection = {
  roll: DefenseRollResult;
  selected: DefenseBoardOption | null;
};

/**
 * Fraction within [0, 1] describing how much incoming damage is retaliated.
 */
export type RetaliatePercent = number;

export type BaseDefenseResolution = {
  selection: DefenseSelection;
  baseBlock: number;
  reflect: number;
  heal: number;
  appliedTokens: Partial<Tokens>;
  retaliatePercent?: RetaliatePercent;
};

export type ResolvedDefenseState = {
  selection: DefenseSelection;
  baseBlock: number;
  reflect: number;
  heal: number;
  appliedTokens: Partial<Tokens>;
  retaliatePercent?: RetaliatePercent;
  statusSpends: StatusSpendSummary[];
};

export type AttackContext = {
  source: AttackSource;
  attackerSide: Side;
  defenderSide: Side;
  attacker: PlayerState;
  defender: PlayerState;
  ability: OffensiveAbility;
  baseDamage: number;
  attackStatusSpends: StatusSpendSummary[];
  defense: {
    resolution: ResolvedDefenseState | null;
  };
};

export type CombatEvent = {
  type: "TURN_END";
  payload: { next: Side; delayMs?: number; prePhase?: GameState["phase"] };
  followUp?: "trigger_ai_turn";
};

export type AttackResolution = {
  updatedAttacker: PlayerState;
  updatedDefender: PlayerState;
  logs: string[];
  fx: Array<{ side: Side; amount: number; kind?: "hit" | "reflect" }>;
  outcome: "continue" | "attacker_defeated" | "defender_defeated";
  nextPhase: GameState["phase"];
  nextSide: Side;
  events: CombatEvent[];
};

export type EvasiveAttemptPlan = {
  used: boolean;
  roll: number;
  success: boolean;
  alreadySpent?: boolean;
};

export type DefensePlanResult = {
  defenderAfter: PlayerState;
  defense: ResolvedDefenseState;
};
