import type {
  Ability,
  DefenseCalculationResult,
  PlayerState,
} from "../types";

export type ManualEvasiveLog = {
  used: boolean;
  success: boolean;
  roll: number;
  label?: string;
  alreadySpent?: boolean;
};

export type ManualDefenseLog = {
  roll: number;
  reduced: number;
  reflect: number;
  chiUsed?: number;
  baseReduced?: number;
  label?: string;
};

const abilityTag = (value: string) => `<<ability:${value}>>`;
const statusTag = (value: string) => `<<status:${value}>>`;
const resourceTag = (value: string) => `<<resource:${value}>>`;
const formatStacks = (value: number) =>
  `${value} stack${value === 1 ? "" : "s"}`;

export const formatDice = (values: number[]) => values.join(" ");
export const indentLog = (line: string) => ` > ${line}`;

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
  defenseOutcome,
  attackChiSpent,
  defenseChiSpent,
}: {
  attackerBefore: PlayerState;
  attackerAfter: PlayerState;
  defenderBefore: PlayerState;
  defenderAfter: PlayerState;
  incomingDamage: number;
  defenseRoll?: number;
  manualDefense?: ManualDefenseLog;
  manualEvasive?: ManualEvasiveLog;
  reflectedDamage: number;
  defenseOutcome?: DefenseCalculationResult;
  attackChiSpent?: number;
  defenseChiSpent?: number;
}) => {
  const lines: string[] = [];
  lines.push(
    indentLog(
      `Threatened damage: ${incomingDamage}${
        manualEvasive?.used ? " (pre-evasion)" : ""
      }.`
    )
  );
  if (attackChiSpent && attackChiSpent > 0) {
    lines.push(
      indentLog(
        `${attackerBefore.hero.name} spends ${resourceTag("Chi")} x${attackChiSpent} for +${attackChiSpent} dmg.`
      )
    );
  }
  if (defenseChiSpent && defenseChiSpent > 0) {
    lines.push(
      indentLog(
        `${defenderBefore.hero.name} spends ${resourceTag("Chi")} x${defenseChiSpent} for +${defenseChiSpent} block.`
      )
    );
  }
  const damageDealt = Math.max(0, defenderBefore.hp - defenderAfter.hp);
  const blocked = Math.max(0, incomingDamage - damageDealt);
  let addedDefenderHpLine = false;
  let addedAttackerHpLine = false;

  if (manualEvasive?.used) {
    lines.push(
      indentLog(
        `${manualEvasive.label ?? defenderBefore.hero.name} Evasive (roll: ${
          manualEvasive.roll
        }): ${manualEvasive.success ? "Success" : "Fail"}.`
      )
    );
    if (manualEvasive.success) {
      lines.push(
        indentLog(
          `${defenderBefore.hero.name} HP: ${defenderAfter.hp}/${defenderAfter.hero.maxHp}.`
        )
      );
      addedDefenderHpLine = true;
    }
  }

  if (manualDefense) {
    const base =
      manualDefense.baseReduced !== undefined
        ? manualDefense.baseReduced
        : manualDefense.reduced;
    let summaryLine = `${manualDefense.label ?? defenderBefore.hero.name} defense roll: ${manualDefense.roll} -> Block ${manualDefense.reduced}${manualDefense.reflect ? `, Reflect ${manualDefense.reflect}` : ""}.`;
    if (manualDefense.chiUsed && manualDefense.chiUsed > 0) {
      summaryLine = summaryLine.replace(
        /\.$/,
        ` (+${manualDefense.chiUsed} Chi block).`
      );
    }
    lines.push(indentLog(summaryLine));
    if (manualDefense.reflect > 0) {
      lines.push(
        indentLog(
          `${attackerBefore.hero.name} HP: ${attackerAfter.hp}/${attackerAfter.hero.maxHp}.`
        )
      );
      addedAttackerHpLine = true;
    }
    lines.push(indentLog(`Hit for ${damageDealt}.`));
    lines.push(
      indentLog(
        `${defenderBefore.hero.name} HP: ${defenderAfter.hp}/${defenderAfter.hero.maxHp}.`
      )
    );
    addedDefenderHpLine = true;
  } else if (defenseRoll !== undefined) {
    let defenseLine = `${defenderBefore.hero.name} defense (roll: ${defenseRoll}): Hit for ${damageDealt} dmg (blocked ${blocked}).`;
    if (reflectedDamage > 0) {
      defenseLine = defenseLine.replace(/\.$/, `, reflected ${reflectedDamage}.`);
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

  if (!addedDefenderHpLine) {
    lines.push(
      indentLog(
        `${defenderBefore.hero.name} HP: ${defenderAfter.hp}/${defenderAfter.hero.maxHp}.`
      )
    );
  }

  const statusLines = getStatusGainLines(
    attackerBefore,
    attackerAfter,
    defenderBefore,
    defenderAfter
  );
  statusLines.forEach((line) => lines.push(indentLog(line)));

  if (!addedAttackerHpLine && reflectedDamage > 0) {
    lines.push(
      indentLog(
        `${attackerBefore.hero.name} HP: ${attackerAfter.hp}/${attackerAfter.hero.maxHp}.`
      )
    );
  }

  return lines;
};

