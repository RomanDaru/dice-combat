import type { PlayerState } from '../types';
import {
  burnDefinition,
  BURN_STATUS_ID,
} from './burn';
import type {
  StatusDefinition,
  StatusPrompt,
  StatusTickResult,
  StatusId,
} from './types';

const statusDefinitions: Record<StatusId, StatusDefinition> = {
  [BURN_STATUS_ID]: burnDefinition,
};

const statusHandlers = Object.values(statusDefinitions);

export const getStatusDefinition = (id: StatusId) => statusDefinitions[id];

export const tickAllStatuses = (player: PlayerState) => {
  let current = player;
  let totalDamage = 0;
  const logParts: string[] = [];
  const prompts: StatusPrompt[] = [];

  statusHandlers.forEach((handler) => {
    const result: StatusTickResult = handler.tick(current);
    current = result.player;
    if (result.damage > 0) {
      totalDamage += result.damage;
      if (result.logDetail) logParts.push(result.logDetail);
    }
    if (result.promptStacks && result.promptStacks > 0) {
      prompts.push({ id: handler.id, stacks: result.promptStacks });
    }
  });

  return {
    player: current,
    totalDamage,
    logParts,
    prompts,
  };
};

export { burnDefinition, BURN_STATUS_ID } from './burn';
export type { StatusId, StatusDefinition, StatusPrompt } from './types';

