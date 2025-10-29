import { useCallback } from "react";
import type { DefensiveAbility, OffensiveAbility } from "../game/types";
import { useGame } from "../context/GameContext";
import {
  buildAttackResolutionLines,
  formatDice,
  indentLog,
  ManualEvasiveLog,
} from "../game/logging/combatLog";

type LogOptions = { blankLineBefore?: boolean; blankLineAfter?: boolean };

type AbilityLogTarget = OffensiveAbility | DefensiveAbility;

const abilityTag = (value: string) => `<<ability:${value}>>`;
const formatAbilityName = (ability: AbilityLogTarget) =>
  abilityTag(ability.displayName ?? ability.label ?? ability.combo);

export { buildAttackResolutionLines, indentLog };
export type { ManualEvasiveLog };

export function useCombatLog() {
  const { dispatch } = useGame();
  const pushLog = useCallback(
    (entry: string | string[], options: LogOptions = {}) => {
      if (options.blankLineBefore) dispatch({ type: "PUSH_LOG", entry: "" });
      const text = Array.isArray(entry) ? entry.join("\n") : entry;
      dispatch({ type: "PUSH_LOG", entry: text });
      if (options.blankLineAfter) dispatch({ type: "PUSH_LOG", entry: "" });
    },
    [dispatch]
  );

  const logPlayerAttackStart = useCallback(
    (diceValues: number[], ability: OffensiveAbility, attackerName: string) => {
      pushLog(
        `[Roll] ${attackerName} attacks: ${formatDice(diceValues)} -> ${formatAbilityName(
          ability
        )}.`,
        { blankLineBefore: true }
      );
    },
    [pushLog]
  );

  const logPlayerNoCombo = useCallback(
    (diceValues: number[], attackerName: string) => {
      pushLog(
        `[Roll] ${attackerName} attacks: ${formatDice(diceValues)} -> no combo.`,
        { blankLineBefore: true }
      );
    },
    [pushLog]
  );

  const logAiAttackRoll = useCallback(
    (diceValues: number[], ability: OffensiveAbility) => {
      pushLog(indentLog(`AI roll: ${formatDice(diceValues)} -> ${formatAbilityName(ability)}.`));
    },
    [pushLog]
  );

  const logAiNoCombo = useCallback(
    (diceValues: number[]) => {
      pushLog(indentLog(`AI roll: ${formatDice(diceValues)} -> no combo.`));
    },
    [pushLog]
  );

  return {
    pushLog,
    logPlayerAttackStart,
    logPlayerNoCombo,
    logAiAttackRoll,
    logAiNoCombo,
  };
}
