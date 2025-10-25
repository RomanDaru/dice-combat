import { HEROES } from './heroes';
import { bestAbility, detectCombos } from './combos';
import type { TestResult } from './types';

export function runTests(): TestResult[] {
  const res: TestResult[] = [];
  const eq = (name: string, a: any, b: any) => {
    const pass = JSON.stringify(a) === JSON.stringify(b);
    res.push({ name, pass, details: pass ? undefined : `${JSON.stringify(a)} != ${JSON.stringify(b)}` });
  };

  // detectCombos
  eq("Small straight detection (1-2-3-4-5)", detectCombos([1,2,3,4,5]).SMALL_STRAIGHT, true);
  eq("Small straight detection (1-2-3-4-x)", detectCombos([1,2,3,4,6]).SMALL_STRAIGHT, true);
  eq("Small straight negative (1-2-3-5-6)", detectCombos([1,2,3,5,6]).SMALL_STRAIGHT, false);
  eq("Large straight detection (2-3-4-5-6)", detectCombos([2,3,4,5,6]).LARGE_STRAIGHT, true);
  eq("Large straight detection (1-2-3-4-5)", detectCombos([1,2,3,4,5]).LARGE_STRAIGHT, true);
  eq("Large straight negative (1-2-3-4-6)", detectCombos([1,2,3,4,6]).LARGE_STRAIGHT, false);
  eq("4OAK detection", detectCombos([2,2,2,2,5])["4OAK"], true);
  eq("Full House detection", detectCombos([2,2,2,6,6]).FULL_HOUSE, true);
  eq("3OAK detection", detectCombos([3,3,3,4,5])["3OAK"], true);
  eq("Pair-Pair detection", detectCombos([1,1,6,6,3]).PAIR_PAIR, true);
  eq("Small straight with duplicate (1-2-3-4-4)", detectCombos([1,2,3,4,4]).SMALL_STRAIGHT, true);
  eq("Large straight requires unique (1-2-3-4-4)", detectCombos([1,2,3,4,4]).LARGE_STRAIGHT, false);

  // bestAbility (Pyromancer)
  const ab1 = bestAbility(HEROES.Pyromancer, [2,2,2,6,6]);
  eq("Pyro bestAbility prefers Full House on 22266", ab1?.combo, "FULL_HOUSE");
  eq("Pyro ability damage for Full House", ab1?.damage, 8);
  const ab2 = bestAbility(HEROES.Pyromancer, [2,3,4,5,6]);
  eq("Pyro bestAbility picks Large straight as ULT on 23456", ab2?.combo, "LARGE_STRAIGHT");
  eq("Pyro ULT damage on Large straight", ab2?.damage, 12);
  const ab5 = bestAbility(HEROES.Pyromancer, [5,5,5,5,5]);
  eq("Pyro bestAbility picks 5OAK as ULT", ab5?.combo, "5OAK");
  eq("Pyro 5OAK damage", ab5?.damage, 13);

  // bestAbility (Monk)
  const ab3 = bestAbility(HEROES["Shadow Monk"], [3,3,3,6,6]);
  eq("Monk bestAbility Full House on 33366", ab3?.combo, "FULL_HOUSE");
  eq("Monk Full House damage", ab3?.damage, 7);

  // no-ability case
  const ab4 = bestAbility(HEROES.Pyromancer, [1,2,2,3,6]);
  eq("No legal ability with single pair", ab4, null);

  return res;
}
