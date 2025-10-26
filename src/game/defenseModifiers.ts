import type { PlayerState } from "./types";
import type { DefenseModifierInfo } from "./types";

export interface IDefenseModifier {
  id: string;
  shouldApply: (defender: PlayerState, defenseRoll: number) => boolean;
  calculateBonus: (
    defender: PlayerState,
    defenseRoll: number
  ) => DefenseModifierInfo;
}

const ChiBonusModifier: IDefenseModifier = {
  id: "chi_bonus",
  shouldApply: (defender, defenseRoll) =>
    defenseRoll >= 5 && (defender.tokens.chi ?? 0) > 0,
  calculateBonus: (defender) => {
    const chiStacks = defender.tokens.chi ?? 0;
    return {
      id: "chi_bonus",
      source: "Chi",
      blockBonus: chiStacks,
      reflectBonus: 0,
      logDetail: `<<resource:Chi>> +${chiStacks}`,
    };
  },
};

export const DefenseModifierRegistry: IDefenseModifier[] = [ChiBonusModifier];
