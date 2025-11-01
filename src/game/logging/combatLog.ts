import type { PlayerState } from "../types";
import type { ResolvedDefenseState } from "../combat/types";

export type ManualEvasiveLog = {
  used: boolean;
  success: boolean;
  roll: number;
  label?: string;
  alreadySpent?: boolean;
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

const describeDefenseAbility = (defense: ResolvedDefenseState | null) => {
  if (!defense?.selection.selected) return null;
  const ability = defense.selection.selected.ability;
  const abilityName =
    ability.displayName ?? ability.label ?? ability.combo;
  const dice = formatDice(defense.selection.roll.dice);
  const segments = [`${abilityTag(abilityName)} on roll [${dice}]`];
  segments.push(`Block ${defense.block}`);
  if (defense.reflect) segments.push(`Reflect ${defense.reflect}`);
  if (defense.heal) segments.push(`Heal ${defense.heal}`);
  return segments.join(" -> ");
};

export const buildAttackResolutionLines = ({
  attackerBefore,
  attackerAfter,
  defenderBefore,
  defenderAfter,
  incomingDamage,
  defense,
  manualEvasive,
  attackChiSpent,
}: {
  attackerBefore: PlayerState;
  attackerAfter: PlayerState;
  defenderBefore: PlayerState;
  defenderAfter: PlayerState;
  incomingDamage: number;
  defense?: ResolvedDefenseState | null;
  manualEvasive?: ManualEvasiveLog;
  attackChiSpent?: number;
}) => {
  const lines: string[] = [];
  lines.push(indentLog(`Threatened damage: ${incomingDamage}.`));
  if (attackChiSpent && attackChiSpent > 0) {
    lines.push(
      indentLog(
        `${attackerBefore.hero.name} spends ${resourceTag("Chi")} x${attackChiSpent} for +${attackChiSpent} dmg.`
      )
    );
  }
  if (defense?.chiSpent && defense.chiSpent > 0) {
    const chiBlockGain =
      typeof defense.chiBonusBlock === "number"
        ? defense.chiBonusBlock
        : defense.chiSpent;
    lines.push(
      indentLog(
        `${defenderBefore.hero.name} spends ${resourceTag(
          "Chi"
        )} x${defense.chiSpent} for +${chiBlockGain} block.`
      )
    );
  }

  const damageDealt = Math.max(0, defenderBefore.hp - defenderAfter.hp);
  const blocked = Math.max(0, incomingDamage - damageDealt);
  const reflectedDamage = Math.max(0, attackerBefore.hp - attackerAfter.hp);

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
      return lines;
    }
  }

  const defenseSummary = describeDefenseAbility(defense ?? null);
  if (defenseSummary) {
    lines.push(indentLog(defenseSummary));
  }

  let summary = `${defenderBefore.hero.name} receives ${damageDealt} dmg (blocked ${blocked}).`;
  if (reflectedDamage > 0) {
    summary = `${summary.slice(0, -1)} Reflected ${reflectedDamage}.`;
  }
  lines.push(indentLog(summary));
  lines.push(
    indentLog(
      `${defenderBefore.hero.name} HP: ${defenderAfter.hp}/${defenderAfter.hero.maxHp}.`
    )
  );
  if (reflectedDamage > 0) {
    lines.push(
      indentLog(
        `${attackerBefore.hero.name} HP: ${attackerAfter.hp}/${attackerAfter.hero.maxHp}.`
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

  return lines;
};
