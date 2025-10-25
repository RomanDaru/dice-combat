import type { PlayerState } from "../types";

export const BURN_STATUS_ID = "burn";
export const MAX_BURN_STACKS = 3;

export const getBurnDamage = (stacks: number): number => {
  if (stacks <= 0) return 0;
  const capped = Math.min(stacks, MAX_BURN_STACKS);
  return 2 + Math.max(0, capped - 1);
};

export const applyBurnStacks = (
  current: number,
  stacksToAdd: number
): number => {
  if (stacksToAdd <= 0) {
    return Math.max(0, Math.min(MAX_BURN_STACKS, current));
  }
  return Math.min(MAX_BURN_STACKS, Math.max(0, current) + stacksToAdd);
};

export const tickBurn = (player: PlayerState) => {
  const stacksBefore = Math.max(0, player.tokens.burn ?? 0);
  const damage = getBurnDamage(stacksBefore);
  const stacksAfter = stacksBefore > 0 ? stacksBefore - 1 : stacksBefore;

  const updated: PlayerState = {
    ...player,
    hp: player.hp - damage,
    tokens: {
      ...player.tokens,
      burn: stacksAfter,
    },
  };

  return {
    updated,
    damage,
    stacksBefore,
    stacksAfter,
  };
};

export const shouldPromptBurnCleanse = (
  stacksAfterTick: number,
  damage: number
) => damage > 0 && stacksAfterTick > 0;
