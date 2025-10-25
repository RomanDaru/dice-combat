import { Ability } from "./types";
import { HEROES } from "./heroes";
import { Hero, Phase, PlayerState, Side } from "./types";
import { Tokens } from "./types";

type FloatDamage = { val: number; kind: "hit" | "reflect" };

export type PendingAttack = {
  attacker: Side;
  defender: Side;
  dice: number[];
  ability: Ability;
};

export type PendingStatusClear = {
  side: Side;
  status: "burn";
  stacks: number;
  rolling?: boolean;
  roll?: number;
  success?: boolean;
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
  evasiveRoll: number | null;
};

export type FxState = {
  floatDamage: Record<Side, FloatDamage | null>;
  shake: Record<Side, boolean>;
};

const EMPTY_TOKENS: Tokens = { burn: 0, ignite: 0, chi: 0, evasive: 0 };

export type GameState = {
  players: Record<Side, PlayerState>;
  turn: Side;
  phase: Phase;
  round: number;
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
  aiHero: Hero = HEROES["Shadow Monk"]
): GameState {
  const youPlayer = createPlayer(youHero);
  const aiPlayer = createPlayer(aiHero);
  const startMessage = `Start of battle. (${youPlayer.hero.name} HP: ${youPlayer.hp}/${youPlayer.hero.maxHp}, ${aiPlayer.hero.name} HP: ${aiPlayer.hp}/${aiPlayer.hero.maxHp})`;
  return {
    players: {
      you: youPlayer,
      ai: aiPlayer,
    },
    turn: "you",
    phase: "upkeep",
    round: 0,
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
      evasiveRoll: null,
    },
    pendingAttack: null,
    pendingStatusClear: null,
    savedDefenseDice: null,
    fx: {
      floatDamage: { you: null, ai: null },
      shake: { you: false, ai: false },
    },
  };
}

export type GameAction =
  | {
      type: "RESET";
      payload: { youHero: Hero; aiHero: Hero };
    }
  | { type: "PATCH_STATE"; payload: Partial<GameState> }
  | { type: "PUSH_LOG"; entry: string }
  | {
      type: "SET_PLAYER";
      side: Side;
      player: PlayerState;
    }
  | {
      type: "SET_PLAYERS";
      players: Record<Side, PlayerState>;
    }
  | {
    type: "PATCH_AI_PREVIEW";
    payload: Partial<AiPreviewState>;
  }
  | {
      type: "PATCH_AI_DEFENSE";
      payload: Partial<AiDefenseState>;
    }
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
    };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "RESET":
      return createInitialState(action.payload.youHero, action.payload.aiHero);
    case "PATCH_STATE":
      return { ...state, ...action.payload };
    case "PUSH_LOG": {
      const next = [...state.log, { t: action.entry }];
      return {
        ...state,
        log: next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next,
      };
    }
    case "SET_PLAYER":
      return {
        ...state,
        players: { ...state.players, [action.side]: action.player },
      };
    case "SET_PLAYERS":
      return {
        ...state,
        players: action.players,
      };
    case "PATCH_AI_PREVIEW":
      return {
        ...state,
        aiPreview: { ...state.aiPreview, ...action.payload },
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
    default:
      return state;
  }
}

export type GameDispatch = (action: GameAction) => void;
