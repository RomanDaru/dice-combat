export const HERO_SKIN_IDS = {
  DEFAULT: "default",
  PYROMANCER_DEFAULT: "pyromancer-default",
  SHADOW_MONK_DEFAULT: "shadow-monk-default",
  TRAINING_DUMMY_DEFAULT: "training-dummy-default",
} as const;

export type HeroSkinId = (typeof HERO_SKIN_IDS)[keyof typeof HERO_SKIN_IDS];
