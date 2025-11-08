import {
  getStatus,
  spendStatusMany,
  type StatusId,
  type StatusSpendSummary,
} from "../engine/status";

export type StatusSpendRequests = Record<StatusId, number>;

type ApplyAttackStatusSpendsArgs = {
  requests: StatusSpendRequests;
  tokens: Record<string, number>;
  baseDamage: number;
  getBudget: (statusId: StatusId) => number;
  consumeBudget: (statusId: StatusId, amount: number) => void;
};

export const applyAttackStatusSpends = ({
  requests,
  tokens,
  baseDamage,
  getBudget,
  consumeBudget,
}: ApplyAttackStatusSpendsArgs) => {
  let workingTokens = tokens;
  const statusSpends: StatusSpendSummary[] = [];
  let damageContext = baseDamage;

  Object.entries(requests).forEach(([statusId, requestedStacks]) => {
    if (requestedStacks <= 0) return;
    const def = getStatus(statusId as StatusId);
    const spendDef = def?.spend;
    if (!spendDef) return;
    if (!spendDef.allowedPhases.includes("attackRoll")) return;
    let allowedStacks = requestedStacks;
    if (spendDef.turnLimited) {
      allowedStacks = Math.min(allowedStacks, getBudget(statusId as StatusId));
    }
    if (allowedStacks <= 0) return;
    const costStacks = spendDef.costStacks || 1;
    const attempts =
      costStacks > 0 ? Math.floor(allowedStacks / costStacks) : allowedStacks;
    if (attempts <= 0) return;

    const result = spendStatusMany(
      workingTokens,
      statusId,
      attempts,
      "attackRoll",
      (iteration, previousCtx) => ({
        ...previousCtx,
        baseDamage:
          typeof previousCtx.baseDamage === "number"
            ? previousCtx.baseDamage
            : damageContext,
      }),
      { phase: "attackRoll", baseDamage: damageContext }
    );
    if (!result) return;
    workingTokens = result.next;
    damageContext += result.summary.bonusDamage;
    statusSpends.push(result.summary);
    if (spendDef.turnLimited && result.summary.stacksSpent > 0) {
      consumeBudget(statusId as StatusId, result.summary.stacksSpent);
    }
  });

  const bonusDamage = statusSpends.reduce(
    (sum, spend) => sum + (spend.bonusDamage ?? 0),
    0
  );

  return {
    tokens: workingTokens,
    statusSpends,
    bonusDamage,
  };
};
