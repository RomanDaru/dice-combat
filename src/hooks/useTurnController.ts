import { MutableRefObject, useCallback } from 'react';
import type { GameState } from '../game/state';
import type { Phase, Side } from '../game/types';
import type { PlayerState } from '../game/types';
import { tickStatuses } from '../game/defense';
import { indentLog } from './useCombatLog';

type UseTurnControllerArgs = {
  stateRef: MutableRefObject<GameState>;
  setYou: (player: PlayerState) => void;
  setAi: (player: PlayerState) => void;
  setTurn: (side: Side) => void;
  setPhase: (phase: Phase) => void;
  setRound: (round: number) => void;
  setPendingAttack: (attack: GameState['pendingAttack']) => void;
  setPendingStatusClear: (status: GameState['pendingStatusClear']) => void;
  setAiSimActive: (value: boolean) => void;
  setAiSimRolling: (value: boolean) => void;
  setAiDefenseSim: (value: boolean) => void;
  setAiDefenseRoll: (value: number | null) => void;
  setAiEvasiveRoll: (value: number | null) => void;
  resetRoll: () => void;
  pushLog: (entry: string | string[], options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }) => void;
  popDamage: (side: Side, amount: number, kind?: 'hit' | 'reflect') => void;
  statusResumeRef: MutableRefObject<(() => void) | null>;
};

export function useTurnController({
  stateRef,
  setYou,
  setAi,
  setTurn,
  setPhase,
  setRound,
  setPendingAttack,
  setPendingStatusClear,
  setAiSimActive,
  setAiSimRolling,
  setAiDefenseSim,
  setAiDefenseRoll,
  setAiEvasiveRoll,
  resetRoll,
  pushLog,
  popDamage,
  statusResumeRef,
}: UseTurnControllerArgs) {
  const tickAndStart = useCallback(
    (next: Side, afterReady?: () => void): boolean => {
      let continueBattle = true;
      let statusPending = false;
      let statusEntry: { side: Side; status: 'burn'; stacks: number } | null =
        null;
      const upkeepLines: string[] = [];
      let aiHeader: string | null = null;

      if (next === 'you') {
        const before = stateRef.current.players.you;
        if (before) {
          const heroName = before.hero.name;
          const burnStacks = before.tokens.burn;
          const burnDamage = burnStacks * 2;
          const igniteDamage = before.tokens.ignite > 0 ? 1 : 0;
          const totalDamage = burnDamage + igniteDamage;
          const after = tickStatuses(before);
          setYou(after);
          if (totalDamage > 0) {
            popDamage('you', totalDamage, 'hit');
            const parts: string[] = [];
            if (burnDamage > 0)
              parts.push(`Burn ${burnStacks} -> ${burnDamage} dmg`);
            if (igniteDamage > 0) parts.push('Ignite -> 1 dmg');
            upkeepLines.push(
              indentLog(
                `Upkeep: ${heroName} takes ${totalDamage} dmg (${parts.join(
                  ', '
                )}). HP: ${after.hp}/${after.hero.maxHp}.`
              )
            );
          }
          if (after.hp <= 0) {
            pushLog(`${heroName} fell to status damage.`);
            continueBattle = false;
          }
          const opponent = stateRef.current.players.ai;
          if (!opponent || opponent.hp <= 0) continueBattle = false;
          const needsBurnClear =
            continueBattle && burnDamage > 0 && after.tokens.burn > 0;
          if (needsBurnClear) {
            statusPending = true;
            statusEntry = {
              side: next,
              status: 'burn',
              stacks: after.tokens.burn,
            };
          }
        } else {
          continueBattle = false;
        }
      } else {
        const before = stateRef.current.players.ai;
        if (before) {
          const heroName = before.hero.name;
          aiHeader = `[AI] ${heroName} \u00FAto\u010D\u00ED:`;
          const burnStacks = before.tokens.burn;
          const burnDamage = burnStacks * 2;
          const igniteDamage = before.tokens.ignite > 0 ? 1 : 0;
          const totalDamage = burnDamage + igniteDamage;
          const after = tickStatuses(before);
          setAi(after);
          if (totalDamage > 0) {
            popDamage('ai', totalDamage, 'hit');
            const parts: string[] = [];
            if (burnDamage > 0)
              parts.push(`Burn ${burnStacks} -> ${burnDamage} dmg`);
            if (igniteDamage > 0) parts.push('Ignite -> 1 dmg');
            upkeepLines.push(
              indentLog(
                `Upkeep: ${heroName} takes ${totalDamage} dmg (${parts.join(
                  ', '
                )}). HP: ${after.hp}/${after.hero.maxHp}.`
              )
            );
          }
          if (after.hp <= 0) {
            pushLog(`${heroName} fell to status damage.`);
            continueBattle = false;
          }
          const opponent = stateRef.current.players.you;
          if (!opponent || opponent.hp <= 0) continueBattle = false;
          const needsBurnClear =
            continueBattle && burnDamage > 0 && after.tokens.burn > 0;
          if (needsBurnClear) {
            statusPending = true;
            statusEntry = {
              side: next,
              status: 'burn',
              stacks: after.tokens.burn,
            };
          }
        } else {
          continueBattle = false;
        }
      }

      setTurn(next);
      setPhase('upkeep');
      setPendingAttack(null);
      setAiSimActive(false);
      setAiSimRolling(false);
      setAiDefenseSim(false);
      setAiDefenseRoll(null);
      setAiEvasiveRoll(null);
      resetRoll();

      if (!continueBattle) {
        setPendingStatusClear(null);
        statusResumeRef.current = null;
        return false;
      }

      if (next === 'you') {
        const newRound = stateRef.current.round + 1;
        setRound(newRound);
        stateRef.current = { ...stateRef.current, round: newRound };
        pushLog(`--- Kolo ${newRound} ---`, { blankLineBefore: true });
        if (upkeepLines.length) {
          pushLog(upkeepLines);
        }
      } else if (next === 'ai') {
        const lines = [aiHeader ?? '[AI] AI \u00FAto\u010D\u00ED:'];
        if (upkeepLines.length) lines.push(...upkeepLines);
        pushLog(lines, { blankLineBefore: true });
      } else if (upkeepLines.length) {
        pushLog(upkeepLines, { blankLineBefore: true });
      }

      if (statusPending && statusEntry) {
        setPendingStatusClear(statusEntry);
        statusResumeRef.current = afterReady ?? null;
      } else {
        setPendingStatusClear(null);
        statusResumeRef.current = null;
        window.setTimeout(() => setPhase('roll'), 600);
        afterReady?.();
      }

      return true;
    },
    [
      popDamage,
      pushLog,
      resetRoll,
      setAi,
      setAiDefenseRoll,
      setAiDefenseSim,
      setAiEvasiveRoll,
      setAiSimActive,
      setAiSimRolling,
      setPendingAttack,
      setPendingStatusClear,
      setPhase,
      setRound,
      setTurn,
      setYou,
      stateRef,
      statusResumeRef,
    ]
  );

  return {
    tickAndStart,
  };
}

