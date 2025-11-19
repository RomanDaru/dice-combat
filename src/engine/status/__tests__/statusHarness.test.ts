import { describe, expect, it } from "vitest";
import { listStatuses, type StatusDef } from "..";
import { runStatusHarnessScenario } from "../../../sim/statusHarness";
import type { StatusHarnessPendingGrant } from "../../../sim/statusHarness";

type BonusPoolConfig = {
  defense?: {
    bonusBlockPerStack?: number;
  };
};

type PreDefenseReactionConfig = {
  successDamageMultiplier?: number;
  negateOnSuccess?: boolean;
  successThreshold?: number;
};

const listBonusPoolStatuses = (): Array<
  StatusDef & { behaviorConfig: BonusPoolConfig }
> =>
  listStatuses().filter(
    (def): def is StatusDef & { behaviorConfig: BonusPoolConfig } =>
      def.behaviorId === "bonus_pool" &&
      Boolean(def.spend?.allowedPhases.includes("defenseRoll"))
  );

const listReactionStatuses = (): Array<
  StatusDef & { behaviorConfig: PreDefenseReactionConfig }
> =>
  listStatuses().filter(
    (def): def is StatusDef & { behaviorConfig: PreDefenseReactionConfig } =>
      def.behaviorId === "pre_defense_reaction" &&
      Boolean(def.spend?.allowedPhases.includes("defenseRoll"))
  );

describe("status harness – bonus pool behaviors", () => {
  const bonusPoolDefs = listBonusPoolStatuses();
  if (bonusPoolDefs.length === 0) {
    it.skip("no bonus_pool statuses registered for defense roll", () => {});
    return;
  }

  bonusPoolDefs.forEach((def) => {
    it(`spends ${def.id} stacks to convert into block`, () => {
      const cost = def.spend?.costStacks ?? 1;
      const stacksToSpend = cost * 2;
      const perStack = def.behaviorConfig?.defense?.bonusBlockPerStack ?? 0;
      const result = runStatusHarnessScenario({
        id: `bonus_pool:${def.id}`,
        attackDamage: 12,
        defenseBaseBlock: 1,
        defenderTokens: { [def.id]: stacksToSpend },
        defenseSpendRequests: { [def.id]: stacksToSpend },
      });
      const summary = result.resolution.defense?.statusSpends.find(
        (entry) => entry.id === def.id
      );
      expect(summary?.stacksSpent).toBe(stacksToSpend);
      expect(summary?.bonusBlock).toBe(perStack * stacksToSpend);
      expect(result.defenderAfter.tokens[def.id] ?? 0).toBe(0);
      expect(result.resolution.summary.totalBlock).toBe(
        result.defensePlan.defense.baseBlock + perStack * stacksToSpend
      );
      const spendEvent = result.lifecycleEvents.find(
        (event) => event.type === "spend" && event.statusId === def.id
      );
      expect(spendEvent).toBeTruthy();
    });
  });
});

describe("status harness – pre defense reactions", () => {
  const reactionDefs = listReactionStatuses();
  if (reactionDefs.length === 0) {
    it.skip(
      "no pre_defense_reaction statuses registered for defense roll",
      () => {}
    );
    return;
  }

  reactionDefs.forEach((def) => {
    const requiresRoll = def.spend?.needsRoll !== false;
    const config = def.behaviorConfig ?? {};
    const threshold = config.successThreshold ?? 0;
    const roll = requiresRoll ? Math.max(threshold, threshold + 1) : undefined;
    it(`resolves ${def.id} reaction`, () => {
      const cost = def.spend?.costStacks ?? 1;
      const result = runStatusHarnessScenario({
        id: `reaction:${def.id}`,
        attackDamage: 14,
        defenderTokens: { [def.id]: cost },
        defenseReactions: [{ statusId: def.id, roll }],
      });
      const reactionSpend = result.reactionSummaries.find(
        (summary) => summary.id === def.id
      );
      expect(reactionSpend).toBeTruthy();
      if (typeof config.successDamageMultiplier === "number") {
        const expectedDamage = Math.floor(
          config.successDamageMultiplier * 14
        );
        expect(result.resolution.summary.damageDealt).toBe(expectedDamage);
      } else if (config.negateOnSuccess) {
        expect(result.resolution.summary.negated).toBe(true);
      } else {
        expect(result.resolution.summary.blocked).toBeGreaterThanOrEqual(0);
      }
      const spendEvent = result.lifecycleEvents.find(
        (event) => event.type === "spend" && event.statusId === def.id
      );
      expect(spendEvent).toBeTruthy();
    });
  });
});

describe("status harness – delayed grants", () => {
  const delayedReactions = listReactionStatuses().filter(
    (def) => def.spend?.needsRoll === false
  );
  if (delayedReactions.length === 0) {
    it.skip("no reactions available for nextDefenseCommit testing", () => {});
    return;
  }

  delayedReactions.forEach((def) => {
    it(`applies pending grant for ${def.id} before reaction`, () => {
      const grant: StatusHarnessPendingGrant = {
        grant: {
          status: def.id,
          stacks: def.spend?.costStacks ?? 1,
          target: "self",
          usablePhase: "nextDefenseCommit",
          source: { ruleId: "harness", effectId: `${def.id}_grant` },
        },
        triggerPhase: "nextDefenseCommit",
      };
      const result = runStatusHarnessScenario({
        id: `grant:${def.id}`,
        attackDamage: 10,
        pendingGrants: [grant],
        defenseReactions: [{ statusId: def.id }],
      });
      const grantEvent = result.lifecycleEvents.find(
        (event) => event.type === "grant" && event.statusId === def.id
      );
      expect(grantEvent).toBeTruthy();
      expect(result.defenderBefore.tokens[def.id] ?? 0).toBe(0);
      expect(result.reactionSummaries.find((s) => s.id === def.id)).toBeTruthy();
      expect(result.defenderAfter.tokens[def.id] ?? 0).toBe(0);
    });
  });
});
