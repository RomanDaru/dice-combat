import { describe, expect, it } from 'vitest';
import { applyAttack } from '../engine';
import { getOffensiveAbilities } from '../abilityBoards';
import { createInitialState } from '../state';
import { HEROES } from '../heroes';
import type {
  DefenseRollResult,
  ResolvedDefenseState,
} from '../combat/types';
import {
  createStatusSpendSummary,
  getStacks,
  spendStatus,
} from '../../engine/status';

const createPlayers = () => {
  const state = createInitialState(HEROES.Pyromancer, HEROES['Shadow Monk']);
  return {
    pyro: state.players.you,
    monk: state.players.ai,
  };
};

const emptyDefenseRoll: DefenseRollResult = {
  dice: [],
  combos: [],
  options: [],
};

const buildDefense = (
  overrides: Partial<ResolvedDefenseState>,
): ResolvedDefenseState => ({
  selection: { roll: emptyDefenseRoll, selected: null },
  baseBlock: 0,
  reflect: 0,
  heal: 0,
  appliedTokens: {},
  retaliatePercent: 0,
  statusSpends: [],
  ...overrides,
});

describe('applyAttack', () => {
  it('applies damage, burn, and respects block', () => {
    const { pyro, monk } = createPlayers();
    const inferno = getOffensiveAbilities(pyro.hero).find(
      (ab) => ab.combo === 'LARGE_STRAIGHT',
    )!;

    const [nextPyro, nextMonk, notes] = applyAttack(pyro, monk, inferno, {
      defense: buildDefense({ baseBlock: 2 }),
    });

    expect(nextMonk.hp).toBe(monk.hp - (inferno.damage - 2));
    expect(getStacks(nextMonk.tokens, 'burn', 0)).toBe(2);
    expect(nextPyro.hp).toBe(pyro.hp);
    expect(notes).toContain('Hit for 10 dmg (blocked 2).');
  });

  it('awards chi when ability grants it', () => {
    const { pyro, monk } = createPlayers();
    const chiStrike = getOffensiveAbilities(monk.hero).find(
      (ab) => ab.combo === 'FULL_HOUSE',
    )!;

    const [nextMonk, nextPyro] = applyAttack(monk, pyro, chiStrike, {
      defense: buildDefense({ baseBlock: 3 }),
    });

    expect(getStacks(nextMonk.tokens, 'chi', 0)).toBe(1);
    expect(nextPyro.hp).toBe(pyro.hp - Math.max(0, chiStrike.damage - 3));
  });

  it('consumes evasive token and cancels damage on success', () => {
    const { pyro, monk } = createPlayers();
    const fireball = getOffensiveAbilities(pyro.hero).find(
      (ab) => ab.combo === '3OAK'
    )!;

    const evasiveMonk = {
      ...monk,
      tokens: { ...monk.tokens, evasive: 1 },
    };

    const result = spendStatus(
      evasiveMonk.tokens,
      'evasive',
      'defenseRoll',
      { phase: 'defenseRoll', roll: 6 }
    );
    expect(result).not.toBeNull();

    const summary = createStatusSpendSummary('evasive', 1, [
      result!.spend,
    ]);

    const defenderAfterSpend = {
      ...evasiveMonk,
      tokens: result!.next,
    };

    const [nextPyro, nextMonk, notes] = applyAttack(
      pyro,
      defenderAfterSpend,
      fireball,
      {
        defense: buildDefense({ statusSpends: [summary] }),
      }
    );

    expect(nextMonk.hp).toBe(defenderAfterSpend.hp);
    expect(getStacks(nextMonk.tokens, 'evasive', 0)).toBe(0);
    expect(nextPyro.hp).toBe(pyro.hp);
    expect(notes.some((line) => line.includes('Hit for 0 dmg'))).toBe(true);
  });
});
