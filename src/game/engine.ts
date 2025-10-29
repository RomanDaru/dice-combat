import type { OffensiveAbility, PlayerState, Tokens } from "./types";
import type { ResolvedDefenseState } from "./combat/types";
import { applyBurnStacks } from "./statuses/burn";

type ApplyAttackOptions = {
  defense?: ResolvedDefenseState | null;
  manualEvasive?: {
    used: boolean;
    success: boolean;
    roll: number;
    label?: string;
    alreadySpent?: boolean;
  };
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

  if (incomingDamage > 0 && opts.manualEvasive && opts.manualEvasive.used) {
    const ev = opts.manualEvasive;
    const label = ev.label ?? defender.hero.name;
    if (!ev.alreadySpent && defender.tokens.evasive > 0) {
      defender = {
        ...defender,
        tokens: {
          ...defender.tokens,
          evasive: Math.max(0, defender.tokens.evasive - 1),
        },
      };
    }
    const message = `${label} Evasive roll: ${ev.roll} -> ${
      ev.success ? "Attack fully dodged (Evasive)." : "Evasive failed."
    }`;
    if (ev.success) {
      return [{ ...attacker }, { ...defender }, [message]];
    }
    notes.push(message);
  }

  const defenseState = opts.defense ?? null;
  const block = defenseState?.block ?? 0;
  const reflect = defenseState?.reflect ?? 0;
  const heal = defenseState?.heal ?? 0;
  const retaliatePercent = defenseState?.retaliatePercent ?? 0;
  const defenseTokens = defenseState?.appliedTokens ?? {};

  const blocked = Math.min(incomingDamage, Math.max(0, block));
  const damageDealt = Math.max(0, incomingDamage - blocked);
  const retaliateDamage = retaliatePercent
    ? Math.floor(incomingDamage * retaliatePercent)
    : 0;

  let defenderTokens = applyDefenseTokens(defender.tokens, defenseTokens);
  const burnBefore = defenderTokens.burn ?? 0;
  const nextBurn = applyBurnStacks(burnBefore, applyEffects.burn ?? 0);
  defenderTokens = { ...defenderTokens, burn: nextBurn };

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
      burn: attacker.tokens.burn ?? 0,
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

  const burnDelta = nextDefender.tokens.burn - (defenderStart.tokens.burn ?? 0);
  if (burnDelta > 0) {
    notes.push(
      `${defender.hero.id} gains Burn (${nextDefender.tokens.burn} stack${
        nextDefender.tokens.burn > 1 ? "s" : ""
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
