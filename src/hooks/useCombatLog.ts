import { useCallback } from "react";
import type { Ability, PlayerState } from "../game/types";
import { useGame } from "../context/GameContext";

type LogOptions = { blankLineBefore?: boolean; blankLineAfter?: boolean };

export type ManualEvasiveLog = {
  used: boolean;
  success: boolean;
  roll: number;
  label?: string;
};

export type ManualDefenseLog = {
  roll: number;
  reduced: number;
  reflect: number;
  chiUsed?: number;
  baseReduced?: number;
  label?: string;
};

export type AttackResolutionLogArgs = {
  attackerBefore: PlayerState;
  attackerAfter: PlayerState;
  defenderBefore: PlayerState;
  defenderAfter: PlayerState;
  incomingDamage: number;
  defenseRoll?: number;
  manualDefense?: ManualDefenseLog;
  manualEvasive?: ManualEvasiveLog;
  reflectedDamage: number;
};

export const formatDice = (values: number[]) => values.join(" ");
export const indentLog = (line: string) => ` > ${line}`;
const abilityTag = (value: string) => `<<ability:${value}>>`;
const statusTag = (value: string) => `<<status:${value}>>`;
const resourceTag = (value: string) => `<<resource:${value}>>`;
const formatAbilityName = (ability: Ability) =>
  abilityTag(ability.label ?? ability.combo);
const formatStacks = (value: number) =>
  `${value} stack${value === 1 ? "" : "s"}`;

const getStatusGainLines = (
  attackerBefore: PlayerState,
  attackerAfter: PlayerState,
  defenderBefore: PlayerState,
  defenderAfter: PlayerState
) => {
  const lines: string[] = [];
  const burnBefore = defenderBefore.tokens.burn ?? 0;
  const burnAfter = defenderAfter.tokens.burn ?? 0;
  if (burnAfter > burnBefore) {
    lines.push(
      `${defenderBefore.hero.name} gains ${statusTag("Burn")} (${formatStacks(
        burnAfter
      )}).`
    );
  }
  const chiDiff =
    (attackerAfter.tokens.chi ?? 0) - (attackerBefore.tokens.chi ?? 0);
  if (chiDiff > 0) {
    lines.push(
      `${attackerBefore.hero.name} gains ${resourceTag("Chi")} (+${chiDiff}).`
    );
  }
  const evasiveDiff =
    (attackerAfter.tokens.evasive ?? 0) -
    (attackerBefore.tokens.evasive ?? 0);
  if (evasiveDiff > 0) {
    lines.push(
      `${attackerBefore.hero.name} gains ${resourceTag("Evasive")} (+${evasiveDiff}).`
    );
  }
  return lines;
};

export const buildAttackResolutionLines = ({
  attackerBefore,
  attackerAfter,
  defenderBefore,
  defenderAfter,
  incomingDamage,
  defenseRoll,
  manualDefense,
  manualEvasive,
  reflectedDamage,
}: AttackResolutionLogArgs) => {
  const lines: string[] = [];
  const damageDealt = Math.max(0, defenderBefore.hp - defenderAfter.hp);
  const blocked = Math.max(0, incomingDamage - damageDealt);

  if (manualEvasive?.used) {
    const evasionResult = manualEvasive.success ? "success" : "fail";
    lines.push(
      indentLog(
        `${manualEvasive.label ?? defenderBefore.hero.name} Evasive (roll: ${
          manualEvasive.roll
        }) -> ${evasionResult}.`
      )
    );
    if (manualEvasive.success) {
      lines.push(
        indentLog(
          `${defenderBefore.hero.name} HP: ${defenderAfter.hp}/${defenderAfter.hero.maxHp}.`
        )
      );
      return lines;
    }
  }

  if (manualDefense) {
    const name = manualDefense.label ?? defenderBefore.hero.name;
    const baseBlocked = manualDefense.baseReduced ?? manualDefense.reduced;
    const chiUsed = manualDefense.chiUsed ?? 0;

    lines.push(
      indentLog(
        `${name} Defense Roll: ${manualDefense.roll} - Block ${baseBlocked} damage.`
      )
    );

    if (chiUsed > 0) {
      lines.push(
        indentLog(
          `${resourceTag("Chi")} +${chiUsed} = Blocked ${manualDefense.reduced} damage.`
        )
      );
    } else if (manualDefense.reduced !== baseBlocked) {
      lines.push(
        indentLog(`Blocked ${manualDefense.reduced} damage.`)
      );
    }

    lines.push(indentLog(`Hit for ${damageDealt}.`));

    if (manualDefense.reflect > 0) {
      lines.push(
        indentLog(
          `${name} reflects ${manualDefense.reflect} damage.`
        )
      );
    }
  } else if (defenseRoll !== undefined) {
    let defenseLine = `${defenderBefore.hero.name} defense (roll: ${defenseRoll}): Hit for ${damageDealt} dmg (blocked ${blocked}).`;
    if (reflectedDamage > 0) {
      defenseLine = defenseLine.replace(
        /\.$/,
        `, reflected ${reflectedDamage}.`
      );
    }
    lines.push(indentLog(defenseLine));
  } else if (incomingDamage > 0) {
    let genericLine = `${defenderBefore.hero.name} receives ${damageDealt} dmg (blocked ${blocked}).`;
    if (reflectedDamage > 0) {
      genericLine = genericLine.replace(
        /\.$/,
        ` Reflected ${reflectedDamage}.`
      );
    }
    lines.push(indentLog(genericLine));
  }

  lines.push(
    indentLog(
      `${defenderBefore.hero.name} HP: ${defenderAfter.hp}/${defenderAfter.hero.maxHp}.`
    )
  );

  const statusLines = getStatusGainLines(
    attackerBefore,
    attackerAfter,
    defenderBefore,
    defenderAfter
  );
  statusLines.forEach((line) => lines.push(indentLog(line)));

  if (reflectedDamage > 0) {
    lines.push(
      indentLog(
        `${attackerBefore.hero.name} HP: ${attackerAfter.hp}/${attackerAfter.hero.maxHp}.`
      )
    );
  }

  return lines;
};

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
        `[Hod] ${attackerName} \u00fato\u010d\u00ed: ${formatDice(diceValues)} -> ${formatAbilityName(
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
        `[Hod] ${attackerName} \u00fato\u010d\u00ed: ${formatDice(diceValues)} -> \u017diadna kombin\u00e1cia.`,
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
      pushLog(indentLog(`AI hod: ${formatDice(diceValues)} -> \u017diadna kombin\u00e1cia.`));
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
