import { describe, expect, it } from "vitest";

import { DefenseSchema } from "../types";
import {
  assertDefenseSchemaValid,
  validateDefenseSchema,
} from "../validation";

const createSchema = (overrides: Partial<DefenseSchema> = {}): DefenseSchema => ({
  dice: 3,
  fields: [
    { id: "F1", faces: [1, 2] },
    { id: "F2", faces: [3, 4] },
    { id: "F3", faces: [5, 6] },
  ],
  rules: [
    {
      id: "ignite",
      matcher: { type: "countField", fieldId: "F1" },
      effects: [{ type: "flatBlock", amount: 1 }],
    },
  ],
  ...overrides,
});

describe("validateDefenseSchema", () => {
  it("accepts a minimal valid schema", () => {
    const result = validateDefenseSchema(createSchema());

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.fieldsHash).toContain("fh_");
  });

  it("detects overlapping field faces", () => {
    const schema = createSchema({
      fields: [
        { id: "A", faces: [1, 2] },
        { id: "B", faces: [2, 3] },
      ],
    });

    const result = validateDefenseSchema(schema);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "field.overlappingFace")).toBe(true);
  });

  it("warns about idle faces when disallowed", () => {
    const schema = createSchema({
      rules: [
        {
          id: "only_F1",
          matcher: { type: "countField", fieldId: "F1" },
          effects: [{ type: "flatBlock", amount: 1 }],
        },
      ],
    });

    const result = validateDefenseSchema(schema);

    expect(result.isValid).toBe(true);
    expect(result.warnings.some((issue) => issue.code === "schema.idleFaces")).toBe(true);
  });

  it("errors when rules reference unknown fields", () => {
    const schema = createSchema({
      rules: [
        {
          id: "badField",
          matcher: { type: "countField", fieldId: "MISSING" },
          effects: [{ type: "flatBlock", amount: 1 }],
        },
      ],
    });

    const result = validateDefenseSchema(schema);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "matcher.unknownField")).toBe(true);
  });

  it("warns when exactFace uses face outside of any field", () => {
    const schema = createSchema({
      rules: [
        {
          id: "lonelyFace",
          matcher: { type: "exactFace", face: 6, count: 2 },
          effects: [{ type: "flatBlock", amount: 1 }],
        },
      ],
      fields: [{ id: "F1", faces: [1, 2] }],
    });

    const result = validateDefenseSchema(schema);

    expect(result.isValid).toBe(true);
    expect(result.warnings.some((issue) => issue.code === "matcher.faceNotInField")).toBe(true);
  });
});

describe("assertDefenseSchemaValid", () => {
  it("throws when schema is invalid", () => {
    const schema = createSchema({
      fields: [],
    });

    expect(() => assertDefenseSchemaValid("Pyromancer", schema)).toThrowError(
      /Defense schema validation failed/
    );
  });
});
