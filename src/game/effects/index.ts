import { burnDefinition } from "../statuses";
import type { EffectDefinition, EffectId } from "./types";

const effectDefinitions: Record<EffectId, EffectDefinition> = {
  burn: {
    id: "burn",
    kind: "status",
    name: burnDefinition.description?.name ?? "Burn",
    icon: burnDefinition.description?.icon ?? "🔥",
    summary:
      burnDefinition.description?.text ??
      "Applies damage at the start of each upkeep and then decays by one stack. Can be cleansed with a high roll.",
  },
  chi: {
    id: "chi",
    kind: "resource",
    name: "Chi",
    icon: "✴",
    summary:
      "Monk defense converts Chi into extra block on strong rolls. Chi can also be spent by certain abilities to empower attacks.",
  },
  evasive: {
    id: "evasive",
    kind: "resource",
    name: "Evasive",
    icon: "➰",
    summary:
      "Spend an Evasive token to attempt a dodge. Rolling 5+ avoids all damage from the incoming attack.",
  },
};

export const getEffectDefinition = (id: EffectId): EffectDefinition | undefined =>
  effectDefinitions[id];

export const ALL_EFFECT_IDS = Object.keys(effectDefinitions) as EffectId[];

export type { EffectId, EffectDefinition, EffectKind } from "./types";
