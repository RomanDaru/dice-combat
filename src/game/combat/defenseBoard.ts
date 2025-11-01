import { detectCombos, rollDie } from "../combos";
import type { Combo, Hero } from "../types";
import type { Rng } from "../../engine/rng";
import type {
  BaseDefenseResolution,
  DefenseBoardOption,
  DefenseRollResult,
  DefenseSelection,
} from "./types";

export const DEFENSE_COMBO_PRIORITY: Combo[] = [
  "5OAK",
  "LARGE_STRAIGHT",
  "4OAK",
  "FULL_HOUSE",
  "SMALL_STRAIGHT",
  "3OAK",
  "PAIR_PAIR",
];

export const rollDefenseDice = (rng: Rng): number[] =>
  Array.from({ length: 5 }, () => rollDie(rng));

export const evaluateDefenseRoll = (
  hero: Hero,
  dice: number[]
): DefenseRollResult => {
  const combos = detectCombos(dice);
  const orderedCombos = DEFENSE_COMBO_PRIORITY.filter(
    (combo) => combos[combo]
  );

  const options: DefenseBoardOption[] = orderedCombos
    .map((combo) => {
      const ability = hero.defensiveBoard[combo];
      if (!ability) return null;
      return { combo, ability };
    })
    .filter((option): option is DefenseBoardOption => option !== null);

  return {
    dice,
    combos: orderedCombos,
    options,
  };
};

export const resolveDefenseSelection = (
  selection: DefenseSelection
): BaseDefenseResolution => {
  const selectedAbility = selection.selected?.ability;

  const baseBlock = selectedAbility?.block ?? 0;
  const reflect = selectedAbility?.reflect ?? 0;
  const heal = selectedAbility?.heal ?? 0;
  const appliedTokens = selectedAbility?.apply
    ? { ...selectedAbility.apply }
    : {};

  return {
    selection,
    baseBlock,
    reflect,
    heal,
    appliedTokens,
    retaliatePercent: selectedAbility?.retaliatePercent,
  };
};

export const selectDefenseOptionByCombo = (
  result: DefenseRollResult,
  combo: Combo | null
): DefenseSelection => {
  if (!combo) {
    return {
      roll: result,
      selected: null,
    };
  }

  const selected = result.options.find((option) => option.combo === combo) ?? null;

  return {
    roll: result,
    selected,
  };
};

export const selectHighestBlockOption = (
  result: DefenseRollResult
): DefenseSelection => {
  const selected =
    result.options
      .slice()
      .sort((a, b) => (b.ability.block ?? 0) - (a.ability.block ?? 0))[0] ??
    null;

  return {
    roll: result,
    selected,
  };
};
