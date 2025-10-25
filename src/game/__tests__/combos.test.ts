import { describe, expect, it } from 'vitest';
import { detectCombos, bestAbility } from '../combos';
import { HEROES } from '../heroes';

describe('detectCombos', () => {
  it('detects small straight (1-2-3-4-5)', () => {
    expect(detectCombos([1, 2, 3, 4, 5]).SMALL_STRAIGHT).toBe(true);
  });

  it('detects small straight with wildcard (1-2-3-4-x)', () => {
    expect(detectCombos([1, 2, 3, 4, 6]).SMALL_STRAIGHT).toBe(true);
  });

  it('rejects small straight when gap (1-2-3-5-6)', () => {
    expect(detectCombos([1, 2, 3, 5, 6]).SMALL_STRAIGHT).toBe(false);
  });

  it('detects large straight (2-3-4-5-6)', () => {
    expect(detectCombos([2, 3, 4, 5, 6]).LARGE_STRAIGHT).toBe(true);
  });

  it('detects large straight (1-2-3-4-5)', () => {
    expect(detectCombos([1, 2, 3, 4, 5]).LARGE_STRAIGHT).toBe(true);
  });

  it('rejects large straight if duplicate (1-2-3-4-6)', () => {
    expect(detectCombos([1, 2, 3, 4, 6]).LARGE_STRAIGHT).toBe(false);
  });

  it('detects four-of-a-kind', () => {
    expect(detectCombos([2, 2, 2, 2, 5])['4OAK']).toBe(true);
  });

  it('detects full house', () => {
    expect(detectCombos([2, 2, 2, 6, 6]).FULL_HOUSE).toBe(true);
  });

  it('detects three-of-a-kind', () => {
    expect(detectCombos([3, 3, 3, 4, 5])['3OAK']).toBe(true);
  });

  it('detects double pair', () => {
    expect(detectCombos([1, 1, 6, 6, 3]).PAIR_PAIR).toBe(true);
  });

  it('allows duplicate inside small straight (1-2-3-4-4)', () => {
    expect(detectCombos([1, 2, 3, 4, 4]).SMALL_STRAIGHT).toBe(true);
  });

  it('requires unique dice for large straight (1-2-3-4-4)', () => {
    expect(detectCombos([1, 2, 3, 4, 4]).LARGE_STRAIGHT).toBe(false);
  });
});

describe('bestAbility', () => {
  const pyro = HEROES.Pyromancer;
  const monk = HEROES['Shadow Monk'];

  it('prefers full house for Pyromancer on 22266', () => {
    expect(bestAbility(pyro, [2, 2, 2, 6, 6])?.combo).toBe('FULL_HOUSE');
  });

  it('returns expected damage for Pyromancer full house', () => {
    expect(bestAbility(pyro, [2, 2, 2, 6, 6])?.damage).toBe(8);
  });

  it('picks ultimate for Pyromancer large straight', () => {
    const ability = bestAbility(pyro, [2, 3, 4, 5, 6]);
    expect(ability?.combo).toBe('LARGE_STRAIGHT');
    expect(ability?.damage).toBe(12);
  });

  it('picks Pyromancer 5OAK as ultimate', () => {
    const ability = bestAbility(pyro, [5, 5, 5, 5, 5]);
    expect(ability?.combo).toBe('5OAK');
    expect(ability?.damage).toBe(13);
  });

  it('selects full house for Shadow Monk', () => {
    const ability = bestAbility(monk, [3, 3, 3, 6, 6]);
    expect(ability?.combo).toBe('FULL_HOUSE');
    expect(ability?.damage).toBe(7);
  });

  it('returns null when no ability is available', () => {
    expect(bestAbility(pyro, [1, 2, 2, 3, 6])).toBeNull();
  });
});

