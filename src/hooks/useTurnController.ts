import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import type { GameState } from "../game/state";
import type { Side } from "../game/types";
import type { PlayerState } from "../game/types";
import { getBurnDamage, tickStatuses } from "../game/defense";
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

type PendingStatusEntry = { side: Side; status: "burn"; stacks: number };

type UpkeepOutcome = {
  continueBattle: boolean;
  header: string | null;
  lines: string[];
  pendingStatus: PendingStatusEntry | null;
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
      stateRef.current = {
        ...stateRef.current,
        players: { ...stateRef.current.players, [side]: player },
      };
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

  const runUpkeepFor = useCallback(
    (side: Side): UpkeepOutcome => {
      const opponentSide: Side = side === "you" ? "ai" : "you";
      const before = stateRef.current.players[side];

      if (!before) {
        return {
          continueBattle: false,
          header: null,
          lines: [],
          pendingStatus: null,
        };
      }

      const heroName = before.hero.name;
      const burnStacks = before.tokens.burn;
      const burnDamage = getBurnDamage(burnStacks);

      const after = tickStatuses(before);
      setPlayer(side, after);

      const lines: string[] = [];
      if (burnDamage > 0) {
        popDamage(side, burnDamage, "hit");
        lines.push(
          indentLog(
            `Upkeep: ${heroName} takes ${burnDamage} dmg (Burn ${burnStacks} -> ${burnDamage} dmg). HP: ${after.hp}/${after.hero.maxHp}.`
          )
        );
      }

      if (after.hp <= 0) {
        pushLog(`${heroName} fell to status damage.`);
        return {
          continueBattle: false,
          header: side === "ai" ? `[AI] ${heroName} útočí:` : null,
          lines,
          pendingStatus: null,
        };
      }

      const opponent = stateRef.current.players[opponentSide];
      if (!opponent || opponent.hp <= 0) {
        return {
          continueBattle: false,
          header: side === "ai" ? `[AI] ${heroName} útočí:` : null,
          lines,
          pendingStatus: null,
        };
      }

      const pendingStatus =
        burnDamage > 0 && after.tokens.burn > 0
          ? { side, status: "burn", stacks: after.tokens.burn }
          : null;

      return {
        continueBattle: true,
        header: side === "ai" ? `[AI] ${heroName} útočí:` : null,
        lines,
        pendingStatus,
      };
    },
    [popDamage, pushLog, setPlayer]
  );

  const tickAndStart = useCallback(
    (next: Side, afterReady?: () => void): boolean => {
      const { continueBattle, header, lines, pendingStatus } =
        runUpkeepFor(next);

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
        if (lines.length) {
          pushLog(lines);
        }
      } else if (next === "ai") {
        const payload = lines.length
          ? [header ?? "[AI] AI útočí:", ...lines]
          : [header ?? "[AI] AI útočí:"];
        pushLog(payload, { blankLineBefore: true });
      } else if (lines.length) {
        pushLog(lines, { blankLineBefore: true });
      }

      if (pendingStatus) {
        dispatch({ type: "SET_PENDING_STATUS", status: pendingStatus });
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
      patchAiDefense,
      patchAiPreview,
      patchState,
      resetRoll,
      runUpkeepFor,
      statusResumeRef,
      pushLog,
    ]
  );

  return {
    tickAndStart,
  };
}
