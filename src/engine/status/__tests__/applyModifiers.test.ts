import { beforeAll, describe, expect, it } from "vitest";
import {
  addStacks,
  applyModifiers,
  defineStatus,
  setStacks,
  type StatusModifyContext,
} from "../index";

const baseContext = (
  overrides: Partial<StatusModifyContext> = {}
): StatusModifyContext => ({
  phase: "attack",
  attackerSide: "you",
  defenderSide: "ai",
  baseDamage: 10,
  baseBlock: 0,
  ...overrides,
});

describe("applyModifiers", () => {
  beforeAll(() => {
    defineStatus({
      id: "test_priority_low",
      kind: "positive",
      name: "Priority Low",
      icon: "L",
      priority: 5,
      onModify: (_instance, ctx) => ({
        baseDamage: ctx.baseDamage + 2,
        baseBlock: ctx.baseBlock + 1,
        log: `low applied at damage ${ctx.baseDamage}`,
      }),
    });

    defineStatus({
      id: "test_priority_high",
      kind: "positive",
      name: "Priority High",
      icon: "H",
      priority: 50,
      onModify: (_instance, ctx) => ({
        baseDamage: ctx.baseDamage + 3,
        log: `high applied at damage ${ctx.baseDamage}`,
      }),
    });

    defineStatus({
      id: "test_passive",
      kind: "positive",
      name: "Passive",
      icon: "P",
      onModify: () => undefined,
    });

    defineStatus({
      id: "test_dual_phase",
      kind: "positive",
      name: "Dual Phase",
      icon: "D",
      onModify: (_instance, ctx) => {
        if (ctx.phase === "attack") {
          return {
            baseDamage: ctx.baseDamage + 4,
            log: "dual attack boost",
          };
        }
        if (ctx.phase === "defense") {
          return {
            baseBlock: ctx.baseBlock + 5,
            log: "dual defense boost",
          };
        }
        return undefined;
      },
    });
  });

  it("applies modifiers in priority order", () => {
    const stacks = setStacks(
      addStacks({}, "test_priority_low", 1),
      "test_priority_high",
      1
    );
    const { ctx, logs } = applyModifiers(stacks, baseContext());

    expect(logs).toEqual([
      "low applied at damage 10",
      "high applied at damage 12",
    ]);
    expect(ctx.baseDamage).toBe(15);
    expect(ctx.baseBlock).toBe(1);
  });

  it("leaves context unchanged when modifiers return nothing", () => {
    const starting = baseContext({ baseDamage: 7, baseBlock: 3 });
    const stacks = addStacks({}, "test_passive", 2);
    const { ctx, logs } = applyModifiers(stacks, starting);

    expect(ctx.baseDamage).toBe(7);
    expect(ctx.baseBlock).toBe(3);
    expect(logs).toHaveLength(0);
  });

  it("applies different outcomes for attack and defense phases", () => {
    const stacks = addStacks({}, "test_dual_phase", 1);

    const attackResult = applyModifiers(
      stacks,
      baseContext({ phase: "attack", baseDamage: 6, baseBlock: 2 })
    );
    expect(attackResult.ctx.baseDamage).toBe(10);
    expect(attackResult.ctx.baseBlock).toBe(2);
    expect(attackResult.logs).toEqual(["dual attack boost"]);

    const defenseResult = applyModifiers(
      stacks,
      baseContext({ phase: "defense", baseDamage: 6, baseBlock: 2 })
    );
    expect(defenseResult.ctx.baseDamage).toBe(6);
    expect(defenseResult.ctx.baseBlock).toBe(7);
    expect(defenseResult.logs).toEqual(["dual defense boost"]);
  });
});

