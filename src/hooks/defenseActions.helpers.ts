import type { StatusSpendSummary } from "../engine/status";
import { buildDefensePlan } from "../game/combat/defensePipeline";
import type { DefensiveAbility, OffensiveAbility } from "../game/types";

export const formatAbilityName = (offense: OffensiveAbility): string =>
  offense.displayName ?? offense.label ?? offense.combo;

const formatDefenseAbilityName = (
  ability: DefensiveAbility | null | undefined
): string | null =>
  ability?.displayName ?? ability?.label ?? ability?.combo ?? null;

export type DefenseSelectionCarrier = {
  selection: { selected: { ability: DefensiveAbility } | null };
};

export const extractDefenseAbilityName = (
  defense: DefenseSelectionCarrier | null | undefined
): string | null =>
  formatDefenseAbilityName(defense?.selection?.selected?.ability);

export const combineDefenseSpends = (
  resolution: ReturnType<typeof buildDefensePlan>["defense"] | null,
  extraSpends: StatusSpendSummary[]
): ReturnType<typeof buildDefensePlan>["defense"] | null => {
  if (!resolution && extraSpends.length === 0) {
    return null;
  }
  if (!resolution) {
    return {
      selection: {
        roll: { dice: [], combos: [], options: [] },
        selected: null,
      },
      baseBlock: 0,
      reflect: 0,
      heal: 0,
      appliedTokens: {},
      retaliatePercent: 0,
      statusSpends: [...extraSpends],
    };
  }
  if (extraSpends.length === 0) {
    return resolution;
  }
  return {
    ...resolution,
    statusSpends: [...resolution.statusSpends, ...extraSpends],
  };
};
