import type { OffensiveAbility, PlayerState, Tokens } from "./types";
import type { ResolvedDefenseState } from "./combat/types";
import { addStacks, getStacks, setStacks, aggregateStatusSpendSummaries } from "../engine/status";

type ApplyAttackOptions = {
  defense?: ResolvedDefenseState | null;
};

const clampChi = (value: number) => Math.max(0, Math.min(3, value));

const applyDefenseTokens = (
  tokens: Tokens,
  gains: Partial<Tokens>
): { tokens: Tokens; delta: AbilityEffectDelta } => {
  if (!gains || Object.keys(gains).length === 0) {
    return {
      tokens,
      delta: { burnDelta: 0, chiDelta: 0, evasiveDelta: 0 },
    };
  }

  let updated = tokens;
  const delta: AbilityEffectDelta = { burnDelta: 0, chiDelta: 0, evasiveDelta: 0 };

  if (typeof gains.burn === "number" && gains.burn !== 0) {
    const before = getStacks(updated, "burn", 0);
    updated = addStacks(updated, "burn", gains.burn);
    delta.burnDelta = getStacks(updated, "burn", 0) - before;
  }

  if (typeof gains.chi === "number" && gains.chi !== 0) {
    const before = getStacks(updated, "chi", 0);
    const nextChi = clampChi(before + gains.chi);
    updated = setStacks(updated, "chi", nextChi);
    delta.chiDelta = nextChi - before;
  }

  if (typeof gains.evasive === "number" && gains.evasive !== 0) {
    const before = getStacks(updated, "evasive", 0);
    const nextEvasive = Math.max(0, before + gains.evasive);
    updated = setStacks(updated, "evasive", nextEvasive);
    delta.evasiveDelta = nextEvasive - before;
  }

  return { tokens: updated, delta };
};

export type AbilityEffectDelta = {
  burnDelta: number;
  chiDelta: number;
  evasiveDelta: number;
};

const EMPTY_EFFECT_DELTA: AbilityEffectDelta = {
  burnDelta: 0,
  chiDelta: 0,
  evasiveDelta: 0,
};

export function applyAbilityEffects(
  attacker: PlayerState,
  defender: PlayerState,
  effects?: OffensiveAbility["applyPreDamage"]
): {
  attacker: PlayerState;
  defender: PlayerState;
  delta: AbilityEffectDelta;
} {
  if (!effects) {
    return { attacker, defender, delta: EMPTY_EFFECT_DELTA };
  }

  let attackerTokens = attacker.tokens;
  let defenderTokens = defender.tokens;
  let burnDelta = 0;
  let chiDelta = 0;
  let evasiveDelta = 0;

  if (typeof effects.burn === "number" && effects.burn !== 0) {
    const before = getStacks(defenderTokens, "burn", 0);
    defenderTokens = addStacks(defenderTokens, "burn", effects.burn);
    burnDelta = getStacks(defenderTokens, "burn", 0) - before;
  }

  if (typeof effects.chi === "number" && effects.chi !== 0) {
    const before = getStacks(attackerTokens, "chi", 0);
    const nextChi = clampChi(before + effects.chi);
    attackerTokens = setStacks(attackerTokens, "chi", nextChi);
    chiDelta = nextChi - before;
  }

  if (typeof effects.evasive === "number" && effects.evasive !== 0) {
    const before = getStacks(attackerTokens, "evasive", 0);
    const nextEvasive = Math.max(0, before + effects.evasive);
    attackerTokens = setStacks(attackerTokens, "evasive", nextEvasive);
    evasiveDelta = nextEvasive - before;
  }

  const attackerChanged = attackerTokens !== attacker.tokens;
  const defenderChanged = defenderTokens !== defender.tokens;

  return {
    attacker: attackerChanged ? { ...attacker, tokens: attackerTokens } : attacker,
    defender: defenderChanged ? { ...defender, tokens: defenderTokens } : defender,
    delta: { burnDelta, chiDelta, evasiveDelta },
  };
}

export function applyAttack(
  attacker: PlayerState,
  defender: PlayerState,
  ability: OffensiveAbility,
  opts: ApplyAttackOptions = {}
): [PlayerState, PlayerState, string[], AbilityEffectDelta] {
  const notes: string[] = [];
  const postDamageEffects = ability.applyPostDamage ?? ability.apply;
  const incomingDamage = ability.damage;

  const defenseState = opts.defense ?? null;
  const defenseTotals = aggregateStatusSpendSummaries(
    defenseState?.statusSpends ?? []
  );
  const baseBlock = defenseState?.baseBlock ?? 0;
  const effectiveBlock = Math.max(0, baseBlock);
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

  const defenseTokenResult = applyDefenseTokens(defender.tokens, defenseTokens);
  let defenderTokens = defenseTokenResult.tokens;
  const defenderAfterDefense =
    defenderTokens === defender.tokens
      ? defender
      : { ...defender, tokens: defenderTokens };

  const {
    attacker: attackerAfterEffects,
    defender: defenderAfterEffects,
    delta: postEffectDelta,
  } = applyAbilityEffects(attacker, defenderAfterDefense, postDamageEffects);

  const defenderHpAfter = Math.min(
    defenderAfterEffects.hero.maxHp,
    Math.max(0, defenderAfterEffects.hp - damageDealt) + heal
  );

  const nextDefender: PlayerState = {
    ...defenderAfterEffects,
    hp: defenderHpAfter,
  };

  const attackerHpAfter = Math.max(
    0,
    attackerAfterEffects.hp - reflect - retaliateDamage
  );

  const nextAttacker: PlayerState = {
    ...attackerAfterEffects,
    hp: attackerHpAfter,
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

  const chiGain = Math.max(0, postEffectDelta.chiDelta);
  if (chiGain > 0) {
    notes.push(`${attacker.hero.id} gains Chi (+${chiGain}).`);
  }

  const evasiveGain = Math.max(0, postEffectDelta.evasiveDelta);
  if (evasiveGain > 0) {
    notes.push(`${attacker.hero.id} gains Evasive (+${evasiveGain}).`);
  }

  const burnAfter = getStacks(nextDefender.tokens, "burn", 0);
  if (postEffectDelta.burnDelta > 0) {
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

  return [nextAttacker, nextDefender, notes, defenseTokenResult.delta];
}











