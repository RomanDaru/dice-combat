import { getOffensiveAbilities } from './abilityBoards';
import { OffensiveAbility, Combo, Hero } from './types';

export const rollDie = () => 1 + Math.floor(Math.random() * 6);

export function detectCombos(dice: number[]) {
  const sorted = [...dice].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  dice.forEach((d) => counts.set(d, (counts.get(d) ?? 0) + 1));
  const vals = [...counts.values()];
  const pairs = vals.filter((v) => v === 2).length;
  const has3 = vals.includes(3);
  const has4 = vals.includes(4);
  const has5 = vals.includes(5);

  const uniq = Array.from(new Set(sorted));
  const hasSeq = (seq: number[]) => seq.every((v) => uniq.includes(v));

  const smallStraight = hasSeq([1, 2, 3, 4]) || hasSeq([2, 3, 4, 5]) || hasSeq([3, 4, 5, 6]);
  const largeStraight = hasSeq([1, 2, 3, 4, 5]) || hasSeq([2, 3, 4, 5, 6]);

  return {
    "5OAK": has5,
    "4OAK": has4,
    FULL_HOUSE: has3 && pairs === 1,
    "3OAK": has3 && pairs === 0,
    PAIR_PAIR: pairs === 2,
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
