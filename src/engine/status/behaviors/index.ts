import type { StatusBehaviorId } from "../types";
import type { StatusBehaviorHandlers } from "./types";
import { bonusPoolBehavior } from "./bonusPool";
import { preDefenseReactionBehavior } from "./preDefenseReaction";
import { damageOverTimeBehavior } from "./damageOverTime";

const REGISTRY: Record<StatusBehaviorId, StatusBehaviorHandlers> = {
  bonus_pool: bonusPoolBehavior,
  pre_defense_reaction: preDefenseReactionBehavior,
  damage_over_time: damageOverTimeBehavior,
  custom_script: {},
};

export const getBehaviorHandlers = (id?: StatusBehaviorId) =>
  id ? REGISTRY[id] : undefined;
