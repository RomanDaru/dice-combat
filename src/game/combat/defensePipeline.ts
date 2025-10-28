import type {
  DefensePreparationInput,
  DefensePreparationOutput,
} from "./types";
import { calculateDefenseOutcome } from "../engine";
import { buildManualDefenseLog } from "../logging/defenseLogs";

/**
 * Computes base defense outcome and applies chi adjustments.
 * TODO: integrate chi application and manual defense log creation.
 */
export function prepareDefenseWithChi(
  input: DefensePreparationInput
): DefensePreparationOutput {
  const baseOutcome = calculateDefenseOutcome(
    input.attacker,
    input.defender,
    input.ability,
    input.defenseRoll
  );

  const manualDefense = buildManualDefenseLog({
    outcome: baseOutcome,
    defenderName: input.defender.hero.name,
    chiSpent: 0,
  });

  return {
    outcome: baseOutcome,
    manualDefense,
    chiAdjustment: {
      defenderAfter: input.defender,
      defenseOutcome: baseOutcome,
      chiSpent: 0,
    },
  };
}

