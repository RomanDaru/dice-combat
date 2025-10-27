import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import type { GameState } from "../game/state";
import type { Side } from "../game/types";
import type { PlayerState } from "../game/types";
import { tickAllStatuses } from "../game/statuses";
import type { StatusId } from "../game/statuses";
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

type PendingStatusEntry = { side: Side; status: StatusId; stacks: number };

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
      const {
        player: after,
        totalDamage,
        logParts,
        prompts,
      } = tickAllStatuses(before);

      setPlayer(side, after);

      const lines: string[] = [];
      if (totalDamage > 0) {
        popDamage(side, totalDamage, "hit");
        const detail =
          logParts.length > 0 ? ` (${logParts.join(", ")})` : "";
        lines.push(
          indentLog(
            `Upkeep: ${heroName} takes ${totalDamage} dmg${detail}. HP: ${after.hp}/${after.hero.maxHp}.`
          )
        );
      }

      if (after.hp <= 0) {
        pushLog(`${heroName} fell to status damage.`);
        return {
          continueBattle: false,
          header: side === "ai" ? `[AI] ${heroName} attacks:` : null,
          lines,
          pendingStatus: null,
        };
      }

      const opponent = stateRef.current.players[opponentSide];
      if (!opponent || opponent.hp <= 0) {
        return {
          continueBattle: false,
          header: side === "ai" ? `[AI] ${heroName} attacks:` : null,
          lines,
          pendingStatus: null,
        };
      }

      const prompt = prompts[0];
      const pendingStatus: PendingStatusEntry | null = prompt
        ? { side, status: prompt.id, stacks: prompt.stacks }
        : null;

      return {
        continueBattle: true,
        header: side === "ai" ? `[AI] ${heroName} attacks:` : null,
        lines,
        pendingStatus,
      };
    },
    [popDamage, pushLog, setPlayer]
  );

  const tickAndStart = useCallback(
    (next: Side, afterReady?: () => void): boolean => {
      const prevTurn = stateRef.current.turn;
      const { continueBattle, header, lines, pendingStatus } =
        runUpkeepFor(next);

      dispatch({ type: "SET_TURN", turn: next });
      dispatch({ type: "SET_PHASE", phase: "upkeep" });
      stateRef.current = {
        ...stateRef.current,
        turn: next,
        phase: "upkeep",
      };
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
        const currentRound = stateRef.current.round;
        const logLength = stateRef.current.log?.length ?? 0;
        let newRound = currentRound;
        let shouldLogRound = false;

        if (currentRound <= 0) {
          newRound = 1;
          shouldLogRound = true;
        } else if (prevTurn !== "you") {
          newRound = currentRound + 1;
          shouldLogRound = true;
        }

        if (shouldLogRound) {
          const shouldAddGap = currentRound > 0 || logLength > 1;
          dispatch({ type: "SET_ROUND", round: newRound });
          stateRef.current = {
            ...stateRef.current,
            round: newRound,
          };
          pushLog(`--- Kolo ${newRound} ---`, {
            blankLineBefore: shouldAddGap,
          });
        }

        if (lines.length) {
          pushLog(lines, {
            blankLineBefore: !shouldLogRound && (currentRound > 0 || logLength > 1),
          });
        }
      } else if (next === "ai") {
        const payload = lines.length
          ? [header ?? "[AI] AI attacks:", ...lines]
          : [header ?? "[AI] AI attacks:"];
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
        window.setTimeout(() => {
          dispatch({ type: "SET_PHASE", phase: "roll" });
          stateRef.current = { ...stateRef.current, phase: "roll" };
        }, 600);
        afterReady?.();
      }

      return true;
    },
    [
      dispatch,
      patchAiDefense,
      patchAiPreview,
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
