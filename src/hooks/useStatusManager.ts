import { MutableRefObject, useCallback, useRef } from 'react';
import type { GameState, PendingStatusClear } from '../game/state';
import type { Phase, Side } from '../game/types';
import type { PlayerState } from '../game/types';
import { indentLog } from './useCombatLog';

type UseStatusManagerArgs = {
  stateRef: MutableRefObject<GameState>;
  setPlayer: (side: Side, player: PlayerState) => void;
  setPendingStatusClear: (status: PendingStatusClear) => void;
  pushLog: (entry: string | string[], options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }) => void;
  animateDefenseDie: (onDone: (roll: number) => void, duration?: number) => void;
  restoreDiceAfterDefense: () => void;
  setPhase: (phase: Phase) => void;
};

export function useStatusManager({
  stateRef,
  setPlayer,
  setPendingStatusClear,
  pushLog,
  animateDefenseDie,
  restoreDiceAfterDefense,
  setPhase,
}: UseStatusManagerArgs) {
  const statusResumeRef = useRef<(() => void) | null>(null);

  const performStatusClearRoll = useCallback(
    (side: Side) => {
      const currentStatus = stateRef.current.pendingStatusClear;
      if (!currentStatus || currentStatus.side !== side || currentStatus.rolling) {
        return;
      }

      setPendingStatusClear({ ...currentStatus, rolling: true });
      animateDefenseDie((roll) => {
        const success = roll >= 5;
        const snapshot = stateRef.current;
        const playerState = snapshot.players[side];
        if (success && playerState) {
          const updatedPlayer: PlayerState = {
            ...playerState,
            tokens: { ...playerState.tokens, burn: 0 },
          };
          setPlayer(side, updatedPlayer);
        }
        const heroName = playerState?.hero.name ?? (side === 'you' ? 'You' : 'AI');
        pushLog(
          indentLog(
            `Upkeep: ${heroName} roll vs Burn: ${roll} ${
              success ? '-> removes Burn' : '-> Burn persists'
            }.`
          )
        );
        setPendingStatusClear({
          ...currentStatus,
          stacks: success ? 0 : currentStatus.stacks,
          rolling: false,
          roll,
          success,
        });
        window.setTimeout(() => {
          restoreDiceAfterDefense();
          window.setTimeout(() => {
            setPendingStatusClear(null);
            setPhase('roll');
            const resume = statusResumeRef.current;
            statusResumeRef.current = null;
            resume?.();
          }, 400);
        }, 600);
      }, 650);
    },
    [
      animateDefenseDie,
      pushLog,
      restoreDiceAfterDefense,
      setPendingStatusClear,
      setPhase,
      setPlayer,
      stateRef,
      statusResumeRef,
    ]
  );

  return {
    statusResumeRef,
    performStatusClearRoll,
  };
}

