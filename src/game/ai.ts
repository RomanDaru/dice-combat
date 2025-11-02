import { AiDecisionContext } from "./types";
import { getStacks } from "../engine/status";
import { bestAbility, detectCombos } from "./combos";

function holdMostFrequent(dice: number[]): boolean[] {
  const counts = new Map<number, number>();
  dice.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const target =
    [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || b[0] - a[0]
    )[0]?.[0] ?? dice[0];
  return dice.map((value) => value === target);
}

function holdStraightPieces(dice: number[]): boolean[] {
  const keep = new Set([2, 3, 4, 5, 6]);
  return dice.map((value) => keep.has(value));
}

function hasStraightPotential(dice: number[]): boolean {
  const sets = [
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 4, 5, 6],
    [1, 2, 3, 4, 5],
    [2, 3, 4, 5, 6],
  ];
  const unique = new Set(dice);
  return sets.some((seq) => seq.every((value) => unique.has(value)));
}

export const monkAiStrategy = (context: AiDecisionContext): boolean[] => {
  const { dice, rollsRemaining, tokens, hero } = context;

  if (rollsRemaining <= 0) return dice.map(() => true);

  const currentCombos = detectCombos(dice);
  const currentBest = bestAbility(hero, dice);

  if (rollsRemaining === 1 && currentBest) {
    if (
      currentBest.combo === "FULL_HOUSE" ||
      currentBest.combo === "LARGE_STRAIGHT"
    ) {
      return dice.map(() => true);
    }
    if (currentBest.combo === "4OAK") {
      return holdMostFrequent(dice);
    }
  }

  if (getStacks(tokens, "evasive", 0) <= 0 && hasStraightPotential(dice)) {
    return holdStraightPieces(dice);
  }

  if (currentCombos["LARGE_STRAIGHT"]) {
    return dice.map(() => true);
  }

  return holdMostFrequent(dice);
};

export const pyroAiStrategy = (context: AiDecisionContext): boolean[] => {
  if (context.rollsRemaining <= 0) return context.dice.map(() => true);
  return holdMostFrequent(context.dice);
};

export const defaultAiStrategy = (context: AiDecisionContext): boolean[] =>
  holdMostFrequent(context.dice);

