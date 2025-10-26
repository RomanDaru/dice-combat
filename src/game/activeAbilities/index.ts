import type { ActiveAbility } from "../types";

type ActiveAbilityRegistry = Record<string, ActiveAbility[]>;

const SHADOW_MONK_EVASIVE_ID = "shadow_monk.use_evasive";
const SHADOW_MONK_SPEND_CHI_ID = "shadow_monk.spend_chi_attack";
const CHI_BONUS_DAMAGE = 2;

const ShadowMonkActiveAbilities: ActiveAbility[] = [
  {
    id: SHADOW_MONK_EVASIVE_ID,
    label: "Use Evasive",
    description: "Spend an Evasive token to roll defensively instead of taking the hit.",
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
  {
    id: SHADOW_MONK_SPEND_CHI_ID,
    label: "Spend Chi (+2 dmg)",
    description:
      "Consume Chi to amplify your current attack, adding +2 damage before it resolves.",
    phase: ["attack", "defense"],
    cost: {
      tokens: { chi: 1 },
    },
    canUse: ({ pendingAttack, side, actingPlayer }) => {
      if (!pendingAttack) return false;
      if (pendingAttack.attacker !== side) return false;
      if ((actingPlayer.tokens.chi ?? 0) <= 0) return false;
      if (pendingAttack.ability.damage <= 0) return false;
      return true;
    },
    execute: ({ pendingAttack, actingPlayer }) => {
      if (!pendingAttack) return;
      const baseAbility = pendingAttack.ability;
      const updatedAbility = {
        ...baseAbility,
        damage: baseAbility.damage + CHI_BONUS_DAMAGE,
        label: baseAbility.label ?? baseAbility.combo,
      };
      const attackerName = actingPlayer.hero.name;
      const totalDamage = updatedAbility.damage;
      return {
        tokensConsumed: { chi: 1 },
        statePatch: {
          pendingAttack: {
            ...pendingAttack,
            ability: updatedAbility,
          },
        },
        logs: [
          `${attackerName} spends <<resource:Chi>> for +${CHI_BONUS_DAMAGE} dmg (attack now ${totalDamage}).`,
        ],
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
  SHADOW_MONK_SPEND_CHI_ID,
} as const;
