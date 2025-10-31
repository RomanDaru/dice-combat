import { getStatus } from "../../engine/status";
import type { EffectDefinition, EffectId } from "./types";

const burnStatus = getStatus("burn");

const effectDefinitions: Record<EffectId, EffectDefinition> = {
  burn: {
    id: "burn",
    kind: "status",
    name: burnStatus?.name ?? "Burn",
    icon: burnStatus?.icon ?? "B",
    summary:
      "Applies damage at the start of each upkeep and then decays by one stack. Can be cleansed with a high roll.",
  },
  chi: {
    id: "chi",
    kind: "resource",
    name: "Chi",
    icon: "C",
    summary:
      "Monk defense converts Chi into extra block on strong rolls. Chi can also be spent by certain abilities to empower attacks.",
  },
  evasive: {
    id: "evasive",
    kind: "resource",
    name: "Evasive",
    icon: "E",
    summary:
      "Spend an Evasive token to attempt a dodge. Rolling 5+ avoids all damage from the incoming attack.",
  },
};

export const getEffectDefinition = (id: EffectId): EffectDefinition | undefined =>
  effectDefinitions[id];

export const ALL_EFFECT_IDS = Object.keys(effectDefinitions) as EffectId[];

export type { EffectId, EffectDefinition, EffectKind } from "./types";
