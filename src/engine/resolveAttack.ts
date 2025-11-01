import { applyAttack } from "../game/engine";
import type { AttackContext, AttackResolution } from "../game/combat/types";
import type { Side } from "../game/types";
import { buildAttackResolutionLines } from "../game/logging/combatLog";
import { aggregateStatusSpendSummaries } from "./status";

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

  const attackTotals = aggregateStatusSpendSummaries(attackStatusSpends);
  const defenseResolution = defense.resolution ?? null;
  const defenseTotals = aggregateStatusSpendSummaries(
    defenseResolution?.statusSpends ?? []
  );
  const attackDamage = Math.max(0, baseDamage + attackTotals.bonusDamage);
  const baseBlock = defenseResolution ? Math.max(0, defenseResolution.baseBlock) : 0;
  const totalBlock = baseBlock + defenseTotals.bonusBlock;

  const effectiveAbility = {
    ...ability,
    damage: attackDamage,
  };

  const [nextAttacker, nextDefender] = applyAttack(
    attacker,
    defender,
    effectiveAbility,
    {
      defense: defenseResolution,
    }
  );

  const damageDealt = Math.max(0, defender.hp - nextDefender.hp);
  const reflectDealt = Math.max(0, attacker.hp - nextAttacker.hp);
  const wasNegated = defenseTotals.negateIncoming;
  const blocked = wasNegated
    ? attackDamage
    : Math.max(0, attackDamage - damageDealt);

  const logs = buildAttackResolutionLines({
    attackerBefore: attacker,
    attackerAfter: nextAttacker,
    defenderBefore: defender,
    defenderAfter: nextDefender,
    baseBlock,
    attackTotals,
    defenseTotals,
    damageDealt,
    blocked,
    defense: defenseResolution,
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
              delayMs: 700,
              prePhase: "end" as const,
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

  return {
    updatedAttacker: nextAttacker,
    updatedDefender: nextDefender,
    logs,
    fx,
    outcome,
    nextPhase: "end",
    nextSide,
    events,
  };
}
