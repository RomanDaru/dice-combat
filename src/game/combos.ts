import { getOffensiveAbilities } from "./abilityBoards";
import type { Rng } from "../engine/rng";
import { OffensiveAbility, Combo, Hero } from "./types";

export const rollDie = (rng: Rng) => 1 + Math.floor(rng() * 6);

export function detectCombos(dice: number[]) {
  const sorted = [...dice].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  dice.forEach((d) => counts.set(d, (counts.get(d) ?? 0) + 1));
  const vals = [...counts.values()];
  const pairsExact = vals.filter((v) => v === 2).length;
  const hasThreeKind = vals.some((v) => v >= 3);
  const has4 = vals.some((v) => v >= 4);
  const has5 = vals.some((v) => v >= 5);
  const hasFullHouse = vals.includes(3) && vals.includes(2);

  const uniq = Array.from(new Set(sorted));
  const hasSeq = (seq: number[]) => seq.every((v) => uniq.includes(v));

  const smallStraight = hasSeq([1, 2, 3, 4]) || hasSeq([2, 3, 4, 5]) || hasSeq([3, 4, 5, 6]);
  const largeStraight = hasSeq([1, 2, 3, 4, 5]) || hasSeq([2, 3, 4, 5, 6]);

  return {
    "5OAK": has5,
    "4OAK": has4,
    FULL_HOUSE: hasFullHouse,
    "3OAK": hasThreeKind,
    PAIR_PAIR: pairsExact >= 2,
    SMALL_STRAIGHT: smallStraight,
    LARGE_STRAIGHT: largeStraight,
  } as Record<Combo, boolean>;
}

export function bestAbility(hero: Hero, dice: number[]): OffensiveAbility | null {
  const found = detectCombos(dice);
  const abilities = getOffensiveAbilities(hero);
  const legal = abilities.filter((ability) => found[ability.combo]);
  if (!legal.length) return null;
  return legal.sort((a, b) => {
    if (!!b.ultimate !== !!a.ultimate) return (b.ultimate ? 1 : 0) - (a.ultimate ? 1 : 0);
    if (b.damage !== a.damage) return b.damage - a.damage;
    const aw = a.apply ? Object.keys(a.apply).length : 0;
    const bw = b.apply ? Object.keys(b.apply).length : 0;
    return bw - aw;
  })[0];
}

export function abilityFromCombo(
  hero: Hero,
  combo: Combo
): OffensiveAbility | null {
  const abilities = getOffensiveAbilities(hero);
  return abilities.find((ability) => ability.combo === combo) ?? null;
}

export function selectedAbilityForHero(
  hero: Hero,
  dice: number[],
  selection: Combo | null
): OffensiveAbility | null {
  if (!selection) return null;
  const combos = detectCombos(dice);
  if (!combos[selection]) return null;
  return abilityFromCombo(hero, selection);
}
