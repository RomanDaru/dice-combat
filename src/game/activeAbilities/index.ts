import type { ActiveAbility } from "../types";
import {
  listPreDefenseReactions,
  pickFirstPreDefenseReaction,
} from "../combat/preDefenseReactions";

type ActiveAbilityRegistry = Record<string, ActiveAbility[]>;

const SHADOW_MONK_EVASIVE_ID = "shadow_monk.use_evasive";

const ShadowMonkActiveAbilities: ActiveAbility[] = [
  {
    id: SHADOW_MONK_EVASIVE_ID,
    label: "Roll for Evasive",
    description:
      "Spend an Evasive token to attempt a dodge (roll 5+ to avoid the attack entirely).",
    phase: ["attack", "defense"],
    cost: {
      tokens: { evasive: 1 },
    },
    canUse: ({ phase, actingPlayer, state, side }) => {
      const pending = state.pendingAttack;
      if (!pending || pending.defender !== side) return false;
      if (!["attack", "defense"].includes(phase)) return false;
      return listPreDefenseReactions(actingPlayer.tokens).length > 0;
    },
    execute: ({ actingPlayer }) => {
      const reaction = pickFirstPreDefenseReaction(actingPlayer.tokens);
      if (!reaction) {
        return { logs: ["No pre-defense reactions available."] };
      }
      return {
        controllerAction: {
          type: "USE_STATUS_REACTION",
          payload: { statusId: reaction.id },
        },
      };
    },
  },
];

export const ActiveAbilities: ActiveAbilityRegistry = {
  "Shadow Monk": ShadowMonkActiveAbilities,
};

export const getActiveAbilitiesForHero = (heroId: string): ActiveAbility[] =>
  ActiveAbilities[heroId] ?? [];

export const ActiveAbilityIds = {
  SHADOW_MONK_EVASIVE_ID,
} as const;
