import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import type { GameState } from "../game/state";
import type { Side } from "../game/types";
import type { PlayerState } from "../game/types";
import { tickStatuses } from "../game/defense";
import { indentLog } from "./useCombatLog";
import { useGame } from "../context/GameContext";

type UseTurnControllerArgs = {
  resetRoll: () => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  statusResumeRef: MutableRefObject<(() => void) | null>;
};

export function useTurnController({
  resetRoll,
  pushLog,
  popDamage,
  statusResumeRef,
}: UseTurnControllerArgs) {
  const { state, dispatch } = useGame();
  const stateRef = useRef<GameState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({ type: "SET_PLAYER", side, player });
    },
    [dispatch]
  );

  const patchState = useCallback(
    (partial: Partial<GameState>) => {
      dispatch({ type: "PATCH_STATE", payload: partial });
      stateRef.current = { ...stateRef.current, ...partial };
    },
    [dispatch]
  );

  const patchAiPreview = useCallback(
    (partial: Partial<GameState["aiPreview"]>) => {
      dispatch({ type: "PATCH_AI_PREVIEW", payload: partial });
      stateRef.current = {
        ...stateRef.current,
        aiPreview: { ...stateRef.current.aiPreview, ...partial },
      };
    },
    [dispatch]
  );

  const patchAiDefense = useCallback(
    (partial: Partial<GameState["aiDefense"]>) => {
      dispatch({ type: "PATCH_AI_DEFENSE", payload: partial });
      stateRef.current = {
        ...stateRef.current,
        aiDefense: { ...stateRef.current.aiDefense, ...partial },
      };
    },
    [dispatch]
  );

  const tickAndStart = useCallback(
    (next: Side, afterReady?: () => void): boolean => {
      let continueBattle = true;
      let statusPending = false;
      let statusEntry: { side: Side; status: "burn"; stacks: number } | null =
        null;
      const upkeepLines: string[] = [];
      let aiHeader: string | null = null;

      if (next === "you") {
        const before = stateRef.current.players.you;
        if (before) {
          const heroName = before.hero.name;
          const burnStacks = before.tokens.burn;
          const burnDamage = burnStacks * 2;
          const igniteDamage = before.tokens.ignite > 0 ? 1 : 0;
          const totalDamage = burnDamage + igniteDamage;
          const after = tickStatuses(before);
          setPlayer("you", after);
          if (totalDamage > 0) {
            popDamage("you", totalDamage, "hit");
            const parts: string[] = [];
            if (burnDamage > 0)
              parts.push(`Burn ${burnStacks} -> ${burnDamage} dmg`);
            if (igniteDamage > 0) parts.push("Ignite -> 1 dmg");
            upkeepLines.push(
              indentLog(
                `Upkeep: ${heroName} takes ${totalDamage} dmg (${parts.join(
                  ", "
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
              status: "burn",
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
          setPlayer("ai", after);
          if (totalDamage > 0) {
            popDamage("ai", totalDamage, "hit");
            const parts: string[] = [];
            if (burnDamage > 0)
              parts.push(`Burn ${burnStacks} -> ${burnDamage} dmg`);
            if (igniteDamage > 0) parts.push("Ignite -> 1 dmg");
            upkeepLines.push(
              indentLog(
                `Upkeep: ${heroName} takes ${totalDamage} dmg (${parts.join(
                  ", "
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
              status: "burn",
              stacks: after.tokens.burn,
            };
          }
        } else {
          continueBattle = false;
        }
      }

      patchState({ turn: next, phase: "upkeep" });
      dispatch({ type: "SET_PENDING_ATTACK", attack: null });
      patchAiPreview({ active: false, rolling: false });
      patchAiDefense({ inProgress: false, defenseRoll: null, evasiveRoll: null });
      resetRoll();

      if (!continueBattle) {
        dispatch({ type: "SET_PENDING_STATUS", status: null });
        statusResumeRef.current = null;
        return false;
      }

      if (next === "you") {
        const newRound = stateRef.current.round + 1;
        patchState({ round: newRound });
        pushLog(`--- Kolo ${newRound} ---`, { blankLineBefore: true });
        if (upkeepLines.length) {
          pushLog(upkeepLines);
        }
      } else if (next === "ai") {
        const lines = [aiHeader ?? "[AI] AI \u00FAto\u010D\u00ED:"];
        if (upkeepLines.length) lines.push(...upkeepLines);
        pushLog(lines, { blankLineBefore: true });
      } else if (upkeepLines.length) {
        pushLog(upkeepLines, { blankLineBefore: true });
      }

      if (statusPending && statusEntry) {
        dispatch({ type: "SET_PENDING_STATUS", status: statusEntry });
        statusResumeRef.current = afterReady ?? null;
      } else {
        dispatch({ type: "SET_PENDING_STATUS", status: null });
        statusResumeRef.current = null;
        window.setTimeout(() => patchState({ phase: "roll" }), 600);
        afterReady?.();
      }

      return true;
    },
    [
      dispatch,
      popDamage,
      pushLog,
      resetRoll,
      patchAiDefense,
      patchAiPreview,
      patchState,
      setPlayer,
      statusResumeRef,
    ]
  );

  return {
    tickAndStart,
  };
}
