import type { ActiveAbility } from "../types";

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
      if ((actingPlayer.tokens.evasive ?? 0) <= 0) return false;
      return true;
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

export const ActiveAbilityIds = {
  SHADOW_MONK_EVASIVE_ID,
} as const;
