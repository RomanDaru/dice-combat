import type { Combo, HeroId } from "../game/types";

import PyromancerPairPairPng from "./Abilities/Pyromancer_Abilities/PAIR_PAIR_Pyroclasm.png";
import PyromancerPairPairWebp from "./Abilities/Pyromancer_Abilities/PAIR_PAIR_Pyroclasm.webp";
import PyromancerThreeOakPng from "./Abilities/Pyromancer_Abilities/3OAK_Fireball.png";
import PyromancerThreeOakWebp from "./Abilities/Pyromancer_Abilities/3OAK_Fireball.webp";
import PyromancerFourOakPng from "./Abilities/Pyromancer_Abilities/4OAK_Ashfall.png";
import PyromancerFourOakWebp from "./Abilities/Pyromancer_Abilities/4OAK_Ashfall.webp";
import PyromancerSmallStraightPng from "./Abilities/Pyromancer_Abilities/SS_Explosive_Rune.png";
import PyromancerSmallStraightWebp from "./Abilities/Pyromancer_Abilities/SS_Explosive_Rune.webp";
import PyromancerFullHousePng from "./Abilities/Pyromancer_Abilities/FH_Infernal Concord.png";
import PyromancerFullHouseWebp from "./Abilities/Pyromancer_Abilities/FH_Infernal Concord.webp";
import PyromancerLargeStraightPng from "./Abilities/Pyromancer_Abilities/LS_Inferno.png";
import PyromancerLargeStraightWebp from "./Abilities/Pyromancer_Abilities/LS_Inferno.webp";
import PyromancerLargeStraightDefensePng from "./Abilities/Pyromancer_Abilities/DEF_LS_Supernova_Rune.png";
import PyromancerLargeStraightDefenseWebp from "./Abilities/Pyromancer_Abilities/DEF_LS_Supernova_Rune.webp";
import PyromancerFiveOakPng from "./Abilities/Pyromancer_Abilities/5OAK_Supernova.png";
import PyromancerFiveOakWebp from "./Abilities/Pyromancer_Abilities/5OAK_Supernova.webp";

type AbilityIconSources = {
  webp?: string;
  png: string;
};

type AbilityIconVariants = {
  offense?: AbilityIconSources;
  defense?: AbilityIconSources;
};

export const abilityIconMap: Record<
  HeroId,
  Partial<Record<Combo, AbilityIconVariants>>
> = {
  Pyromancer: {
    PAIR_PAIR: {
      offense: {
        png: PyromancerPairPairPng,
        webp: PyromancerPairPairWebp,
      },
    },
    "3OAK": {
      offense: {
        png: PyromancerThreeOakPng,
        webp: PyromancerThreeOakWebp,
      },
    },
    "4OAK": {
      offense: {
        png: PyromancerFourOakPng,
        webp: PyromancerFourOakWebp,
      },
    },
    SMALL_STRAIGHT: {
      offense: {
        png: PyromancerSmallStraightPng,
        webp: PyromancerSmallStraightWebp,
      },
    },
    FULL_HOUSE: {
      offense: {
        png: PyromancerFullHousePng,
        webp: PyromancerFullHouseWebp,
      },
    },
    LARGE_STRAIGHT: {
      offense: {
        png: PyromancerLargeStraightPng,
        webp: PyromancerLargeStraightWebp,
      },
      defense: {
        png: PyromancerLargeStraightDefensePng,
        webp: PyromancerLargeStraightDefenseWebp,
      },
    },
    "5OAK": {
      offense: {
        png: PyromancerFiveOakPng,
        webp: PyromancerFiveOakWebp,
      },
    },
  },
};

export const getAbilityIcon = (
  heroId: HeroId,
  combo: Combo,
  options: { variant?: "offense" | "defense" } = {}
): AbilityIconSources | undefined => {
  const variants = abilityIconMap[heroId]?.[combo];
  if (!variants) return undefined;
  if (options.variant === "defense") {
    return variants.defense ?? variants.offense;
  }
  return variants.offense ?? variants.defense;
};
