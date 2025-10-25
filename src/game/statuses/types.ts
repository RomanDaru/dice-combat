import type { PlayerState } from "../types";

export type StatusId = "burn";

export type StatusTickResult = {
  player: PlayerState;
  damage: number;
  logDetail?: string;
  promptStacks?: number;
};

export type StatusPrompt = {
  id: StatusId;
  stacks: number;
};

export type StatusCleanseRollResult = {
  updated: PlayerState;
  success: boolean;
  logLine: string;
};

export type StatusCleanseRoll = {
  type: "roll";
  threshold: number;
  animationDuration?: number;
  resolve: (player: PlayerState, roll: number) => StatusCleanseRollResult;
};

export type StatusDefinition = {
  id: StatusId;
  label: string;
  tick: (player: PlayerState) => StatusTickResult;
  cleanse?: StatusCleanseRoll;
};
