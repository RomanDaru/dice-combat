import type { Combo, HeroId } from "../game/types";

import PyromancerInfernoWebp from "./Abilities/Pyromancer_Abilities/LS_Inferno.webp";
import PyromancerInfernoPng from "./Abilities/Pyromancer_Abilities/LS_Inferno.png";
import PyromancerSupernovaWebp from "./Abilities/Pyromancer_Abilities/5OAK_Supernova.webp";
import PyromancerSupernovaPng from "./Abilities/Pyromancer_Abilities/5OAK_Supernova.png";

type AbilityIconSources = {
  webp?: string;
  png: string;
};

export const abilityIconMap: Record<
  HeroId,
  Partial<Record<Combo, AbilityIconSources>>
> = {
  Pyromancer: {
    LARGE_STRAIGHT: {
      webp: PyromancerInfernoWebp,
      png: PyromancerInfernoPng,
    },
    "5OAK": {
      webp: PyromancerSupernovaWebp,
      png: PyromancerSupernovaPng,
    },
  },
};

export const getAbilityIcon = (
  heroId: HeroId,
  combo: Combo
): AbilityIconSources | undefined => abilityIconMap[heroId]?.[combo];
