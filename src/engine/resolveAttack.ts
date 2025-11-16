import { applyAttack, applyAbilityEffects, type AbilityEffectDelta } from "../game/engine";
import type { AttackContext, AttackResolution } from "../game/combat/types";
import type { Side, PlayerState } from "../game/types";
import { buildAttackResolutionLines } from "../game/logging/combatLog";
import {
  aggregateStatusSpendSummaries,
  applyModifiers,
  getStatus,
  type StatusSpendSummary,
} from "./status";
import { TURN_TRANSITION_DELAY_MS } from "../game/flow/turnEnd";

const diffTokens = (before: PlayerState, after: PlayerState) => {
  const beforeTokens = before.tokens ?? {};
  const afterTokens = after.tokens ?? {};
  const diff: Record<string, number> = {};
  const keys = new Set([
    ...Object.keys(beforeTokens),
    ...Object.keys(afterTokens),
  ]);
  keys.forEach((key) => {
    const delta = (afterTokens[key] ?? 0) - (beforeTokens[key] ?? 0);
    if (delta !== 0) {
      diff[key] = delta;
    }
  });
  return diff;
};

const clampDamageMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const hasDamageMitigationEffect = (summary: StatusSpendSummary) =>
  summary.results.some(
    (result) => typeof result.damageMultiplier === "number"
  );

const collectDamageMitigationEffects = (
  summaries: StatusSpendSummary[]
) => {
  const effects: Array<{ id: string; multiplier: number }> = [];
  summaries.forEach((summary) => {
    summary.results.forEach((result) => {
      if (typeof result.damageMultiplier !== "number") return;
      effects.push({
        id: summary.id,
        multiplier: clampDamageMultiplier(result.damageMultiplier),
      });
    });
  });
  return effects;
};

const applyDamageMitigationEffects = (
  remainingDamage: number,
  effects: Array<{ id: string; multiplier: number }>
): { prevented: number; logs: string[] } => {
  if (remainingDamage <= 0 || effects.length === 0) {
    return { prevented: 0, logs: [] };
  }
  const logs: string[] = [];
  let working = remainingDamage;
  effects.forEach(({ id, multiplier }) => {
    const next = Math.floor(working * multiplier);
    const prevented = working - next;
    if (prevented > 0) {
      const label = getStatus(id)?.name ?? id;
      logs.push(`${label} reduced damage by ${prevented}.`);
    }
    working = next;
  });
  return {
    prevented: remainingDamage - working,
    logs,
  };
};

export function resolveAttack(context: AttackContext): AttackResolution {
  const {
    attacker: initialAttacker,
    defender: initialDefender,
    ability,
    attackerSide,
    defenderSide,
    baseDamage,
    attackStatusSpends,
    defense,
  } = context;

  let attackerState = initialAttacker;
  let defenderState = initialDefender;

  if (ability.applyPreDamage) {
    const preResult = applyAbilityEffects(
      attackerState,
      defenderState,
      ability.applyPreDamage
    );
    attackerState = preResult.attacker;
    defenderState = preResult.defender;
  }

  const defenseResolution = defense.resolution ?? null;
  const defenseStatusSpendsRaw = defenseResolution?.statusSpends ?? [];
  const initialBaseBlock = defenseResolution
    ? Math.max(0, defenseResolution.baseBlock)
    : 0;

  const attackModifier = applyModifiers(attackerState.tokens ?? {}, {
    phase: "attack",
    attackerSide,
    defenderSide,
    baseDamage,
    baseBlock: initialBaseBlock,
  });

  const defenseModifier = applyModifiers(defenderState.tokens ?? {}, {
    phase: "defense",
    attackerSide,
    defenderSide,
    baseDamage: attackModifier.ctx.baseDamage,
    baseBlock: initialBaseBlock,
  });

  const modifiedBaseDamage = Math.max(0, defenseModifier.ctx.baseDamage);
  const modifiedBaseBlock = Math.max(0, defenseModifier.ctx.baseBlock);

  const attackTotals = aggregateStatusSpendSummaries(attackStatusSpends);
  const defenseStatusSpends =
    modifiedBaseBlock > 0
      ? defenseStatusSpendsRaw
      : defenseStatusSpendsRaw.filter(
          (spend) =>
            spend.negateIncoming ||
            (spend.bonusDamage ?? 0) !== 0 ||
            hasDamageMitigationEffect(spend)
        );

  const defenseTotals = aggregateStatusSpendSummaries(defenseStatusSpends);

  if (attackModifier.logs.length) {
    attackTotals.logs.push(...attackModifier.logs);
  }
  if (defenseModifier.logs.length) {
    defenseTotals.logs.push(...defenseModifier.logs);
  }

  const effectiveBonusDamage =
    modifiedBaseDamage > 0 ? attackTotals.bonusDamage : 0;
  const attackDamage = Math.max(0, modifiedBaseDamage + effectiveBonusDamage);
  const baseBlock = modifiedBaseBlock;
  const effectiveBonusBlock =
    modifiedBaseBlock > 0 ? defenseTotals.bonusBlock : 0;
  const blockBeforeMitigation = Math.max(
    0,
    modifiedBaseBlock + effectiveBonusBlock
  );
  const mitigationEffects = collectDamageMitigationEffects(
    defenseStatusSpends
  );
  const mitigationOutcome = applyDamageMitigationEffects(
    Math.max(0, attackDamage - blockBeforeMitigation),
    mitigationEffects
  );
  const totalBlock = blockBeforeMitigation + mitigationOutcome.prevented;
  if (mitigationOutcome.logs.length) {
    defenseTotals.logs.push(...mitigationOutcome.logs);
  }
  const defenseState = defenseResolution
    ? {
        ...defenseResolution,
        baseBlock: totalBlock,
        statusSpends: defenseStatusSpends,
      }
    : null;
  const defenseAbilitySelection = defenseResolution?.selection.selected ?? null;
  const defenseAbilityId = defenseAbilitySelection
    ? `${initialDefender.hero.id}:${defenseAbilitySelection.ability.combo}`
    : null;

  let nextAttacker = attackerState;
  let nextDefender = defenderState;
  let damageDealt = 0;
  let reflectDealt = 0;
  let defenseTokenDelta: AbilityEffectDelta | undefined;
  const wasNegated = defenseTotals.negateIncoming;

  if (!wasNegated) {
    const effectiveAbility = {
      ...ability,
      damage: attackDamage,
    };

    const [attackerAfter, defenderAfter, _notes, delta] = applyAttack(
      attackerState,
      defenderState,
      effectiveAbility,
      {
        defense: defenseState,
      }
    );
    defenseTokenDelta = delta;

    nextAttacker = attackerAfter;
    nextDefender = defenderAfter;
    damageDealt = Math.max(0, defenderState.hp - defenderAfter.hp);
    reflectDealt = Math.max(0, attackerState.hp - attackerAfter.hp);
  }

  const damageWithoutBlock = Math.min(attackDamage, defenderState.hp);
  const reportedBlocked = wasNegated
    ? attackDamage
    : Math.max(0, damageWithoutBlock - damageDealt);

  const logs = buildAttackResolutionLines({
    attackerBefore: attackerState,
    attackerAfter: nextAttacker,
    defenderBefore: defenderState,
    defenderAfter: nextDefender,
    baseBlock,
    defenseTokenDelta,
    attackTotals,
    defenseTotals,
    damageDealt,
    blocked: reportedBlocked,
    defense: defenseState,
    reflectedDamage: reflectDealt,
  });

  const outcome: AttackResolution["outcome"] =
    nextDefender.hp <= 0
      ? "defender_defeated"
      : nextAttacker.hp <= 0
      ? "attacker_defeated"
      : "continue";

  const nextSide: Side = attackerSide === "you" ? "ai" : "you";
  const events =
    outcome === "continue"
      ? [
          {
            type: "TURN_END" as const,
            payload: {
              next: nextSide,
              durationMs: TURN_TRANSITION_DELAY_MS,
              prePhase: "turnTransition" as const,
            },
            followUp:
              nextSide === "ai" ? ("trigger_ai_turn" as const) : undefined,
          },
        ]
      : [];

  const fx = [
    ...(damageDealt > 0
      ? [{ side: defenderSide, amount: damageDealt, kind: "hit" as const }]
      : []),
    ...(reflectDealt > 0
      ? [{ side: attackerSide, amount: reflectDealt, kind: "reflect" as const }]
      : []),
  ];

  const attackerStatusDiff = diffTokens(attackerState, nextAttacker);
  const defenderStatusDiff = diffTokens(defenderState, nextDefender);

  const summary = {
    damageDealt,
    blocked: reportedBlocked,
    reflected: reflectDealt,
    negated: wasNegated,
    attackerDefeated: outcome === "attacker_defeated",
    defenderDefeated: outcome === "defender_defeated",
    baseDamage,
    modifiedBaseDamage,
    attackDamage,
    baseBlock,
    totalBlock,
    defenseAbilityId,
    attackerStatusDiff,
    defenderStatusDiff,
  };

  const resolution: AttackResolution = {
    updatedAttacker: nextAttacker,
    updatedDefender: nextDefender,
    logs,
    fx,
    outcome,
    nextPhase: "end",
    nextSide,
    events,
    summary,
  };

  if (wasNegated) {
    return {
      ...resolution,
      fx: [],
    };
  }

  return resolution;
}
