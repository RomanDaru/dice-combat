import {
  Ability,
  DefenseCalculationResult,
  DefenseModifierInfo,
  PlayerState,
} from "./types";
import { DefenseModifierRegistry } from "./defenseModifiers";
import { applyBurnStacks, MAX_BURN_STACKS } from "./statuses/burn";

export function calculateDefenseOutcome(
  attacker: PlayerState,
  defender: PlayerState,
  ability: Ability,
  defenseRoll: number
): DefenseCalculationResult {
  const threatenedDamage = ability.damage;
  const baseDefense = defender.hero.defense.fromRoll({
    roll: defenseRoll,
    tokens: defender.tokens,
  });
  const baseBlock = baseDefense.reduced;
  const baseReflect = baseDefense.reflect;
  const modifiersApplied: DefenseModifierInfo[] = [];

  let totalBlock = baseBlock;
  let totalReflect = baseReflect;

  DefenseModifierRegistry.forEach((modifier) => {
    if (!modifier.shouldApply(defender, defenseRoll)) return;
    const bonus = modifier.calculateBonus(defender, defenseRoll);
    if (!bonus) return;
    totalBlock += bonus.blockBonus;
    totalReflect += bonus.reflectBonus;
    modifiersApplied.push(bonus);
  });

  const clampedBlock = Math.max(0, totalBlock);
  const clampedReflect = Math.max(0, totalReflect);
  const damageDealt = Math.max(0, threatenedDamage - clampedBlock);
  const finalAttackerHp = Math.max(0, attacker.hp - clampedReflect);
  const finalDefenderHp = Math.max(0, defender.hp - damageDealt);

  return {
    threatenedDamage,
    defenseRoll,
    baseBlock,
    baseBlockLog: `Base Block ${baseBlock}`,
    modifiersApplied,
    totalBlock: clampedBlock,
    totalReflect: clampedReflect,
    damageDealt,
    finalAttackerHp,
    finalDefenderHp,
    maxAttackerHp: attacker.hero.maxHp,
    maxDefenderHp: defender.hero.maxHp,
    attackerName: attacker.hero.name,
    defenderName: defender.hero.name,
  };
}

export function applyAttack(
  attacker: PlayerState,
  defender: PlayerState,
  ab: Ability,
  opts?: {
    manualDefense?: {
      reduced: number;
      reflect: number;
      roll: number;
      label?: string;
      baseReduced?: number;
      chiUsed?: number;
    };
    manualEvasive?: { used: boolean; success: boolean; roll: number; label?: string };
  }
): [PlayerState, PlayerState, string[]] {
  const notes: string[] = [];
  const apply = ab.apply ?? {};
  const incoming = ab.damage;
  const attackerStart = attacker;
  const defenderStart = defender;

  // Manual evasive handling (roll performed outside the engine).
  if (incoming > 0 && opts?.manualEvasive && opts.manualEvasive.used) {
    const ev = opts.manualEvasive;
    const label = ev.label ?? 'Def';
    if (defender.tokens.evasive > 0) {
      defender = {
        ...defender,
        tokens: {
          ...defender.tokens,
          evasive: Math.max(0, defender.tokens.evasive - 1),
        },
      };
    }
    const evMessage = `${label} Evasive roll: ${ev.roll} -> ${
      ev.success ? 'Attack fully dodged (Evasive).' : 'Evasive failed.'
    }`;
    if (ev.success) {
      return [{ ...attacker }, { ...defender }, [evMessage]];
    }
    notes.push(evMessage);
  }

  let reduced = 0;
  let reflect = 0;
  if (incoming > 0) {
    if (opts?.manualDefense) {
      reduced = opts.manualDefense.reduced;
      reflect = opts.manualDefense.reflect;
      notes.push(`${opts.manualDefense.label ?? 'DEF'} defense roll: ${opts.manualDefense.roll}`);
    } else {
      const d = defender.hero.defense.roll(defender.tokens);
      reduced = d.reduced;
      reflect = d.reflect;
      notes.push(`${defender.hero.name} defense roll: ${d.roll}`);
    }
  }

  const dealt = Math.max(0, incoming - reduced);
  const blocked = Math.min(incoming, Math.max(0, reduced));

  const currentBurn = defender.tokens.burn ?? 0;
  const burnGain = apply.burn ?? 0;
  const nextBurn = applyBurnStacks(currentBurn, burnGain);

  const nextDef: PlayerState = {
    ...defender,
    hp: defender.hp - dealt,
    tokens: {
      ...defender.tokens,
      burn: nextBurn,
    },
  };

  const nextAtt: PlayerState = {
    ...attacker,
    hp: attacker.hp - reflect,
    tokens: {
      ...attacker.tokens,
      chi: Math.min(3, attacker.tokens.chi + (apply.chi ?? 0)),
      evasive: attacker.tokens.evasive + (apply.evasive ?? 0),
    },
  };

  notes.push(
    `Hit for ${dealt} dmg (blocked ${blocked})${reflect ? `, reflected ${reflect}` : ''}.`,
  );

  const chiGain = Math.max(0, nextAtt.tokens.chi - attackerStart.tokens.chi);
  if (chiGain > 0) {
    notes.push(`${attacker.hero.id} gains Chi (+${chiGain}).`);
  }

  const evasiveGain = Math.max(
    0,
    nextAtt.tokens.evasive - attackerStart.tokens.evasive,
  );
  if (evasiveGain > 0) {
    notes.push(`${attacker.hero.id} gains Evasive (+${evasiveGain}).`);
  }

  const burnBefore = defenderStart.tokens.burn ?? 0;
  const burnAfter = nextDef.tokens.burn ?? 0;
  if (burnAfter > burnBefore) {
    notes.push(
      `${defender.hero.id} gains Burn (${burnAfter} stack${
        burnAfter > 1 ? 's' : ''
      }).`,
    );
  }

  return [nextAtt, nextDef, notes];
}
