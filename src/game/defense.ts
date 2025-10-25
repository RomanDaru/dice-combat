import { DefenseRoll, Tokens, PlayerState } from './types';
import { rollDie } from './combos';

function clampChi(chi: number) {
  return Math.max(0, Math.min(chi, 3));
}

export function pyroDefenseFromRoll({
  roll,
}: {
  roll: number;
  tokens: Tokens;
}) {
  if (roll >= 5) return { reflect: 0, reduced: 2 };
  if (roll >= 3) return { reflect: 0, reduced: 1 };
  return { reflect: 0, reduced: 0 };
}

export function pyroDefenseRoll(tokens: Tokens): DefenseRoll {
  const roll = rollDie();
  return { roll, ...pyroDefenseFromRoll({ roll, tokens }) };
}

export function monkDefenseFromRoll({
  roll,
  tokens,
}: {
  roll: number;
  tokens: Tokens;
}) {
  if (roll >= 5)
    return { reflect: 0, reduced: 2 + clampChi(tokens.chi ?? 0) };
  if (roll >= 3) return { reflect: 0, reduced: 1 };
  return { reflect: 0, reduced: 0 };
}

export function monkDefenseRoll(tokens: Tokens): DefenseRoll {
  const roll = rollDie();
  return { roll, ...monkDefenseFromRoll({ roll, tokens }) };
}

export const getBurnDamage = (stacks: number) =>
  stacks > 0 ? 2 + Math.min(stacks - 1, 2) : 0;

export function tickStatuses(state: PlayerState): PlayerState {
  let hp = state.hp;
  const burnStacks = state.tokens.burn ?? 0;
  const burnDamage = getBurnDamage(burnStacks);
  if (burnDamage > 0) {
    hp -= burnDamage;
  }
  return {
    ...state,
    hp,
    tokens: {
      ...state.tokens,
      burn: burnStacks > 0 ? Math.max(0, burnStacks - 1) : burnStacks,
    },
  };
}
