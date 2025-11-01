import type { Combo, DefensiveAbility, OffensiveAbility, PlayerState, Side, Tokens } from "../types";
import type { GameState } from "../state";
import type { ManualEvasiveLog } from "../logging/combatLog";

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

export type BaseDefenseResolution = {
  selection: DefenseSelection;
  block: number;
  reflect: number;
  heal: number;
  appliedTokens: Partial<Tokens>;
  retaliatePercent?: number;
};

export type ResolvedDefenseState = BaseDefenseResolution & {
  chiSpent: number;
  chiBonusBlock: number;
};

export type AttackContext = {
  source: AttackSource;
  attackerSide: Side;
  defenderSide: Side;
  attacker: PlayerState;
  defender: PlayerState;
  ability: OffensiveAbility;
  attackChiSpend: number;
  attackChiApplied: boolean;
  defense: {
    resolution: ResolvedDefenseState | null;
    manualEvasive?: ManualEvasiveLog;
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
