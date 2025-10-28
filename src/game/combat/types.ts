import type { Ability, PlayerState, Side } from "../types";
import type { GameState } from "../state";
import type { DefenseCalculationResult } from "../types";
import type { ManualDefenseLog, ManualEvasiveLog } from "../logging/combatLog";

export type AttackSource = "player" | "ai";

export type AttackContext = {
  source: AttackSource;
  attackerSide: Side;
  defenderSide: Side;
  attacker: PlayerState;
  defender: PlayerState;
  ability: Ability;
  attackChiSpend: number;
  attackChiApplied: boolean;
  defense: {
    defenseRoll?: number;
    manualDefense?: ManualDefenseLog;
    defenseOutcome?: DefenseCalculationResult;
    manualEvasive?: ManualEvasiveLog;
    defenseChiSpend: number;
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

export type ChiDefenseAdjustment = {
  defenderAfter: PlayerState;
  defenseOutcome: DefenseCalculationResult;
  chiSpent: number;
};

export type DefensePreparationInput = {
  attacker: PlayerState;
  defender: PlayerState;
  ability: Ability;
  defenseRoll: number;
  requestedChi: number;
};

export type DefensePreparationOutput = {
  outcome: DefenseCalculationResult;
  manualDefense: ManualDefenseLog;
  chiAdjustment: ChiDefenseAdjustment;
};
