import type { DefenseCalculationResult } from "../types";
import type { ManualDefenseLog } from "./combatLog";

type ManualDefenseParams = {
  outcome: DefenseCalculationResult;
  defenderName: string;
  chiSpent?: number;
};

export function buildManualDefenseLog({
  outcome,
  defenderName,
  chiSpent = 0,
}: ManualDefenseParams): ManualDefenseLog {
  return {
    reduced: outcome.totalBlock,
    reflect: outcome.totalReflect,
    roll: outcome.defenseRoll,
    label: defenderName,
    chiUsed: chiSpent,
  };
}

