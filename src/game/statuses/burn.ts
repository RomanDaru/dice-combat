import type { PlayerState } from "../types";
import type { StatusCleanseRollResult, StatusDefinition } from "./types";

export const BURN_STATUS_ID = "burn" as const;
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

const resolveBurnCleanse = (
  player: PlayerState,
  roll: number
): StatusCleanseRollResult => {
  const success = roll >= 5;
  const updated: PlayerState = success
    ? {
        ...player,
        tokens: {
          ...player.tokens,
          burn: 0,
        },
      }
    : player;

  const logLine = `${player.hero.name} roll vs <<status:Burn>>: ${roll} ${
    success ? "-> removes <<status:Burn>>" : "-> <<status:Burn>> persists"
  }.`;

  return {
    updated,
    success,
    logLine,
  };
};

export const burnDefinition: StatusDefinition = {
  id: BURN_STATUS_ID,
  label: "Burn",
  description: {
    name: "Burn",
    icon: "🔥",
    text: "Poškodenie na začiatku kola (2/3/4 podľa stackov), potom stack klesne o 1. Dá sa očistiť hodom kocky 5 alebo 6.",
  },
  tick: (player) => {
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
      player: updated,
      damage,
      logDetail:
        damage > 0
          ? `<<status:Burn>> ${stacksBefore} -> ${damage} dmg`
          : undefined,
      promptStacks: damage > 0 && stacksAfter > 0 ? stacksAfter : undefined,
    };
  },
  cleanse: {
    type: "roll",
    threshold: 5,
    resolve: resolveBurnCleanse,
  },
};
