import type { GameState, PendingStatusClear } from "./state";
import type { Side, PlayerState } from "./types";
import type { StatusId } from "../engine/status";
import { tickStatuses } from "../engine/status";

export type PendingStatusEntry = { side: Side; status: StatusId; stacks: number };

export type TurnStartComputation = {
  updatedPlayer: PlayerState;
  statusDamage: number;
  logLines: string[];
  extraLogs: string[];
  pendingStatus: PendingStatusEntry | null;
  header: string | null;
  continueBattle: boolean;
};

const indent = (value: string) => ` > ${value}`;

export function resolveTurnStart(
  state: GameState,
  side: Side
): TurnStartComputation {
  const opponentSide: Side = side === "you" ? "ai" : "you";
  const before = state.players[side];
  if (!before) {
    throw new Error(`resolveTurnStart: missing player for side ${side}`);
  }

  const heroName = before.hero.name;
  const {
    next: nextStacks,
    totalDamage,
    logs: tickLogs,
    prompts,
  } = tickStatuses(before.tokens ?? {});

  const after: PlayerState = {
    ...before,
    tokens: nextStacks,
    hp: Math.max(0, before.hp - totalDamage),
  };

  const logLines: string[] = [];
  if (totalDamage > 0) {
    const detail = tickLogs.length > 0 ? ` (${tickLogs.join(", ")})` : "";
    logLines.push(
      indent(
        `Upkeep: ${heroName} takes ${totalDamage} dmg${detail}. HP: ${after.hp}/${after.hero.maxHp}.`
      )
    );
  }

  const extraLogs: string[] = [];
  let continueBattle = true;

  if (after.hp <= 0) {
    continueBattle = false;
    extraLogs.push(`${heroName} fell to status damage.`);
  }

  const opponent = state.players[opponentSide];
  if (!opponent || opponent.hp <= 0) {
    continueBattle = false;
  }

  const prompt = prompts[0];
  const pendingStatus: PendingStatusEntry | null = prompt
    ? { side, status: prompt.id, stacks: prompt.stacks }
    : null;

  const header = side === "ai" ? `[AI] ${heroName} attacks:` : null;

  return {
    updatedPlayer: after,
    statusDamage: totalDamage,
    logLines,
    extraLogs,
    pendingStatus,
    header,
    continueBattle,
  };
}
