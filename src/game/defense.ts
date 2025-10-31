import type { Tokens } from "./types";
import { rollDie } from "./combos";
import type { Rng } from "../engine/rng";

type SimpleDefenseRoll = {
  roll: number;
  reflect: number;
  reduced: number;
};

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

export function pyroDefenseRoll(
  tokens: Tokens,
  rng: Rng
): SimpleDefenseRoll {
  const roll = rollDie(rng);
  return { roll, ...pyroDefenseFromRoll({ roll, tokens }) };
}

export function monkDefenseFromRoll({
  roll,
  tokens,
}: {
  roll: number;
  tokens: Tokens;
}) {
  if (roll >= 5) return { reflect: 0, reduced: 2 };
  if (roll >= 3) return { reflect: 0, reduced: 1 };
  return { reflect: 0, reduced: 0 };
}

export function monkDefenseRoll(tokens: Tokens, rng: Rng): SimpleDefenseRoll {
  const roll = rollDie(rng);
  return { roll, ...monkDefenseFromRoll({ roll, tokens }) };
}

