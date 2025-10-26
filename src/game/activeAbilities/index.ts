import type { ActiveAbility } from "../types";

type ActiveAbilityRegistry = Record<string, ActiveAbility[]>;

const ShadowMonkActiveAbilities: ActiveAbility[] = [
  {
    id: "shadow_monk.use_evasive",
    label: "Use Evasive",
    description: "Spend an Evasive token to roll defensively instead of taking the hit.",
    phase: "defense",
    cost: {
      tokens: { evasive: 1 },
    },
    canUse: ({ phase, actingPlayer, state, turn, side }) => {
      if (turn !== side) return false;
      if (side !== "you") return false;
      if (phase !== "defense") return false;
      if ((actingPlayer.tokens.evasive ?? 0) <= 0) return false;
      const pending = state.pendingAttack;
      return Boolean(pending && pending.defender === side);
    },
    execute: () => ({
      controllerAction: { type: "USE_EVASIVE" },
    }),
  },
];

export const ActiveAbilities: ActiveAbilityRegistry = {
  "Shadow Monk": ShadowMonkActiveAbilities,
};

export const getActiveAbilitiesForHero = (heroId: string): ActiveAbility[] =>
  ActiveAbilities[heroId] ?? [];
