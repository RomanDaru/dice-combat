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

export const DefenseModifierRegistry: IDefenseModifier[] = [];
