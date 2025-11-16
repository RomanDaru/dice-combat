import type { StatusId } from "../engine/status";
import type { StatusSpendSummary } from "../engine/status";
import { HEROES } from "./heroes";
import {
  Hero,
  Phase,
  PlayerState,
  Side,
  OffensiveAbility,
  Tokens,
  Combo,
  PendingDefenseBuff,
} from "./types";
import { normalizeSeed } from "../engine/rng";
import { defenseDebugLog } from "../utils/debug";
import { setPlayerSnapshot, setPlayerSnapshots } from "../context/playerSnapshot";

type FloatDamage = { val: number; kind: "hit" | "reflect" };

export type InitialRollState = {
  you: number | null;
  ai: number | null;
  inProgress: boolean;
  winner: Side | null;
  tie: boolean;
  awaitingConfirmation: boolean;
};

export type PendingAttack = {
  attacker: Side;
  defender: Side;
  dice: number[];
  ability: OffensiveAbility;
  baseDamage: number;
  modifiers?: {
    statusSpends?: StatusSpendSummary[];
  };
};

export type PendingStatusClearAction = "cleanse" | "transfer";

export type PendingStatusClear = {
  side: Side;
  status: StatusId;
  stacks: number;
  rolling?: boolean;
  roll?: number;
  success?: boolean;
  action?: PendingStatusClearAction;
  sourceStatus?: StatusId;
  targetSide?: Side;
  transferStacks?: number;
  consumeStacks?: number;
  rollThreshold?: number;
  dieSize?: number;
  successLog?: string;
  failureLog?: string;
} | null;

export type AiPreviewState = {
  active: boolean;
  rolling: boolean;
  dice: number[];
  held: boolean[];
};

export type AiDefenseState = {
  inProgress: boolean;
  defenseRoll: number | null;
  defenseDice: number[] | null;
  defenseCombo: Combo | null;
  evasiveRoll: number | null;
};

export type FxState = {
  floatDamage: Record<Side, FloatDamage | null>;
  shake: Record<Side, boolean>;
};

const EMPTY_TOKENS: Tokens = {};

export type GameState = {
  players: Record<Side, PlayerState>;
  turn: Side;
  phase: Phase;
  round: number;
  rngSeed: number;
  dice: number[];
  held: boolean[];
  rolling: boolean[];
  rollsLeft: number;
  log: { t: string }[];
  aiPreview: AiPreviewState;
  aiDefense: AiDefenseState;
  pendingAttack: PendingAttack | null;
  pendingStatusClear: PendingStatusClear;
  savedDefenseDice: number[] | null;
  fx: FxState;
  initialRoll: InitialRollState;
  pendingDefenseBuffs: PendingDefenseBuff[];
};

const MAX_LOG = 80;

function cloneTokens(tokens: Tokens): Tokens {
  return { ...tokens };
}

function createPlayer(hero: Hero): PlayerState {
  return {
    hero,
    hp: hero.maxHp,
    tokens: cloneTokens(EMPTY_TOKENS),
  };
}

export function createInitialState(
  youHero: Hero = HEROES.Pyromancer,
  aiHero: Hero = HEROES["Shadow Monk"],
  seed: number = Date.now()
): GameState {
  const rngSeed = normalizeSeed(seed);
  const youPlayer = createPlayer(youHero);
  const aiPlayer = createPlayer(aiHero);
  const startMessage = `Start of battle. (${youPlayer.hero.name} HP: ${youPlayer.hp}/${youPlayer.hero.maxHp}, ${aiPlayer.hero.name} HP: ${aiPlayer.hp}/${aiPlayer.hero.maxHp})`;
  setPlayerSnapshots({ you: youPlayer, ai: aiPlayer });
  return {
    players: {
      you: youPlayer,
      ai: aiPlayer,
    },
    turn: "you",
    phase: "standoff",
    round: 0,
    rngSeed,
    dice: [2, 2, 3, 4, 6],
    held: [false, false, false, false, false],
    rolling: [false, false, false, false, false],
    rollsLeft: 3,
    log: [{ t: startMessage }],
    aiPreview: {
      active: false,
      rolling: false,
      dice: [1, 1, 1, 1, 1],
      held: [false, false, false, false, false],
    },
    aiDefense: {
      inProgress: false,
      defenseRoll: null,
      defenseDice: null,
      defenseCombo: null,
      evasiveRoll: null,
    },
    pendingAttack: null,
    pendingStatusClear: null,
    savedDefenseDice: null,
    fx: {
      floatDamage: { you: null, ai: null },
      shake: { you: false, ai: false },
    },
    initialRoll: {
      you: null,
      ai: null,
      inProgress: false,
      winner: null,
      tie: false,
      awaitingConfirmation: false,
    },
    pendingDefenseBuffs: [],
  };
  setPlayerSnapshots({ you: youPlayer, ai: aiPlayer });
  return {
    players: {
      you: youPlayer,
      ai: aiPlayer,
    },
}

export type GameAction =
  | {
      type: "RESET";
      payload: { youHero: Hero; aiHero: Hero; seed?: number };
    }
  | { type: "SET_PHASE"; phase: Phase }
  | { type: "SET_TURN"; turn: Side }
  | { type: "SET_ROUND"; round: number }
  | { type: "SET_DICE"; dice: number[] }
  | { type: "SET_HELD"; held: boolean[] }
  | { type: "SET_ROLLING"; rolling: boolean[] }
  | { type: "SET_ROLLS_LEFT"; rollsLeft: number }
  | { type: "PUSH_LOG"; entry: string }
  | {
      type: "SET_PLAYER";
      side: Side;
      player: PlayerState;
      meta?: string | null;
    }
  | {
      type: "SET_PLAYERS";
      players: Record<Side, PlayerState>;
    }
  | { type: "PATCH_AI_PREVIEW"; payload: Partial<AiPreviewState> }
  | { type: "SET_AI_PREVIEW_DICE"; dice: number[] }
  | { type: "SET_AI_PREVIEW_ROLLING"; rolling: boolean }
  | { type: "SET_AI_PREVIEW_HELD"; held: boolean[] }
  | { type: "PATCH_AI_DEFENSE"; payload: Partial<AiDefenseState> }
  | {
      type: "SET_PENDING_ATTACK";
      attack: PendingAttack | null;
    }
  | {
      type: "SET_PENDING_STATUS";
      status: PendingStatusClear;
    }
  | {
      type: "SET_SAVED_DEFENSE_DICE";
      dice: number[] | null;
    }
  | {
      type: "SET_FLOAT_DAMAGE";
      side: Side;
      value: FloatDamage | null;
    }
  | {
      type: "SET_SHAKE";
      side: Side;
      value: boolean;
    }
  | { type: "START_INITIAL_ROLL" }
  | {
      type: "RESOLVE_INITIAL_ROLL";
      payload: { you: number; ai: number; winner: Side | null };
    }
  | { type: "CONFIRM_INITIAL_ROLL" }
  | {
      type: "SET_PENDING_DEFENSE_BUFFS";
      buffs: PendingDefenseBuff[];
    };
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "RESET": {
      const nextState = createInitialState(
        action.payload.youHero,
        action.payload.aiHero,
        action.payload.seed
      );
      return nextState;
    }
    case "SET_PHASE":
      return { ...state, phase: action.phase };
    case "SET_TURN":
      return { ...state, turn: action.turn };
    case "SET_ROUND":
      return { ...state, round: action.round };
    case "SET_DICE":
      return { ...state, dice: action.dice };
    case "SET_HELD":
      return { ...state, held: action.held };
    case "SET_ROLLING":
      return { ...state, rolling: action.rolling };
    case "SET_ROLLS_LEFT":
      return { ...state, rollsLeft: action.rollsLeft };
    case "PUSH_LOG": {
      const next = [...state.log, { t: action.entry }];
      return {
        ...state,
        log: next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next,
      };
    }
    case "SET_PLAYER": {
      setPlayerSnapshot(action.side, action.player);
      if (import.meta.env?.DEV) {
        const before = state.players[action.side];
        defenseDebugLog("reducer:setPlayer", {
          side: action.side,
          source: action.meta ?? null,
          hpBefore: before?.hp ?? null,
          hpAfter: action.player.hp,
          tokensBefore: before?.tokens ?? null,
          tokensAfter: action.player.tokens,
        });
      }
      return {
        ...state,
        players: { ...state.players, [action.side]: action.player },
      };
    }
    case "SET_PLAYERS":
      setPlayerSnapshots(action.players);
      return {
        ...state,
        players: action.players,
      };
    case "PATCH_AI_PREVIEW":
      return {
        ...state,
        aiPreview: { ...state.aiPreview, ...action.payload },
      };
    case "SET_AI_PREVIEW_DICE":
      return {
        ...state,
        aiPreview: { ...state.aiPreview, dice: action.dice },
      };
    case "SET_AI_PREVIEW_ROLLING":
      return {
        ...state,
        aiPreview: { ...state.aiPreview, rolling: action.rolling },
      };
    case "SET_AI_PREVIEW_HELD":
      return {
        ...state,
        aiPreview: { ...state.aiPreview, held: action.held },
      };
    case "PATCH_AI_DEFENSE":
      return {
        ...state,
        aiDefense: { ...state.aiDefense, ...action.payload },
      };
    case "SET_PENDING_ATTACK":
      return {
        ...state,
        pendingAttack: action.attack,
      };
    case "SET_PENDING_STATUS":
      return {
        ...state,
        pendingStatusClear: action.status,
      };
    case "SET_SAVED_DEFENSE_DICE":
      return {
        ...state,
        savedDefenseDice: action.dice,
      };
    case "SET_FLOAT_DAMAGE":
      return {
        ...state,
        fx: {
          ...state.fx,
          floatDamage: { ...state.fx.floatDamage, [action.side]: action.value },
        },
      };
    case "SET_SHAKE":
      return {
        ...state,
        fx: {
          ...state.fx,
          shake: { ...state.fx.shake, [action.side]: action.value },
        },
      };
    case "START_INITIAL_ROLL":
      return {
        ...state,
        initialRoll: {
          you: null,
          ai: null,
          winner: null,
          inProgress: true,
          tie: false,
          awaitingConfirmation: false,
        },
      };
    case "RESOLVE_INITIAL_ROLL": {
      const tie = action.payload.you === action.payload.ai;
      return {
        ...state,
        turn: tie ? state.turn : action.payload.winner ?? state.turn,
        initialRoll: {
          you: action.payload.you,
          ai: action.payload.ai,
          winner: tie ? null : action.payload.winner,
          inProgress: false,
          tie,
          awaitingConfirmation: tie ? false : !!action.payload.winner,
        },
      };
    }
    case "CONFIRM_INITIAL_ROLL":
      if (!state.initialRoll.winner) {
        return state;
      }
      return {
        ...state,
        phase: "upkeep",
        initialRoll: {
          ...state.initialRoll,
          awaitingConfirmation: false,
        },
      };
    case "SET_PENDING_DEFENSE_BUFFS":
      return {
        ...state,
        pendingDefenseBuffs: action.buffs,
      };
    default:
      return state;
  }
}

export type GameDispatch = (action: GameAction) => void;


