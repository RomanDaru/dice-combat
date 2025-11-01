import type { OffensiveAbility, PlayerState, Tokens } from "./types";
import type { ResolvedDefenseState } from "./combat/types";
import {
  addStacks,
  getStacks,
  aggregateStatusSpendSummaries,
} from "../engine/status";

type ApplyAttackOptions = {
  defense?: ResolvedDefenseState | null;
};

const clampChi = (value: number) => Math.max(0, Math.min(3, value));

const applyDefenseTokens = (tokens: Tokens, gains: Partial<Tokens>): Tokens => {
  if (!gains || Object.keys(gains).length === 0) return tokens;
  return {
    burn: Math.max(0, (tokens.burn ?? 0) + (gains.burn ?? 0)),
    chi: clampChi((tokens.chi ?? 0) + (gains.chi ?? 0)),
    evasive: Math.max(0, (tokens.evasive ?? 0) + (gains.evasive ?? 0)),
  };
};

export function applyAttack(
  attacker: PlayerState,
  defender: PlayerState,
  ability: OffensiveAbility,
  opts: ApplyAttackOptions = {}
): [PlayerState, PlayerState, string[]] {
  const notes: string[] = [];
  const applyEffects = ability.apply ?? {};
  const incomingDamage = ability.damage;
  const attackerStart = attacker;
  const defenderStart = defender;

  const defenseState = opts.defense ?? null;
  const defenseTotals = aggregateStatusSpendSummaries(
    defenseState?.statusSpends ?? []
  );
  const baseBlock = defenseState?.baseBlock ?? 0;
  const effectiveBlock = Math.max(0, baseBlock + defenseTotals.bonusBlock);
  const negateIncoming = defenseTotals.negateIncoming;
  const reflect = defenseState?.reflect ?? 0;
  const heal = defenseState?.heal ?? 0;
  const retaliatePercent = Math.max(
    0,
    Math.min(1, defenseState?.retaliatePercent ?? 0)
  );
  const defenseTokens = defenseState?.appliedTokens ?? {};

  const blocked = negateIncoming
    ? incomingDamage
    : Math.min(incomingDamage, effectiveBlock);
  const damageDealt = negateIncoming
    ? 0
    : Math.max(0, incomingDamage - blocked);
  const retaliateDamage =
    retaliatePercent > 0
      ? Math.floor(damageDealt * retaliatePercent)
      : 0;

  let defenderTokens = applyDefenseTokens(defender.tokens, defenseTokens);
  if (applyEffects.burn && applyEffects.burn > 0) {
    defenderTokens = addStacks(defenderTokens, "burn", applyEffects.burn);
  }
  const burnAfter = getStacks(defenderTokens, "burn", 0);

  const defenderHpAfter = Math.min(
    defender.hero.maxHp,
    Math.max(0, defender.hp - damageDealt) + heal
  );

  const nextDefender: PlayerState = {
    ...defender,
    hp: defenderHpAfter,
    tokens: defenderTokens,
  };

  const attackerHpAfter = Math.max(
    0,
    attacker.hp - reflect - retaliateDamage
  );

  const nextAttacker: PlayerState = {
    ...attacker,
    hp: attackerHpAfter,
    tokens: {
      ...attacker.tokens,
      chi: clampChi((attacker.tokens.chi ?? 0) + (applyEffects.chi ?? 0)),
      evasive: Math.max(0, (attacker.tokens.evasive ?? 0) + (applyEffects.evasive ?? 0)),
      burn: getStacks(attacker.tokens, "burn", 0),
    },
  };

  const reflectTotal = reflect + retaliateDamage;
  const summaryParts = [`Hit for ${damageDealt} dmg (blocked ${blocked}).`];
  if (reflectTotal > 0) {
    summaryParts.push(`Reflected ${reflectTotal}.`);
  }
  if (heal > 0) {
    summaryParts.push(`Healed ${heal}.`);
  }
  notes.push(summaryParts.join(" "));

  const chiGain = Math.max(
    0,
    nextAttacker.tokens.chi - (attackerStart.tokens.chi ?? 0)
  );
  if (chiGain > 0) {
    notes.push(`${attacker.hero.id} gains Chi (+${chiGain}).`);
  }

  const evasiveGain = Math.max(
    0,
    nextAttacker.tokens.evasive - (attackerStart.tokens.evasive ?? 0)
  );
  if (evasiveGain > 0) {
    notes.push(`${attacker.hero.id} gains Evasive (+${evasiveGain}).`);
  }

  const burnDelta = burnAfter - getStacks(defenderStart.tokens, "burn", 0);
  if (burnDelta > 0) {
    notes.push(
      `${defender.hero.id} gains Burn (${burnAfter} stack${
        burnAfter > 1 ? "s" : ""
      }).`
    );
  }

  if (defenseState?.selection.selected) {
    const abilityName =
      defenseState.selection.selected.ability.displayName ??
      defenseState.selection.selected.ability.label ??
      defenseState.selection.selected.ability.combo;
    notes.push(`Defense used: ${abilityName}.`);
  }

  return [nextAttacker, nextDefender, notes];
}









