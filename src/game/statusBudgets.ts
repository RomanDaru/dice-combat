import type { StatusId } from "../engine/status";
import type { Side } from "./types";

export type TurnStatusBudgets = Record<Side, Partial<Record<StatusId, number>>>;

export const createEmptyTurnStatusBudgets = (): TurnStatusBudgets => ({
  you: {},
  ai: {},
});

export const getTurnStatusBudget = (
  budgets: TurnStatusBudgets,
  side: Side,
  statusId: StatusId
): number => budgets[side]?.[statusId] ?? 0;

export const hasTurnStatusBudget = (
  budgets: TurnStatusBudgets,
  side: Side,
  statusId: StatusId
): boolean => Object.prototype.hasOwnProperty.call(budgets[side] ?? {}, statusId);

export const setTurnStatusBudgetValue = (
  budgets: TurnStatusBudgets,
  side: Side,
  statusId: StatusId,
  value: number
): TurnStatusBudgets => ({
  ...budgets,
  [side]: {
    ...(budgets[side] ?? {}),
    [statusId]: Math.max(0, value),
  },
});

export const consumeTurnStatusBudgetValue = (
  budgets: TurnStatusBudgets,
  side: Side,
  statusId: StatusId,
  amount: number
): TurnStatusBudgets => {
  if (amount <= 0) return budgets;
  const current = budgets[side]?.[statusId] ?? 0;
  return setTurnStatusBudgetValue(budgets, side, statusId, Math.max(0, current - amount));
};
