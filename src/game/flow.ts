import type { GameState, PendingStatusClear } from "./state";
import type { Side, PlayerState } from "./types";
import type { StatusId } from "./statuses";
import { tickAllStatuses } from "./statuses";

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
  const { player: after, totalDamage, logParts, prompts } = tickAllStatuses(
    before
  );

  const logLines: string[] = [];
  if (totalDamage > 0) {
    const detail = logParts.length > 0 ? ` (${logParts.join(", ")})` : "";
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
