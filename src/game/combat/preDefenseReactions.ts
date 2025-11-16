import { getStatus, type StatusId } from "../../engine/status";
import type { Tokens } from "../types";

export type PreDefenseReactionMessages = {
  rolling: string;
  success: string;
  failure: string;
};

export type PreDefenseReactionDescriptor = {
  id: StatusId;
  name: string;
  icon: string;
  costStacks: number;
  diceCount: number;
  requiresRoll: boolean;
  rollLabel: string;
  messages: PreDefenseReactionMessages;
};

type PreDefenseReactionBehaviorConfig = {
  successThreshold?: number;
  negateOnSuccess?: boolean;
  successBlock?: number;
  failBlock?: number;
  successLog?: string;
  failureLog?: string;
  ui?: Partial<PreDefenseReactionMessages>;
};

const asNonNegativeInteger = (value: unknown, fallback = 1): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
};

const buildMessages = (
  name: string,
  config: PreDefenseReactionBehaviorConfig | undefined
): PreDefenseReactionMessages => {
  const rollingMessage = config?.ui?.rolling ?? `Rolling for ${name}...`;
  const negateOnSuccess = Boolean(config?.negateOnSuccess);
  const defaultSuccess = negateOnSuccess
    ? `${name} successful! Attack negated.`
    : `${name} successful!`;
  const successMessage =
    config?.ui?.success ?? config?.successLog ?? defaultSuccess;
  const defaultFailure = `${name} failed. Roll for Defense!`;
  const failureMessage =
    config?.ui?.failure ?? config?.failureLog ?? defaultFailure;
  return {
    rolling: rollingMessage,
    success: successMessage,
    failure: failureMessage,
  };
};

const ALLOWED_PHASE = "defenseRoll";

export const getPreDefenseReactionDescriptor = (
  statusId: StatusId
): PreDefenseReactionDescriptor | null => {
  const def = getStatus(statusId);
  if (!def) return null;
  if (
    def.behaviorId !== "pre_defense_reaction" ||
    !def.spend ||
    !def.spend.allowedPhases.includes(ALLOWED_PHASE)
  ) {
    return null;
  }
  const spendMeta = def.spend as typeof def.spend & { diceCount?: number };
  const requiresRoll = spendMeta.needsRoll !== false;
  const diceCount = asNonNegativeInteger(
    spendMeta.diceCount,
    requiresRoll ? 1 : 0
  );
  const config = (def.behaviorConfig ??
    {}) as PreDefenseReactionBehaviorConfig | undefined;
  return {
    id: def.id,
    name: def.name,
    icon: def.icon,
    costStacks: def.spend.costStacks,
    diceCount,
    requiresRoll,
    rollLabel: `${def.name} Roll`,
    messages: buildMessages(def.name, config),
  };
};

export const listPreDefenseReactions = (
  tokens: Tokens
): PreDefenseReactionDescriptor[] => {
  const descriptors: PreDefenseReactionDescriptor[] = [];
  Object.entries(tokens).forEach(([rawId, stacks]) => {
    if ((stacks ?? 0) <= 0) return;
    const descriptor = getPreDefenseReactionDescriptor(rawId as StatusId);
    if (descriptor) {
      descriptors.push(descriptor);
    }
  });
  return descriptors;
};

export const findPreDefenseReaction = (
  tokens: Tokens,
  statusId: StatusId
): PreDefenseReactionDescriptor | null => {
  if ((tokens[statusId] ?? 0) <= 0) {
    return null;
  }
  return getPreDefenseReactionDescriptor(statusId);
};

export const pickFirstPreDefenseReaction = (
  tokens: Tokens
): PreDefenseReactionDescriptor | null => {
  const [first] = listPreDefenseReactions(tokens);
  return first ?? null;
};
