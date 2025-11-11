import type {
  CountFieldMatcherConfig,
  DefenseDieValue,
  DefenseFieldId,
  DefenseMatcherConfig,
  DefenseSchema,
  PairsFieldMatcherConfig,
} from "./types";

export type DefenseRollStats = {
  dice: DefenseDieValue[];
  diceFields: Array<DefenseFieldId | null>;
  diceIndexesByField: Record<DefenseFieldId, number[]>;
  fieldTotals: Record<DefenseFieldId, number>;
};

export type DefenseMatcherEvaluation = {
  matched: boolean;
  matchCount: number;
  matchedDiceIndexes: number[];
  fieldTotals: Record<DefenseFieldId, number>;
  metadata?: Record<string, unknown>;
};

export const createDefenseRollStats = (
  schema: DefenseSchema,
  dice: DefenseDieValue[]
): DefenseRollStats => {
  const faceToField = new Map<DefenseDieValue, DefenseFieldId>();
  schema.fields.forEach((field) => {
    field.faces.forEach((face) => {
      faceToField.set(face, field.id);
    });
  });

  const diceFields: Array<DefenseFieldId | null> = [];
  const diceIndexesByField: Record<DefenseFieldId, number[]> = {};
  const fieldTotals: Record<DefenseFieldId, number> = {};
  schema.fields.forEach((field) => {
    diceIndexesByField[field.id] = [];
    fieldTotals[field.id] = 0;
  });

  dice.forEach((face, index) => {
    const fieldId = faceToField.get(face) ?? null;
    diceFields.push(fieldId);
    if (fieldId) {
      diceIndexesByField[fieldId].push(index);
      fieldTotals[fieldId] = (fieldTotals[fieldId] ?? 0) + 1;
    }
  });

  return {
    dice,
    diceFields,
    diceIndexesByField,
    fieldTotals,
  };
};

const evaluateCountFieldMatcher = (
  matcher: CountFieldMatcherConfig,
  stats: DefenseRollStats
): DefenseMatcherEvaluation => {
  const total = stats.fieldTotals[matcher.fieldId] ?? 0;
  const minRequired = matcher.min ?? 1;
  const cap = matcher.cap;
  const effectiveTotal =
    typeof cap === "number" ? Math.min(total, cap) : total;
  const matched = effectiveTotal >= minRequired;
  const matchedDiceIndexes = matched
    ? stats.diceIndexesByField[matcher.fieldId]?.slice(0, effectiveTotal) ?? []
    : [];

  return {
    matched,
    matchCount: effectiveTotal,
    matchedDiceIndexes,
    fieldTotals: stats.fieldTotals,
  };
};

const evaluatePairsFieldMatcher = (
  matcher: PairsFieldMatcherConfig,
  stats: DefenseRollStats
): DefenseMatcherEvaluation => {
  const fieldIndexes = stats.diceIndexesByField[matcher.fieldId] ?? [];
  const availablePairs = Math.floor(fieldIndexes.length / 2);
  const requiredPairs = matcher.pairs ?? 1;
  const cap = matcher.cap;

  const matched = availablePairs >= requiredPairs;
  const totalPairs = availablePairs;
  const matchCount =
    typeof cap === "number" ? Math.min(totalPairs, cap) : totalPairs;
  const diceNeeded = matched ? requiredPairs * 2 : 0;
  const matchedDiceIndexes = matched ? fieldIndexes.slice(0, diceNeeded) : [];

  return {
    matched,
    matchCount,
    matchedDiceIndexes,
    fieldTotals: stats.fieldTotals,
    metadata: {
      totalPairs,
    },
  };
};

export const evaluateDefenseMatcher = (
  schema: DefenseSchema,
  matcher: DefenseMatcherConfig,
  dice: DefenseDieValue[],
  stats?: DefenseRollStats
): DefenseMatcherEvaluation => {
  const rollStats = stats ?? createDefenseRollStats(schema, dice);
  switch (matcher.type) {
    case "countField":
      return evaluateCountFieldMatcher(matcher, rollStats);
    case "pairsField":
      return evaluatePairsFieldMatcher(matcher, rollStats);
     case "exactFace":
     case "combo":
      throw new Error(`Matcher type "${matcher.type}" is not supported in runtime yet.`);
    default:
      // Exhaustive guard to surface unhandled matcher types during development.
      const _exhaustive: never = matcher;
      throw new Error(`Unhandled matcher type ${(matcher as { type: string }).type}`);
  }
};
