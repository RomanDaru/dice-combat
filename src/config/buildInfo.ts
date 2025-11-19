import type { HeroId } from "../game/types";

export const RULES_VERSION = "0.9.3";
export const DEFENSE_SCHEMA_VERSION = "0.1.0";
export const DEFENSE_DSL_VERSION = "0.1.0";
export const BUILD_HASH = "abc123";

export const HERO_VERSION_MAP: Record<HeroId, string> = {
  Pyromancer: "0.7.2",
  "Shadow Monk": "0.2.1",
  "Training Dummy": "0.1.0",
};
