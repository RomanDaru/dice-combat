import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  addStacks,
  listStatuses,
  setStatusLifecycleSink,
  spendStatus,
  type StatusPhase,
} from "../index";
import type {
  StatusLifecycleEvent,
  StatusSpendApplyContext,
  StatusSpend,
} from "../types";

type SpendableStatus = {
  id: string;
  spend: StatusSpend;
};

const spendableStatuses: SpendableStatus[] = listStatuses()
  .filter(
    (def): def is typeof def & { spend: StatusSpend } =>
      Boolean(def.spend?.allowedPhases?.length)
  )
  .map((def) => ({
    id: def.id,
    spend: def.spend as StatusSpend,
  }));

const buildSpendContext = (
  phase: StatusPhase,
  spend: StatusSpend
): StatusSpendApplyContext => {
  const ctx: StatusSpendApplyContext = { phase };
  if (phase === "attackRoll") {
    ctx.baseDamage = 10;
  }
  if (phase === "defenseRoll") {
    ctx.baseBlock = 10;
  }
  if (spend.needsRoll) {
    ctx.roll = 6;
  }
  return ctx;
};

describe("status lifecycle events", () => {
  let events: StatusLifecycleEvent[];

  beforeEach(() => {
    events = [];
    setStatusLifecycleSink({
      publish: (event) => {
        events.push(event);
      },
    });
  });

  afterEach(() => {
    events = [];
    setStatusLifecycleSink(null);
  });

  it.each(spendableStatuses)(
    "emits grant + spend events for %s",
    ({ id, spend }) => {
      const phase = spend.allowedPhases[0] as StatusPhase;
      const ctx = buildSpendContext(phase, spend);
      const initial = addStacks(
        {},
        id,
        spend.costStacks || 1,
        {
          ownerLabel: "test",
          phase,
          note: "test-grant",
        }
      );
      const result = spendStatus(initial, id, phase, ctx);
      expect(result).not.toBeNull();
      const grantEvent = events.find(
        (event) => event.type === "grant" && event.statusId === id
      );
      expect(grantEvent).toBeTruthy();
      const spendEvent = events.find(
        (event) => event.type === "spend" && event.statusId === id
      );
      expect(spendEvent).toBeTruthy();
    }
  );
});
