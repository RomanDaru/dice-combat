import { Ability, PlayerState } from './types';

export function applyAttack(
  attacker: PlayerState,
  defender: PlayerState,
  ab: Ability,
  opts?: {
    manualDefense?: { reduced: number; reflect: number; roll: number; label?: string };
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
  let nextBurn = currentBurn;
  if (apply.burn !== undefined) {
    nextBurn = Math.min(1, Math.max(currentBurn, apply.burn));
  }

  const nextDef: PlayerState = {
    ...defender,
    hp: defender.hp - dealt,
    tokens: {
      ...defender.tokens,
      ignite: apply.ignite ? 1 : defender.tokens.ignite,
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

  const igniteBefore = defenderStart.tokens.ignite ?? 0;
  const igniteAfter = nextDef.tokens.ignite ?? 0;
  if (igniteAfter > igniteBefore) {
    notes.push(
      `${defender.hero.id} gains Ignite (${igniteAfter} stack${
        igniteAfter > 1 ? 's' : ''
      }).`,
    );
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
