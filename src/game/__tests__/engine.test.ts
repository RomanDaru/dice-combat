import { describe, expect, it } from 'vitest';
import { applyAttack } from '../engine';
import { getOffensiveAbilities } from '../abilityBoards';
import { createInitialState } from '../state';
import { HEROES } from '../heroes';

const createPlayers = () => {
  const state = createInitialState(HEROES.Pyromancer, HEROES['Shadow Monk']);
  return {
    pyro: state.players.you,
    monk: state.players.ai,
  };
};

describe('applyAttack', () => {
  it('applies damage, burn, and respects manual defense', () => {
    const { pyro, monk } = createPlayers();
    const inferno = getOffensiveAbilities(pyro.hero).find(
      (ab) => ab.combo === 'LARGE_STRAIGHT',
    )!;

    const [nextPyro, nextMonk, notes] = applyAttack(pyro, monk, inferno, {
      manualDefense: { reduced: 2, reflect: 0, roll: 5, label: 'Monk' },
    });

    expect(nextMonk.hp).toBe(monk.hp - (inferno.damage - 2));
    expect(nextMonk.tokens.burn).toBe(2);
    expect(nextPyro.hp).toBe(pyro.hp);
    expect(notes).toContain('Hit for 10 dmg (blocked 2).');
  });

  it('awards chi when ability grants it', () => {
    const { pyro, monk } = createPlayers();
    const chiStrike = getOffensiveAbilities(monk.hero).find(
      (ab) => ab.combo === 'FULL_HOUSE',
    )!;

    const [nextMonk, nextPyro] = applyAttack(monk, pyro, chiStrike, {
      manualDefense: { reduced: 3, reflect: 0, roll: 6, label: 'Pyro' },
    });

    expect(nextMonk.tokens.chi).toBe(1);
    expect(nextPyro.hp).toBe(pyro.hp - Math.max(0, chiStrike.damage - 3));
  });

  it('consumes evasive token and cancels damage on success', () => {
    const { pyro, monk } = createPlayers();
    const targetedMonk = {
      ...monk,
      tokens: { ...monk.tokens, evasive: 1 },
    };
    const fireball = getOffensiveAbilities(pyro.hero).find(
      (ab) => ab.combo === '3OAK',
    )!;

    const [nextPyro, nextMonk, notes] = applyAttack(
      pyro,
      targetedMonk,
      fireball,
      {
        manualEvasive: { used: true, success: true, roll: 6, label: 'Monk' },
      },
    );

    expect(nextMonk.hp).toBe(targetedMonk.hp);
    expect(nextMonk.tokens.evasive).toBe(0);
    expect(nextPyro.hp).toBe(pyro.hp);
    expect(notes[0]).toMatch(/Evasive roll: 6 -> Attack fully dodged/);
  });
});
