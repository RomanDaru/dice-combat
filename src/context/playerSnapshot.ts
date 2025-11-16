import type { PlayerState, Side } from "../game/types";

const snapshotStore: Record<Side, PlayerState | null> = {
  you: null,
  ai: null,
};

export const setPlayerSnapshot = (side: Side, player: PlayerState) => {
  snapshotStore[side] = player;
};

export const setPlayerSnapshots = (players: Record<Side, PlayerState>) => {
  snapshotStore.you = players.you;
  snapshotStore.ai = players.ai;
};

export const getPlayerSnapshot = (side: Side): PlayerState | null =>
  snapshotStore[side];

