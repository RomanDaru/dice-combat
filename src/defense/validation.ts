import {
  ComboMatcherConfig,
  CountFieldMatcherConfig,
  DefenseDieValue,
  DefenseEffectConfig,
  DefenseField,
  DefenseFieldId,
  DefenseMatcherConfig,
  DefenseSchema,
  DefenseVersion,
  ExactFaceMatcherConfig,
  PairsFieldMatcherConfig,
  PreventHalfEffectConfig,
  RerollDiceEffectConfig,
} from "./types";

type IssueKind = "error" | "warning";

export type DefenseSchemaValidationIssue = {
  kind: IssueKind;
  code: string;
  message: string;
  fieldId?: DefenseFieldId;
  ruleId?: string;
};

export type DefenseSchemaValidationResult = {
  isValid: boolean;
  errors: DefenseSchemaValidationIssue[];
  warnings: DefenseSchemaValidationIssue[];
  fieldsHash: string | null;
  referencedFieldIds: string[];
  idleFaces: DefenseDieValue[];
};

export type DefenseSchemaValidationOptions = {
  heroId?: string;
};

const DEFAULT_ALLOW_IDLE_FACES = false;
const DIE_FACE_VALUES: DefenseDieValue[] = [1, 2, 3, 4, 5, 6];

const error = (
  list: DefenseSchemaValidationIssue[],
  data: Omit<DefenseSchemaValidationIssue, "kind">
) => list.push({ kind: "error", ...data });

const warn = (
  list: DefenseSchemaValidationIssue[],
  data: Omit<DefenseSchemaValidationIssue, "kind">
) => list.push({ kind: "warning", ...data });

export const computeFieldsHash = (fields: DefenseField[]): string => {
  const normalized = [...fields]
    .map((field) => ({
      id: field.id,
      faces: Array.from(new Set(field.faces)).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const payload = normalized
    .map((field) => `${field.id}:${field.faces.join("")}`)
    .join("|");

  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return `fh_${hash.toString(36)}`;
};

const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

type MatcherValidationSummary = {
  referencedFields: DefenseFieldId[];
  referencedFaces: DefenseDieValue[];
};

type EffectValidationContext = {
  ruleId: string;
  fieldExists: (fieldId: DefenseFieldId) => boolean;
  errors: DefenseSchemaValidationIssue[];
};

const validateCountFieldMatcher = (
  matcher: CountFieldMatcherConfig,
  ruleId: string,
  fieldExists: (fieldId: DefenseFieldId) => boolean,
  errors: DefenseSchemaValidationIssue[],
  warnings: DefenseSchemaValidationIssue[]
): MatcherValidationSummary => {
  if (!matcher.fieldId) {
    error(errors, {
      code: "matcher.missingFieldId",
      message: "countField matcher requires fieldId",
      ruleId,
    });
    return { referencedFields: [], referencedFaces: [] };
  }
  if (!fieldExists(matcher.fieldId)) {
    error(errors, {
      code: "matcher.unknownField",
      message: `countField references unknown field "${matcher.fieldId}"`,
      ruleId,
    });
    return { referencedFields: [], referencedFaces: [] };
  }
  if (matcher.min && !isPositiveInteger(matcher.min)) {
    error(errors, {
      code: "matcher.invalidMin",
      message: "countField.min must be a positive integer",
      ruleId,
    });
  }
  if (matcher.cap !== undefined && !isNonNegativeNumber(matcher.cap)) {
    error(errors, {
      code: "matcher.invalidCap",
      message: "countField.cap must be a non-negative number",
      ruleId,
    });
  }
  if (matcher.per !== undefined && !isNonNegativeNumber(matcher.per)) {
    error(errors, {
      code: "matcher.invalidPer",
      message: "countField.per must be a non-negative number",
      ruleId,
    });
  }
  if (
    matcher.cap !== undefined &&
    matcher.min !== undefined &&
    matcher.cap < matcher.min
  ) {
    warn(warnings, {
      code: "matcher.capLessThanMin",
      message: "countField.cap is less than min; rule can never match",
      ruleId,
    });
  }
  return { referencedFields: [matcher.fieldId], referencedFaces: [] };
};

const validatePairsFieldMatcher = (
  matcher: PairsFieldMatcherConfig,
  ruleId: string,
  fieldExists: (fieldId: DefenseFieldId) => boolean,
  errors: DefenseSchemaValidationIssue[]
): MatcherValidationSummary => {
  if (!matcher.fieldId) {
    error(errors, {
      code: "matcher.pairsField.missingFieldId",
      message: "pairsField matcher requires fieldId",
      ruleId,
    });
    return { referencedFields: [], referencedFaces: [] };
  }
  if (!fieldExists(matcher.fieldId)) {
    error(errors, {
      code: "matcher.pairsField.unknownField",
      message: `pairsField matcher references unknown field "${matcher.fieldId}"`,
      ruleId,
    });
  }
  const pairs = matcher.pairs ?? 1;
  if (!isPositiveInteger(pairs)) {
    error(errors, {
      code: "matcher.pairsField.invalidPairs",
      message: "pairsField.pairs must be a positive integer",
      ruleId,
    });
  }

  if (matcher.cap !== undefined && !isNonNegativeNumber(matcher.cap)) {
    error(errors, {
      code: "matcher.invalidCap",
      message: "pairsField.cap must be a non-negative number",
      ruleId,
    });
  }

  return { referencedFields: [matcher.fieldId], referencedFaces: [] };
};

const validateExactFaceMatcher = (
  matcher: ExactFaceMatcherConfig,
  ruleId: string,
  fieldIdByFaceValue: Map<DefenseDieValue, DefenseFieldId>,
  errors: DefenseSchemaValidationIssue[],
  warnings: DefenseSchemaValidationIssue[]
): MatcherValidationSummary => {
  if (!isPositiveInteger(matcher.count)) {
    error(errors, {
      code: "matcher.invalidCount",
      message: "exactFace.count must be a positive integer",
      ruleId,
    });
  }
  if (!DIE_FACE_VALUES.includes(matcher.face)) {
    error(errors, {
      code: "matcher.invalidFace",
      message: `exactFace.face must be between 1 and 6 (received ${matcher.face})`,
      ruleId,
    });
  } else if (!fieldIdByFaceValue.has(matcher.face)) {
    warn(warnings, {
      code: "matcher.faceNotInField",
      message: `exactFace references face ${matcher.face}, which is not assigned to any field`,
      ruleId,
    });
  }
  return { referencedFields: [], referencedFaces: [matcher.face] };
};

const validateComboMatcher = (
  matcher: ComboMatcherConfig,
  ruleId: string,
  fieldExists: (fieldId: DefenseFieldId) => boolean,
  errors: DefenseSchemaValidationIssue[]
): MatcherValidationSummary => {
  if (!matcher.fields || matcher.fields.length === 0) {
    error(errors, {
      code: "matcher.combo.missingFields",
      message: "combo matcher requires at least one field definition",
      ruleId,
    });
    return { referencedFields: [], referencedFaces: [] };
  }
  const referencedFields: DefenseFieldId[] = [];
  matcher.fields.forEach((fieldRequirement) => {
    if (!fieldRequirement.id) {
      error(errors, {
        code: "matcher.combo.missingFieldId",
        message: "combo matcher field requirement missing id",
        ruleId,
      });
      return;
    }
    if (!fieldExists(fieldRequirement.id)) {
      error(errors, {
        code: "matcher.combo.unknownField",
        message: `combo matcher references unknown field "${fieldRequirement.id}"`,
        ruleId,
      });
      return;
    }
    if (!isPositiveInteger(fieldRequirement.min)) {
      error(errors, {
        code: "matcher.combo.invalidMin",
        message: "combo matcher field min must be a positive integer",
        ruleId,
      });
    }
    referencedFields.push(fieldRequirement.id);
  });
  return { referencedFields, referencedFaces: [] };
};

const validateMatcher = (
  matcher: DefenseMatcherConfig,
  ruleId: string,
  fieldExists: (fieldId: DefenseFieldId) => boolean,
  fieldIdByFaceValue: Map<DefenseDieValue, DefenseFieldId>,
  errors: DefenseSchemaValidationIssue[],
  warnings: DefenseSchemaValidationIssue[]
): MatcherValidationSummary => {
  switch (matcher.type) {
    case "countField":
      return validateCountFieldMatcher(
        matcher,
        ruleId,
        fieldExists,
        errors,
        warnings
      );
    case "pairsField":
      return validatePairsFieldMatcher(matcher, ruleId, fieldExists, errors);
    case "exactFace":
      return validateExactFaceMatcher(
        matcher,
        ruleId,
        fieldIdByFaceValue,
        errors,
        warnings
      );
    case "combo":
      return validateComboMatcher(matcher, ruleId, fieldExists, errors);
    default:
      error(errors, {
        code: "matcher.unknown",
        message: `Unknown matcher type "${(matcher as DefenseMatcherConfig).type}"`,
        ruleId,
      });
      return { referencedFields: [], referencedFaces: [] };
  }
};

const validateRerollEffectFields = (
  effect: RerollDiceEffectConfig,
  context: EffectValidationContext
) => {
  if (!effect.fields) return;
  effect.fields.forEach((fieldId) => {
    if (!context.fieldExists(fieldId)) {
      error(context.errors, {
        code: "effect.reroll.unknownField",
        message: `rerollDice references unknown field "${fieldId}"`,
        ruleId: context.ruleId,
      });
    }
  });
};

const validatePreventHalfEffect = (
  effect: PreventHalfEffectConfig,
  context: EffectValidationContext
) => {
  if (
    effect.stacks !== undefined &&
    !isPositiveInteger(effect.stacks)
  ) {
    error(context.errors, {
      code: "effect.preventHalf.invalidStacks",
      message: "preventHalf.stacks must be a positive integer",
      ruleId: context.ruleId,
    });
  }
};

const validateEffect = (
  effect: DefenseEffectConfig,
  context: EffectValidationContext
) => {
  switch (effect.type) {
    case "dealPer":
      if (!isNonNegativeNumber(effect.amount)) {
        error(context.errors, {
          code: "effect.dealPer.invalidAmount",
          message: "dealPer.amount must be a non-negative number",
          ruleId: context.ruleId,
        });
      }
      if (effect.cap !== undefined && !isNonNegativeNumber(effect.cap)) {
        error(context.errors, {
          code: "effect.dealPer.invalidCap",
          message: "dealPer.cap must be a non-negative number",
          ruleId: context.ruleId,
        });
      }
      break;
    case "flatBlock":
      if (!isNonNegativeNumber(effect.amount)) {
        error(context.errors, {
          code: "effect.flatBlock.invalidAmount",
          message: "flatBlock.amount must be a non-negative number",
          ruleId: context.ruleId,
        });
      }
      if (effect.cap !== undefined && !isNonNegativeNumber(effect.cap)) {
        error(context.errors, {
          code: "effect.flatBlock.invalidCap",
          message: "flatBlock.cap must be a non-negative number",
          ruleId: context.ruleId,
        });
      }
      break;
    case "blockPer":
    case "reflect":
      if (!isNonNegativeNumber(effect.amount)) {
        error(context.errors, {
          code: `effect.${effect.type}.invalidAmount`,
          message: `${effect.type}.amount must be a non-negative number`,
          ruleId: context.ruleId,
        });
      }
      if (effect.cap !== undefined && !isNonNegativeNumber(effect.cap)) {
        error(context.errors, {
          code: `effect.${effect.type}.invalidCap`,
          message: `${effect.type}.cap must be a non-negative number`,
          ruleId: context.ruleId,
        });
      }
      break;
    case "gainStatus":
    case "applyStatusToOpponent":
      if (!effect.status) {
        error(context.errors, {
          code: `effect.${effect.type}.missingStatus`,
          message: `${effect.type} requires status`,
          ruleId: context.ruleId,
        });
      }
      if (
        effect.stacks !== undefined &&
        !isPositiveInteger(effect.stacks)
      ) {
        error(context.errors, {
          code: `effect.${effect.type}.invalidStacks`,
          message: `${effect.type}.stacks must be a positive integer`,
          ruleId: context.ruleId,
        });
      }
      if (
        effect.stackCap !== undefined &&
        !isPositiveInteger(effect.stackCap)
      ) {
        error(context.errors, {
          code: `effect.${effect.type}.invalidStackCap`,
          message: `${effect.type}.stackCap must be a positive integer`,
          ruleId: context.ruleId,
        });
      }
      break;
    case "preventHalf":
      validatePreventHalfEffect(effect, context);
      break;
    case "buffNextAttack":
      if (!isNonNegativeNumber(effect.amount)) {
        error(context.errors, {
          code: "effect.buffNextAttack.invalidAmount",
          message: "buffNextAttack.amount must be a non-negative number",
          ruleId: context.ruleId,
        });
      }
      break;
    case "heal":
      if (!isNonNegativeNumber(effect.amount)) {
        error(context.errors, {
          code: "effect.heal.invalidAmount",
          message: "heal.amount must be a non-negative number",
          ruleId: context.ruleId,
        });
      }
      break;
    case "cleanse":
      if (
        effect.amount !== undefined &&
        !isPositiveInteger(effect.amount)
      ) {
        error(context.errors, {
          code: "effect.cleanse.invalidAmount",
          message: "cleanse.amount must be a positive integer",
          ruleId: context.ruleId,
        });
      }
      break;
    case "transferStatus":
      if (!effect.status) {
        error(context.errors, {
          code: "effect.transferStatus.missingStatus",
          message: "transferStatus requires status",
          ruleId: context.ruleId,
        });
      }
      break;
    case "rerollDice":
      if (!isPositiveInteger(effect.count)) {
        error(context.errors, {
          code: "effect.rerollDice.invalidCount",
          message: "rerollDice.count must be a positive integer",
          ruleId: context.ruleId,
        });
      }
      validateRerollEffectFields(effect, context);
      break;
    default:
      error(context.errors, {
        code: "effect.unknown",
        message: `Unknown effect type "${(effect as DefenseEffectConfig).type}"`,
        ruleId: context.ruleId,
      });
  }
};

const trackReferencedFields = (
  referenced: Set<DefenseFieldId>,
  fieldIds: DefenseFieldId[]
) => fieldIds.forEach((fieldId) => referenced.add(fieldId));

const collectFacesFromFields = (
  fieldIds: DefenseFieldId[],
  fieldMap: Map<DefenseFieldId, DefenseField>
): DefenseDieValue[] => {
  const faces: DefenseDieValue[] = [];
  fieldIds.forEach((fieldId) => {
    const field = fieldMap.get(fieldId);
    if (field) {
      faces.push(...field.faces);
    }
  });
  return faces;
};

export const validateDefenseSchema = (
  schema: DefenseSchema,
  options: DefenseSchemaValidationOptions = {}
): DefenseSchemaValidationResult => {
  const errors: DefenseSchemaValidationIssue[] = [];
  const warnings: DefenseSchemaValidationIssue[] = [];
  const fieldMap = new Map<DefenseFieldId, DefenseField>();
  const fieldIdByFaceValue = new Map<DefenseDieValue, DefenseFieldId>();
  const referencedFieldIds = new Set<DefenseFieldId>();
  const referencedFaces = new Set<DefenseDieValue>();

  if (!isPositiveInteger(schema.dice)) {
    error(errors, {
      code: "schema.invalidDice",
      message: "defenseSchema.dice must be a positive integer",
    });
  }

  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    error(errors, {
      code: "schema.missingFields",
      message: "defenseSchema.fields must include at least one field",
    });
  } else {
    schema.fields.forEach((field) => {
      if (!field.id) {
        error(errors, {
          code: "field.missingId",
          message: "Field is missing id",
        });
        return;
      }
      if (fieldMap.has(field.id)) {
        error(errors, {
          code: "field.duplicateId",
          message: `Duplicate field id "${field.id}"`,
          fieldId: field.id,
        });
      } else {
        fieldMap.set(field.id, field);
      }

      if (!Array.isArray(field.faces) || field.faces.length === 0) {
        error(errors, {
          code: "field.missingFaces",
          message: `Field "${field.id}" must list at least one die face`,
          fieldId: field.id,
        });
        return;
      }

      const seenFaces = new Set<DefenseDieValue>();
      field.faces.forEach((face) => {
        if (!DIE_FACE_VALUES.includes(face)) {
          error(errors, {
            code: "field.invalidFace",
            message: `Field "${field.id}" references invalid die face ${face}`,
            fieldId: field.id,
          });
          return;
        }
        if (seenFaces.has(face)) {
          error(errors, {
            code: "field.duplicateFace",
            message: `Field "${field.id}" lists face ${face} multiple times`,
            fieldId: field.id,
          });
          return;
        }
        seenFaces.add(face);
        if (fieldIdByFaceValue.has(face)) {
          error(errors, {
            code: "field.overlappingFace",
            message: `Die face ${face} is assigned to multiple fields (${fieldIdByFaceValue.get(
              face
            )} and ${field.id})`,
            fieldId: field.id,
          });
        } else {
          fieldIdByFaceValue.set(face, field.id);
        }
      });
    });
  }

  if (!Array.isArray(schema.rules) || schema.rules.length === 0) {
    error(errors, {
      code: "schema.missingRules",
      message: "defenseSchema.rules must include at least one rule",
    });
  } else {
    const ruleIds = new Set<string>();
    schema.rules.forEach((rule) => {
      if (!rule.id) {
        error(errors, {
          code: "rule.missingId",
          message: "Rule is missing id",
        });
        return;
      }
      if (ruleIds.has(rule.id)) {
        error(errors, {
          code: "rule.duplicateId",
          message: `Duplicate rule id "${rule.id}"`,
          ruleId: rule.id,
        });
        return;
      }
      ruleIds.add(rule.id);

      if (!rule.matcher) {
        error(errors, {
          code: "rule.missingMatcher",
          message: `Rule "${rule.id}" must define a matcher`,
          ruleId: rule.id,
        });
        return;
      }

      const matcherSummary = validateMatcher(
        rule.matcher,
        rule.id,
        (fieldId: DefenseFieldId) => fieldMap.has(fieldId),
        fieldIdByFaceValue,
        errors,
        warnings
      );

      trackReferencedFields(referencedFieldIds, matcherSummary.referencedFields);
      collectFacesFromFields(
        matcherSummary.referencedFields,
        fieldMap
      ).forEach((face) => referencedFaces.add(face));
      matcherSummary.referencedFaces.forEach((face) =>
        referencedFaces.add(face)
      );

      if (!Array.isArray(rule.effects) || rule.effects.length === 0) {
        error(errors, {
          code: "rule.missingEffects",
          message: `Rule "${rule.id}" must define at least one effect`,
          ruleId: rule.id,
        });
        return;
      }

      rule.effects.forEach((effect) =>
        validateEffect(effect, {
          ruleId: rule.id,
          fieldExists: (fieldId: DefenseFieldId) => fieldMap.has(fieldId),
          errors,
        })
      );
    });
  }

  const allowIdleFaces =
    schema.allowIdleFaces ?? DEFAULT_ALLOW_IDLE_FACES;

  const idleFaces = DIE_FACE_VALUES.filter(
    (face) => fieldIdByFaceValue.has(face) && !referencedFaces.has(face)
  );

  if (!allowIdleFaces && idleFaces.length > 0) {
    warn(warnings, {
      code: "schema.idleFaces",
      message: `Faces [${idleFaces.join(
        ", "
      )}] are not referenced by any rule. Set allowIdleFaces=true to silence this warning.`,
    });
  }

  const result: DefenseSchemaValidationResult = {
    isValid: errors.length === 0,
    errors,
    warnings,
    fieldsHash: fieldMap.size > 0 ? computeFieldsHash(Array.from(fieldMap.values())) : null,
    referencedFieldIds: Array.from(referencedFieldIds),
    idleFaces,
  };

  if (options.heroId) {
    result.errors.forEach((issue) => {
      issue.message = `[${options.heroId}] ${issue.message}`;
    });
    result.warnings.forEach((issue) => {
      issue.message = `[${options.heroId}] ${issue.message}`;
    });
  }

  return result;
};

export const assertDefenseSchemaValid = (
  heroId: string,
  schema: DefenseSchema
) => {
  const result = validateDefenseSchema(schema, { heroId });
  if (!result.isValid) {
    const formattedErrors = result.errors
      .map((issue) => `- (${issue.code}) ${issue.message}`)
      .join("\n");
    throw new Error(
      `Defense schema validation failed for hero "${heroId}":\n${formattedErrors}`
    );
  }
  return result;
};

export type DefenseHeroMetadata = {
  defenseVersion: DefenseVersion;
  defenseSchema?: DefenseSchema | null;
  defenseSchemaHash?: string | null;
};
