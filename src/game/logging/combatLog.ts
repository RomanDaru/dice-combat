import { getStacks, getStatus } from "../../engine/status";
import type {
  AggregatedStatusSpends,
  StatusSpendSummary,
} from "../../engine/status";
import type { PlayerState } from "../types";
import type { ResolvedDefenseState } from "../combat/types";

const abilityTag = (value: string) => `<<ability:${value}>>`;
const statusTag = (value: string) => `<<status:${value}>>`;
const resourceTag = (value: string) => `<<resource:${value}>>`;
const formatStacks = (value: number) =>
  `${value} stack${value === 1 ? "" : "s"}`;

export const formatDice = (values: number[]) => values.join(" ");
export const indentLog = (line: string) => ` > ${line}`;

const describeStatusGain = (
  label: string,
  count: number,
  target: PlayerState,
  isResource = false
) => {
  const tag = isResource ? resourceTag(label) : statusTag(label);
  const verb = isResource ? "gains" : "suffers";
  return `${target.hero.name} ${verb} ${tag} (${formatStacks(count)}).`;
};

const getStatusGainLines = (
  attackerBefore: PlayerState,
  attackerAfter: PlayerState,
  defenderBefore: PlayerState,
  defenderAfter: PlayerState
) => {
  const lines: string[] = [];
  const burnAttacker =
    getStacks(attackerAfter.tokens, "burn", 0) -
    getStacks(attackerBefore.tokens, "burn", 0);
  if (burnAttacker > 0) {
    lines.push(describeStatusGain("Burn", burnAttacker, attackerAfter, false));
  }
  const burnDefender =
    getStacks(defenderAfter.tokens, "burn", 0) -
    getStacks(defenderBefore.tokens, "burn", 0);
  if (burnDefender > 0) {
    lines.push(describeStatusGain("Burn", burnDefender, defenderAfter, false));
  }
  const chiDiff =
    getStacks(attackerAfter.tokens, "chi", 0) -
    getStacks(attackerBefore.tokens, "chi", 0);
  if (chiDiff > 0) {
    lines.push(describeStatusGain("Chi", chiDiff, attackerAfter, true));
  }
  const evasiveDiff =
    getStacks(attackerAfter.tokens, "evasive", 0) -
    getStacks(attackerBefore.tokens, "evasive", 0);
  if (evasiveDiff > 0) {
    lines.push(describeStatusGain("Evasive", evasiveDiff, attackerAfter, true));
  }
  const preventDiff =
    getStacks(defenderAfter.tokens, "prevent_half", 0) -
    getStacks(defenderBefore.tokens, "prevent_half", 0);
  if (preventDiff > 0) {
    lines.push(
      `${defenderAfter.hero.name} gains ${statusTag("Prevent Half")} (${formatStacks(
        preventDiff
      )}).`
    );
  }
  return lines;
};

const describeDefenseAbility = (
  defense: ResolvedDefenseState | null,
  baseBlock: number
) => {
  if (!defense?.selection.selected) return null;
  const ability = defense.selection.selected.ability;
  const abilityName =
    ability.displayName ?? ability.label ?? ability.combo;
  const details: string[] = [];
  if (baseBlock > 0) {
    details.push(`Block ${baseBlock}`);
  }
  if (defense.reflect) details.push(`Reflect ${defense.reflect}`);
  if (defense.heal) details.push(`Heal ${defense.heal}`);
  const suffix = details.length ? ` -> ${details.join(", ")}` : "";
  return `DEF: ${abilityTag(abilityName)}${suffix}.`;
};

const formatStatusLabel = (id: string) => {
  const def = getStatus(id);
  return statusTag(def?.name ?? id);
};

const formatStatusSpendLine = (spend: StatusSpendSummary) => {
  const label = formatStatusLabel(spend.id);
  const segments: string[] = [];
  if (spend.bonusDamage) segments.push(`+${spend.bonusDamage} dmg`);
  if (spend.bonusBlock) segments.push(`+${spend.bonusBlock} block`);
  if (spend.negateIncoming) segments.push("negates incoming damage");
  const effects =
    segments.length > 0 ? ` -> ${segments.join(", ")}` : "";
  return `Spend: ${label} x${spend.stacksSpent}${effects}.`;
};

const listStatusSpends = (totals: AggregatedStatusSpends) =>
  Object.values(totals.byStatus).map(formatStatusSpendLine);

export const buildAttackResolutionLines = ({
  attackerBefore,
  attackerAfter,
  defenderBefore,
  defenderAfter,
  baseBlock,
  defenseTokenDelta,
  attackTotals,
  defenseTotals,
  damageDealt,
  blocked,
  defense,
  reflectedDamage,
}: {
  attackerBefore: PlayerState;
  attackerAfter: PlayerState;
  defenderBefore: PlayerState;
  defenderAfter: PlayerState;
  baseBlock: number;
  defenseTokenDelta?: { chiDelta: number; evasiveDelta: number; burnDelta: number };
  attackTotals: AggregatedStatusSpends;
  defenseTotals: AggregatedStatusSpends;
  damageDealt: number;
  blocked: number;
  defense?: ResolvedDefenseState | null;
  reflectedDamage: number;
}) => {
  const lines: string[] = [];

  const defenseSummary = describeDefenseAbility(defense ?? null, baseBlock);
  if (defenseSummary) {
    lines.push(indentLog(defenseSummary));
  }
  listStatusSpends(defenseTotals)
    .forEach((line) => lines.push(indentLog(line)));
  defenseTotals.logs
    .filter(Boolean)
    .forEach((line) => lines.push(indentLog(line)));
  listStatusSpends(attackTotals)
    .forEach((line) => lines.push(indentLog(line)));
  attackTotals.logs
    .filter(Boolean)
    .forEach((line) => lines.push(indentLog(line)));

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
  if (defenseTokenDelta) {
    if (defenseTokenDelta.chiDelta > 0) {
      statusLines.push(
        `${defenderBefore.hero.name} gains ${statusTag("Chi")} (+${
          defenseTokenDelta.chiDelta
        }).`
      );
    }
    if (defenseTokenDelta.evasiveDelta > 0) {
      statusLines.push(
        `${defenderBefore.hero.name} gains ${statusTag("Evasive")} (+${
          defenseTokenDelta.evasiveDelta
        }).`
      );
    }
    if (defenseTokenDelta.burnDelta > 0) {
      statusLines.push(
        `${defenderBefore.hero.name} suffers ${statusTag("Burn")} (${formatStacks(
          getStacks(defenderAfter.tokens, "burn", 0)
        )}).`
      );
    }
  }
  statusLines.forEach((line) => lines.push(indentLog(line)));

  return lines;
};

