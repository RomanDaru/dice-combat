import type { GameState, PendingStatusClear } from "./state";
import type { Side, PlayerState } from "./types";
import type { StatusId } from "../engine/status";
import { getStatus, tickStatuses } from "../engine/status";

export type PendingStatusEntry = {
  side: Side;
  status: StatusId;
  stacks: number;
  action?: "cleanse" | "transfer";
  sourceStatus?: StatusId;
  targetSide?: Side;
  transferStacks?: number;
  consumeStacks?: number;
  rollThreshold?: number;
  dieSize?: number;
  successLog?: string;
  failureLog?: string;
};

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

const pickTransferTargetStatus = (
  tokens: PlayerState["tokens"],
  config: NonNullable<ReturnType<typeof getStatus>["transfer"]>
): { id: StatusId; stacks: number } | null => {
  const candidates = Object.entries(tokens)
    .map(([id, stacks]) => ({ id: id as StatusId, stacks }))
    .filter((entry) => entry.stacks > 0)
    .map((entry) => {
      const def = getStatus(entry.id);
      return def ? { ...entry, def } : null;
    })
    .filter((entry): entry is { id: StatusId; stacks: number; def: ReturnType<typeof getStatus> } =>
      Boolean(entry)
    )
    .filter((entry) => {
      if (entry.def?.polarity !== config.targetPolarity) return false;
      if (config.allowedStatuses && !config.allowedStatuses.includes(entry.id)) {
        return false;
      }
      if (entry.def?.attachment?.transferable === false) return false;
      return true;
    })
    .sort((a, b) => b.stacks - a.stacks);

  if (!candidates.length) {
    return null;
  }
  return { id: candidates[0].id, stacks: candidates[0].stacks };
};

const buildTransferPrompt = (
  owner: PlayerState,
  ownerSide: Side,
  opponent: PlayerState | undefined,
  opponentSide: Side
): PendingStatusEntry | null => {
  if (!opponent) return null;
  const tokens = owner.tokens ?? {};
  for (const [rawId, stacks] of Object.entries(tokens)) {
    if ((stacks ?? 0) <= 0) continue;
    const sourceId = rawId as StatusId;
    const sourceDef = getStatus(sourceId);
    const transferConfig = sourceDef?.transfer;
    if (!transferConfig) continue;
    const window = transferConfig.window ?? "upkeep";
    if (window !== "upkeep") continue;
    const consumeStacks = transferConfig.consumeStacks ?? 1;
    if ((stacks ?? 0) < consumeStacks) continue;
    const targetStatus = pickTransferTargetStatus(tokens, transferConfig);
    if (!targetStatus) continue;
    const targetSide =
      transferConfig.target === "self" ? ownerSide : opponentSide;
    return {
      side: ownerSide,
      status: targetStatus.id,
      stacks: targetStatus.stacks,
      action: transferConfig.mode ?? "transfer",
      sourceStatus: sourceId,
      targetSide,
      transferStacks: transferConfig.transferStacks ?? 1,
      consumeStacks,
      rollThreshold: transferConfig.rollThreshold,
      dieSize: transferConfig.dieSize ?? 6,
      successLog: transferConfig.successLog,
      failureLog: transferConfig.failureLog,
    };
  }
  return null;
};

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
  let pendingStatus: PendingStatusEntry | null = prompt
    ? { side, status: prompt.id, stacks: prompt.stacks }
    : null;

  if (!pendingStatus) {
    const transferPrompt = buildTransferPrompt(after, side, opponent, opponentSide);
    if (transferPrompt) {
      pendingStatus = transferPrompt;
    }
  }

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
