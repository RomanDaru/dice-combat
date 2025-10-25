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

export function tickStatuses(state: PlayerState): PlayerState {
  let hp = state.hp;
  if (state.tokens.burn > 0) hp -= state.tokens.burn * 2;
  if (state.tokens.ignite > 0) hp -= 1; // ignite vyhorí
  return { ...state, hp, tokens: { ...state.tokens, ignite: 0 } };
}
