import type { StatusTickResult } from "../types";
import type { StatusBehaviorHandlers } from "./types";

type DamageOverTimeConfig = {
  tiers?: number[];
  decayPerTick?: number;
  promptOnDamage?: boolean;
};

const clampStacks = (stacks: number): number => Math.max(0, stacks);

const resolveDamage = (
  stacks: number,
  tiers: number[]
): number => {
  if (stacks <= 0 || tiers.length === 0) return 0;
  const index = Math.min(stacks, tiers.length) - 1;
  return tiers[index] ?? 0;
};

const buildTickResult = (
  label: string,
  stacks: number,
  damage: number,
  nextStacks: number,
  promptOnDamage: boolean
): StatusTickResult => ({
  damage,
  nextStacks,
  log: damage > 0 ? `${label} ${stacks} -> ${damage} dmg` : undefined,
  prompt: promptOnDamage ? damage > 0 : damage > 0 && nextStacks > 0,
});

export const damageOverTimeBehavior: StatusBehaviorHandlers = {
  applyTick: ({ def, config, stacks }) => {
    const cfg = (config ?? {}) as DamageOverTimeConfig;
    const tiers = cfg.tiers ?? [];
    const cappedStacks = clampStacks(stacks);
    const damage = resolveDamage(cappedStacks, tiers);
    const decay = Math.max(0, Math.round(cfg.decayPerTick ?? 1));
    const nextStacks = Math.max(0, cappedStacks - decay);
    return buildTickResult(
      def.name,
      cappedStacks,
      damage,
      nextStacks,
      Boolean(cfg.promptOnDamage)
    );
  },
};
