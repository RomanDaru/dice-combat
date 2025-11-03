import { applyAttack } from "../game/engine";
import type { AttackContext, AttackResolution } from "../game/combat/types";
import type { Side } from "../game/types";
import { buildAttackResolutionLines } from "../game/logging/combatLog";
import { aggregateStatusSpendSummaries, applyModifiers } from "./status";
import { TURN_TRANSITION_DELAY_MS } from "../game/flow/turnEnd";

export function resolveAttack(context: AttackContext): AttackResolution {
  const {
    attacker,
    defender,
    ability,
    attackerSide,
    defenderSide,
    baseDamage,
    attackStatusSpends,
    defense,
  } = context;

  const defenseResolution = defense.resolution ?? null;
  const defenseStatusSpendsRaw = defenseResolution?.statusSpends ?? [];
  const initialBaseBlock = defenseResolution
    ? Math.max(0, defenseResolution.baseBlock)
    : 0;

  const attackModifier = applyModifiers(attacker.tokens ?? {}, {
    phase: "attack",
    attackerSide,
    defenderSide,
    baseDamage,
    baseBlock: initialBaseBlock,
  });

  const defenseModifier = applyModifiers(defender.tokens ?? {}, {
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
            spend.negateIncoming || (spend.bonusDamage ?? 0) !== 0
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
  const totalBlock = Math.max(0, modifiedBaseBlock + effectiveBonusBlock);
  const defenseState = defenseResolution
    ? {
        ...defenseResolution,
        baseBlock: totalBlock,
        statusSpends: defenseStatusSpends,
      }
    : null;

  let nextAttacker = attacker;
  let nextDefender = defender;
  let damageDealt = 0;
  let reflectDealt = 0;
  const wasNegated = defenseTotals.negateIncoming;

  if (!wasNegated) {
    const effectiveAbility = {
      ...ability,
      damage: attackDamage,
    };

    const [attackerAfter, defenderAfter] = applyAttack(
      attacker,
      defender,
      effectiveAbility,
      {
        defense: defenseState,
      }
    );

    nextAttacker = attackerAfter;
    nextDefender = defenderAfter;
    damageDealt = Math.max(0, defender.hp - defenderAfter.hp);
    reflectDealt = Math.max(0, attacker.hp - attackerAfter.hp);
  }

  const damageWithoutBlock = Math.min(attackDamage, defender.hp);
  const reportedBlocked = wasNegated
    ? attackDamage
    : Math.max(0, damageWithoutBlock - damageDealt);

  const logs = buildAttackResolutionLines({
    attackerBefore: attacker,
    attackerAfter: nextAttacker,
    defenderBefore: defender,
    defenderAfter: nextDefender,
    baseBlock,
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
              delayMs: TURN_TRANSITION_DELAY_MS,
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

  const resolution: AttackResolution = {
    updatedAttacker: nextAttacker,
    updatedDefender: nextDefender,
    logs,
    fx,
    outcome,
    nextPhase: "end",
    nextSide,
    events,
  };

  if (wasNegated) {
    return {
      ...resolution,
      fx: [],
    };
  }

  return resolution;
}
