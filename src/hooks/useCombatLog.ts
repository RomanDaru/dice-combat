import { useCallback } from "react";
import type { Ability } from "../game/types";
import { useGame } from "../context/GameContext";
import {
  buildAttackResolutionLines,
  formatDice,
  indentLog,
  ManualDefenseLog,
  ManualEvasiveLog,
} from "../game/logging/combatLog";

type LogOptions = { blankLineBefore?: boolean; blankLineAfter?: boolean };

const abilityTag = (value: string) => `<<ability:${value}>>`;
const formatAbilityName = (ability: Ability) =>
  abilityTag(ability.label ?? ability.combo);

export { buildAttackResolutionLines, indentLog };
export type { ManualDefenseLog, ManualEvasiveLog };

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
    (diceValues: number[], ability: Ability, attackerName: string) => {
      pushLog(
        `[Hod] ${attackerName} útočí: ${formatDice(diceValues)} -> ${formatAbilityName(
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
        `[Hod] ${attackerName} útočí: ${formatDice(diceValues)} -> žiadna kombinácia.`,
        { blankLineBefore: true }
      );
    },
    [pushLog]
  );

  const logAiAttackRoll = useCallback(
    (diceValues: number[], ability: Ability) => {
      pushLog(indentLog(`AI hod: ${formatDice(diceValues)} -> ${formatAbilityName(ability)}.`));
    },
    [pushLog]
  );

  const logAiNoCombo = useCallback(
    (diceValues: number[]) => {
      pushLog(indentLog(`AI hod: ${formatDice(diceValues)} -> žiadna kombinácia.`));
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
