import { DefensiveAbility, Hero, OffensiveAbility } from "./types";

export const getOffensiveAbilities = (
  hero: Hero
): OffensiveAbility[] =>
  Object.values(hero.offensiveBoard).filter(
    (ability): ability is OffensiveAbility => Boolean(ability)
  );

export const getDefensiveAbilities = (
  hero: Hero
): DefensiveAbility[] =>
  Object.values(hero.defensiveBoard).filter(
    (ability): ability is DefensiveAbility => Boolean(ability)
  );
