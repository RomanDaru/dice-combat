import type { GameState } from "../state";
import type { Side } from "../types";
import type { CombatEvent } from "../combat/types";

export type TurnEndResolution = {
  logs: string[];
  events: CombatEvent[];
  nextSide: Side;
  nextPhase: GameState["phase"];
};

type ResolvePassTurnOptions = {
  side: Side;
  prePhase?: GameState["phase"];
  durationMs?: number;
  message?: string | null;
};

const otherSide = (side: Side): Side => (side === "you" ? "ai" : "you");

export const TURN_TRANSITION_DELAY_MS = 1200;

export function resolvePassTurn({
  side,
  prePhase = "turnTransition",
  durationMs = TURN_TRANSITION_DELAY_MS,
  message = null,
}: ResolvePassTurnOptions): TurnEndResolution {
  const nextSide = otherSide(side);

  return {
    logs: message ? [message] : [],
    events: [
      {
        type: "TURN_END",
        payload: {
          next: nextSide,
          durationMs,
          prePhase,
        },
        followUp: nextSide === "ai" ? "trigger_ai_turn" : undefined,
      },
    ],
    nextSide,
    nextPhase: prePhase,
  };
}
