import type { PlayerState } from "../types";
import type { StatusId } from "./types";
import { BURN_STATUS_ID, tickBurn, shouldPromptBurnCleanse } from "./burn";

export type StatusPrompt = {
  id: StatusId;
  stacks: number;
};

export type StatusTickResult = {
  player: PlayerState;
  damage: number;
  logDetail?: string;
  promptStacks?: number;
};

export type StatusHandler = {
  id: StatusId;
  tick: (player: PlayerState) => StatusTickResult;
};

const burnHandler: StatusHandler = {
  id: BURN_STATUS_ID,
  tick: (player) => {
    const { updated, damage, stacksBefore, stacksAfter } = tickBurn(player);
    return {
      player: updated,
      damage,
      logDetail:
        damage > 0 ? `Burn ${stacksBefore} -> ${damage} dmg` : undefined,
      promptStacks: shouldPromptBurnCleanse(stacksAfter, damage)
        ? stacksAfter
        : undefined,
    };
  },
};

const statusHandlers: StatusHandler[] = [burnHandler];

export const tickAllStatuses = (player: PlayerState) => {
  let current = player;
  let totalDamage = 0;
  const logParts: string[] = [];
  const prompts: StatusPrompt[] = [];

  statusHandlers.forEach((handler) => {
    const result = handler.tick(current);
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

export { BURN_STATUS_ID } from "./burn";
export type { StatusId } from "./types";
