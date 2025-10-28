import { applyAttack } from "../engine";
import type { AttackContext, AttackResolution } from "./types";
import { buildAttackResolutionLines } from "../logging/combatLog";

export function resolveAttack(context: AttackContext): AttackResolution {
  const {
    attacker,
    defender,
    ability,
    attackerSide,
    defenderSide,
    attackChiSpend,
    attackChiApplied,
    defense,
  } = context;

  const effectiveAbility = {
    ...ability,
    damage: ability.damage + (attackChiApplied ? 0 : attackChiSpend),
  };

  const [nextAttacker, nextDefender] = applyAttack(
    attacker,
    defender,
    effectiveAbility,
    {
      manualDefense: defense.manualDefense,
      manualEvasive: defense.manualEvasive,
    }
  );

  const damageDealt = Math.max(0, defender.hp - nextDefender.hp);
  const reflectDealt = Math.max(0, attacker.hp - nextAttacker.hp);

  const logs = buildAttackResolutionLines({
    attackerBefore: attacker,
    attackerAfter: nextAttacker,
    defenderBefore: defender,
    defenderAfter: nextDefender,
    incomingDamage: effectiveAbility.damage,
    defenseRoll: defense.defenseRoll,
    manualDefense: defense.manualDefense,
    manualEvasive: defense.manualEvasive,
    reflectedDamage: reflectDealt,
    defenseOutcome: defense.defenseOutcome,
    attackChiSpent: attackChiSpend,
    defenseChiSpent: defense.defenseChiSpend,
  });

  const outcome: AttackResolution["outcome"] =
    nextDefender.hp <= 0
      ? "defender_defeated"
      : nextAttacker.hp <= 0
      ? "attacker_defeated"
      : "continue";

  const events =
    outcome === "continue"
      ? [
          {
            type: "TURN_END" as const,
            payload: {
              next: attackerSide === "you" ? "ai" : "you",
              delayMs: 700,
              prePhase: "end" as const,
            },
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
    nextSide: attackerSide === "you" ? "ai" : "you",
    events,
  };
}
