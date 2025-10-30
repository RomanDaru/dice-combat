import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGame } from "./GameContext";
import type { GameState, InitialRollState } from "../game/state";
import type { OffensiveAbility, Phase, Side, Combo } from "../game/types";
import type { DefenseRollResult } from "../game/combat/types";

import { useCombatLog } from "../hooks/useCombatLog";
import { useDiceAnimator } from "../hooks/useDiceAnimator";
import { useAiDiceAnimator } from "../hooks/useAiDiceAnimator";
import { useAiController } from "../hooks/useAiController";
import { useStatusManager } from "../hooks/useStatusManager";
import { useDefenseActions } from "../hooks/useDefenseActions";
import { useGameFlow } from "../hooks/useTurnController";
import { useActiveAbilities } from "../hooks/useActiveAbilities";
import { useRollAnimator } from "../hooks/useRollAnimator";
import { useLatest } from "../hooks/useLatest";
import {
  bestAbility,
  detectCombos,
  rollDie,
  selectedAbilityForHero,
} from "../game/combos";
import type {
  ActiveAbility,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
} from "../game/types";
import { resolvePassTurn, type TurnEndResolution } from "../game/flow/turnEnd";

const DEF_DIE_INDEX = 2;
const ROLL_ANIM_MS = 1300;
const AI_ROLL_ANIM_MS = 900;
const AI_STEP_MS = 2000;
const AI_PASS_FOLLOW_UP_MS = 450;
const AI_PASS_EVENT_DELAY_MS = 600;

type PlayerDefenseState = {
  roll: DefenseRollResult;
  selectedCombo: Combo | null;
};

type ComputedData = {
  ability: OffensiveAbility | null;
  suggestedAbility: OffensiveAbility | null;
  selectedAttackCombo: Combo | null;
  readyForActing: ReturnType<typeof detectCombos>;
  readyForAI: ReturnType<typeof detectCombos>;
  isDefenseTurn: boolean;
  statusActive: boolean;
  showDcLogo: boolean;
  diceTrayVisible: boolean;
  defenseDieIndex: number;
  phase: Phase;
  initialRoll: InitialRollState;
  defenseRoll: DefenseRollResult | null;
  defenseSelection: Combo | null;
  awaitingDefenseSelection: boolean;
};

type ControllerContext = {
  attackChiSpend: number;
  defenseChiSpend: number;
  setAttackChiSpend: (value: number | ((prev: number) => number)) => void;
  setDefenseChiSpend: (value: number | ((prev: number) => number)) => void;
  turnChiAvailable: Record<Side, number>;
  consumeTurnChi: (side: Side, amount: number) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  onRoll: () => void;
  onToggleHold: (index: number) => void;
  onSelectAttackCombo: (combo: Combo | null) => void;
  openDiceTray: () => void;
  closeDiceTray: () => void;
  onEndTurnNoAttack: () => void;
  handleReset: () => void;
  startInitialRoll: () => void;
  confirmInitialRoll: () => void;
  performStatusClearRoll: (side: Side) => void;
  onConfirmAttack: () => void;
  onUserDefenseRoll: () => void;
  onUserEvasiveRoll: () => void;
  onChooseDefenseOption: (combo: Combo | null) => void;
  onConfirmDefense: () => void;
  activeAbilities: ActiveAbility[];
  onPerformActiveAbility: (abilityId: string) => boolean;
};

const GameDataContext = createContext<ComputedData | null>(null);
const GameControllerContext = createContext<ControllerContext | null>(null);

export const GameController = ({ children }: { children: ReactNode }) => {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const aiPlayRef = useRef<() => void>(() => {});
  const [attackChiSpend, setAttackChiSpend] = useState(0);
  const [defenseChiSpend, setDefenseChiSpend] = useState(0);
  const [turnChiAvailable, setTurnChiAvailable] = useState<
    Record<Side, number>
  >({
    you: state.players.you.tokens.chi ?? 0,
    ai: state.players.ai.tokens.chi ?? 0,
  });
  const [playerDefenseState, setPlayerDefenseState] =
    useState<PlayerDefenseState | null>(null);
  const [playerAttackSelection, setPlayerAttackSelection] =
    useState<Combo | null>(null);
  const [diceTrayVisible, setDiceTrayVisible] = useState(false);
  const openDiceTray = useCallback(() => setDiceTrayVisible(true), []);
  const closeDiceTray = useCallback(() => setDiceTrayVisible(false), []);

  const updateAttackChiSpend = useCallback(
    (value: number | ((prev: number) => number)) => {
      setAttackChiSpend((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: number) => number)(prev)
            : value;
        const maxTokens = latestState.current.players.you.tokens.chi ?? 0;
        const turnLimit = turnChiAvailable.you ?? 0;
        return Math.max(0, Math.min(next, maxTokens, turnLimit));
      });
    },
    [turnChiAvailable.you]
  );

  const updateDefenseChiSpend = useCallback(
    (value: number | ((prev: number) => number)) => {
      setDefenseChiSpend((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: number) => number)(prev)
            : value;
        const maxTokens = latestState.current.players.you.tokens.chi ?? 0;
        const turnLimit = turnChiAvailable.you ?? 0;
        return Math.max(0, Math.min(next, maxTokens, turnLimit));
      });
    },
    [turnChiAvailable.you]
  );

  useEffect(() => {
    setAttackChiSpend((prev) =>
      Math.min(prev, turnChiAvailable.you ?? 0)
    );
    setDefenseChiSpend((prev) =>
      Math.min(prev, turnChiAvailable.you ?? 0)
    );
  }, [turnChiAvailable.you]);

  const clearAttackChiSpend = useCallback(() => setAttackChiSpend(0), []);
  const clearDefenseChiSpend = useCallback(() => setDefenseChiSpend(0), []);

  const {
    players,
    turn,
    dice,
    held,
    rolling,
    rollsLeft,
    aiPreview,
    pendingAttack,
    pendingStatusClear,
  } = state;

  const setDice = useCallback(
    (value: number[] | ((prev: number[]) => number[])) => {
      const next =
        typeof value === "function"
          ? (value as (prev: number[]) => number[])(latestState.current.dice)
          : value;
      dispatch({ type: "SET_DICE", dice: next });
    },
    [dispatch]
  );

  const setHeld = useCallback(
    (value: boolean[] | ((prev: boolean[]) => boolean[])) => {
      const next =
        typeof value === "function"
          ? (value as (prev: boolean[]) => boolean[])(latestState.current.held)
          : value;
      dispatch({ type: "SET_HELD", held: next });
    },
    [dispatch]
  );

  const setRolling = useCallback(
    (value: boolean[]) => {
      dispatch({ type: "SET_ROLLING", rolling: value });
    },
    [dispatch]
  );

  const setRollsLeft = useCallback(
    (value: number | ((prev: number) => number)) => {
      const next =
        typeof value === "function"
          ? (value as (prev: number) => number)(latestState.current.rollsLeft)
          : value;
      dispatch({ type: "SET_ROLLS_LEFT", rollsLeft: next });
    },
    [dispatch]
  );

  const { animateRoll: animatePlayerRoll } = useRollAnimator({
    stateRef: latestState,
    setDice,
    setRolling,
    setRollsLeft,
    durationMs: ROLL_ANIM_MS,
  });

  const setFloatDamage = useCallback(
    (side: Side, value: GameState["fx"]["floatDamage"][Side]) => {
      dispatch({ type: "SET_FLOAT_DAMAGE", side, value });
    },
    [dispatch]
  );

  const setShake = useCallback(
    (side: Side, value: boolean) => {
      dispatch({ type: "SET_SHAKE", side, value });
    },
    [dispatch]
  );

  const popDamage = useCallback(
    (side: Side, amount: number, kind: "hit" | "reflect" = "hit") => {
      const payload = { val: amount, kind } as const;
      setFloatDamage(side, payload);
      if (kind === "hit") {
        setShake(side, true);
        window.setTimeout(() => setShake(side, false), 450);
      }
      window.setTimeout(() => setFloatDamage(side, null), 1300);
    },
    [setFloatDamage, setShake]
  );

  const {
    pushLog,
    logPlayerAttackStart,
    logPlayerNoCombo,
    logAiAttackRoll,
    logAiNoCombo,
  } = useCombatLog();

  const readyForActing = useMemo(() => detectCombos(dice), [dice]);
  const readyForAI = useMemo(
    () => detectCombos(aiPreview.dice),
    [aiPreview.dice]
  );
  const suggestedAbility = useMemo(
    () => bestAbility(players.you.hero, dice),
    [players.you.hero, dice]
  );
  const playerSelectedAbility = useMemo(
    () =>
      selectedAbilityForHero(players.you.hero, dice, playerAttackSelection),
    [dice, playerAttackSelection, players.you.hero]
  );
  const ability = useMemo(
    () =>
      turn === "you"
        ? playerSelectedAbility ?? suggestedAbility
        : suggestedAbility,
    [playerSelectedAbility, suggestedAbility, turn]
  );
  useEffect(() => {
    if (turn !== "you") {
      setPlayerAttackSelection(null);
      return;
    }
    if (
      playerAttackSelection &&
      !readyForActing[playerAttackSelection]
    ) {
      setPlayerAttackSelection(null);
    }
  }, [playerAttackSelection, readyForActing, turn]);
  useEffect(() => {
    if (state.phase !== "roll" || turn !== "you") {
      setDiceTrayVisible(false);
    }
  }, [state.phase, turn]);
  const isDefenseTurn = !!pendingAttack && pendingAttack.defender === "you";
  const initialRoll = state.initialRoll;
  const phase = state.phase;

  useEffect(() => {
    const currentChi =
      turn === "you"
        ? players.you.tokens.chi ?? 0
        : players.ai.tokens.chi ?? 0;
    setTurnChiAvailable((prev) => ({
      ...prev,
      [turn]: currentChi,
    }));
  }, [turn, players.you.tokens.chi, players.ai.tokens.chi]);

  const consumeTurnChi = useCallback((side: Side, amount: number) => {
    if (amount <= 0) return;
    setTurnChiAvailable((prev) => ({
      ...prev,
      [side]: Math.max(0, (prev[side] ?? 0) - amount),
    }));
  }, []);
  const statusActive = !!pendingStatusClear;
  const showDcLogo =
    turn === "you" && rollsLeft === 3 && !pendingAttack && !statusActive;

  const startInitialRoll = useCallback(() => {
    if (
      phase !== "standoff" ||
      initialRoll.inProgress ||
      initialRoll.awaitingConfirmation
    )
      return;
    dispatch({ type: "START_INITIAL_ROLL" });
    const youRoll = rollDie();
    const aiRoll = rollDie();
    const winner =
      youRoll === aiRoll ? null : youRoll > aiRoll ? ("you" as Side) : "ai";

    window.setTimeout(() => {
      dispatch({
        type: "RESOLVE_INITIAL_ROLL",
        payload: { you: youRoll, ai: aiRoll, winner },
      });
      const logEntry =
        winner === null
          ? `Initiative roll tie: You ${youRoll} vs AI ${aiRoll}. Roll again!`
          : `Initiative roll: You ${youRoll} vs AI ${aiRoll}. ${
              winner === "you" ? "You begin." : "AI begins."
            }`;
      pushLog(logEntry, { blankLineBefore: true });
    }, 350);
  }, [
    dispatch,
    initialRoll.awaitingConfirmation,
    initialRoll.inProgress,
    phase,
    pushLog,
  ]);

  const confirmInitialRoll = useCallback(() => {
    if (
      phase !== "standoff" ||
      initialRoll.inProgress ||
      !initialRoll.awaitingConfirmation ||
      !initialRoll.winner
    ) {
      return;
    }
    dispatch({ type: "CONFIRM_INITIAL_ROLL" });
  }, [dispatch, initialRoll, phase]);

  useEffect(() => {
    const maxChi = state.players.you.tokens.chi ?? 0;
    setAttackChiSpend((prev) => Math.min(prev, maxChi));
    setDefenseChiSpend((prev) => Math.min(prev, maxChi));
  }, [state.players.you.tokens.chi]);

  useEffect(() => {
    if (turn !== "you") {
      setAttackChiSpend(0);
    }
  }, [turn]);

  useEffect(() => {
    if (!isDefenseTurn) {
      setDefenseChiSpend(0);
    }
  }, [isDefenseTurn]);

  const {
    resetRoll,
    animateDefenseDie,
    animateDefenseRoll,
    restoreDiceAfterDefense,
  } = useDiceAnimator({ defenseDieIndex: DEF_DIE_INDEX });
  const { animatePreviewRoll } = useAiDiceAnimator({
    rollDurationMs: AI_ROLL_ANIM_MS,
  });
  const { send: sendFlowEvent, resumePendingStatus } = useGameFlow({
    resetRoll,
    pushLog,
    popDamage,
  });

  const applyTurnEndResolution = useCallback(
    (
      resolution: TurnEndResolution,
      logOptions?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
    ) => {
      if (resolution.logs.length) {
        pushLog(resolution.logs, logOptions);
      }
      resolution.events.forEach((event) => {
        const afterReady =
          event.followUp === "trigger_ai_turn"
            ? () => {
                window.setTimeout(() => {
                  const snapshot = latestState.current;
                  const aiState = snapshot.players.ai;
                  const youState = snapshot.players.you;
                  if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
                    return;
                  aiPlayRef.current();
                }, AI_PASS_FOLLOW_UP_MS);
              }
            : undefined;

        sendFlowEvent({
          type: event.type,
          next: event.payload.next,
          delayMs: event.payload.delayMs,
          prePhase: event.payload.prePhase,
          afterReady,
        });
      });
    },
    [latestState, pushLog, sendFlowEvent]
  );

  const { performStatusClearRoll } = useStatusManager({
    pushLog,
    animateDefenseDie,
    restoreDiceAfterDefense,
    sendFlowEvent,
    resumePendingStatus,
  });
  const { aiPlay } = useAiController({
    logAiNoCombo,
    logAiAttackRoll,
    animatePreviewRoll,
    sendFlowEvent,
    aiStepDelay: AI_STEP_MS,
    turnChiAvailable,
    consumeTurnChi,
    onAiNoCombo: () => {
      applyTurnEndResolution(
        resolvePassTurn({
          side: "ai",
          delayMs: AI_PASS_EVENT_DELAY_MS,
        })
      );
    },
  });

  useEffect(() => {
    aiPlayRef.current = aiPlay;
  }, [aiPlay]);
  const {
    onConfirmAttack,
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserEvasiveRoll,
  } = useDefenseActions({
    turn,
    rolling,
    ability,
    dice,
    you: players.you,
    pendingAttack,
    logPlayerNoCombo,
    logPlayerAttackStart,
    pushLog,
    animateDefenseDie,
    animateDefenseRoll,
    popDamage,
    restoreDiceAfterDefense,
    sendFlowEvent,
    aiPlay,
    aiStepDelay: AI_STEP_MS,
    attackChiSpend,
    defenseChiSpend,
    clearAttackChiSpend,
    clearDefenseChiSpend,
    turnChiAvailable,
    consumeTurnChi,
    playerDefenseState,
    setPlayerDefenseState,
    applyTurnEndResolution,
  });

  const handleAbilityControllerAction = useCallback(
    (
      action: NonNullable<ActiveAbilityOutcome["controllerAction"]>,
      _context: ActiveAbilityContext
    ) => {
      switch (action.type) {
        case "USE_EVASIVE":
          onUserEvasiveRoll();
          break;
        default:
          break;
      }
    },
    [onUserEvasiveRoll]
  );

  const { abilities: activeAbilities, performAbility: onPerformActiveAbility } =
    useActiveAbilities({
      side: "you",
      pushLog,
      popDamage,
      handleControllerAction: handleAbilityControllerAction,
    });


  const onRoll = useCallback(() => {
    if (turn !== "you" || rollsLeft <= 0 || statusActive || isDefenseTurn) {
      return;
    }
    openDiceTray();
    const mask = held.map((h) => !h);
    animatePlayerRoll(mask);
  }, [
    animatePlayerRoll,
    held,
    isDefenseTurn,
    openDiceTray,
    rollsLeft,
    statusActive,
    turn,
  ]);

  const onToggleHold = useCallback(
    (index: number) => {
      if (turn !== "you") return;
      setHeld((prev) =>
        prev.map((value, idx) => (idx === index ? !value : value))
      );
    },
    [setHeld, turn]
  );

  const onSelectAttackCombo = useCallback(
    (combo: Combo | null) => {
      if (turn !== "you" || statusActive || isDefenseTurn) return;
      setPlayerAttackSelection(combo);
    },
    [isDefenseTurn, statusActive, turn]
  );

  useEffect(() => {
    if (
      pendingStatusClear &&
      pendingStatusClear.side === "ai" &&
      !pendingStatusClear.roll &&
      !pendingStatusClear.rolling
    ) {
      const timer = window.setTimeout(() => performStatusClearRoll("ai"), 700);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [pendingStatusClear, performStatusClearRoll]);

  const onEndTurnNoAttack = useCallback(() => {
    if (turn !== "you" || rolling.some(Boolean)) return;
    const heroName = players.you.hero.name;
    const resolution = resolvePassTurn({
      side: "you",
      message: `[Turn] ${heroName} ends the turn.`,
    });
    applyTurnEndResolution(resolution, { blankLineBefore: true });
  }, [applyTurnEndResolution, players.you.hero.name, rolling, turn]);

  const handleReset = useCallback(() => {
    const current = latestState.current;
    dispatch({
      type: "RESET",
      payload: {
        youHero: current.players.you.hero,
        aiHero: current.players.ai.hero,
      },
    });
    resetRoll();
  }, [dispatch, resetRoll]);

  const initialStartRef = useRef(false);
  useEffect(() => {
    if (state.phase === "standoff") {
      initialStartRef.current = false;
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "roll" || turn !== "you") {
      closeDiceTray();
    }
  }, [state.phase, closeDiceTray, turn]);

  useEffect(() => {
    if (
      !initialStartRef.current &&
      state.phase === "upkeep" &&
      state.round === 0 &&
      !state.initialRoll.inProgress &&
      state.initialRoll.winner
    ) {
      initialStartRef.current = true;
      const startingSide = state.turn;
      window.setTimeout(() => {
        if (startingSide === "ai") {
          const cont = sendFlowEvent({
            type: "TURN_START",
            side: "ai",
            afterReady: () => {
              window.setTimeout(() => {
                const aiState = latestState.current.players.ai;
                const youState = latestState.current.players.you;
                if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
                  return;
                aiPlay();
              }, 450);
            },
          });
          if (!cont) return;
        } else {
          sendFlowEvent({ type: "TURN_START", side: "you" });
        }
      }, 0);
    }
  }, [
    aiPlay,
    sendFlowEvent,
    state.initialRoll.inProgress,
    state.initialRoll.winner,
    state.phase,
    state.round,
    state.turn,
  ]);

  const dataValue: ComputedData = useMemo(
    () => ({
      ability,
      suggestedAbility,
      selectedAttackCombo: playerAttackSelection,
      readyForActing,
      readyForAI,
      isDefenseTurn,
      statusActive,
      showDcLogo,
      diceTrayVisible,
      defenseDieIndex: isDefenseTurn ? -1 : DEF_DIE_INDEX,
      phase,
      initialRoll,
      defenseRoll: playerDefenseState?.roll ?? null,
      defenseSelection: playerDefenseState?.selectedCombo ?? null,
      awaitingDefenseSelection: !!playerDefenseState,
    }),
    [
      ability,
      suggestedAbility,
      playerAttackSelection,
      readyForActing,
      readyForAI,
      isDefenseTurn,
      statusActive,
      showDcLogo,
      diceTrayVisible,
      phase,
      initialRoll,
      playerDefenseState,
    ]
  );

  const controllerValue: ControllerContext = useMemo(
    () => ({
      attackChiSpend,
      defenseChiSpend,
      setAttackChiSpend: updateAttackChiSpend,
      setDefenseChiSpend: updateDefenseChiSpend,
      turnChiAvailable,
      consumeTurnChi,
      popDamage,
      onRoll,
      onToggleHold,
      onSelectAttackCombo,
      openDiceTray,
      closeDiceTray,
      onEndTurnNoAttack,
      handleReset,
      startInitialRoll,
      confirmInitialRoll,
      performStatusClearRoll,
      onConfirmAttack,
      onUserDefenseRoll,
      onChooseDefenseOption,
      onConfirmDefense,
      onUserEvasiveRoll,
      activeAbilities,
      onPerformActiveAbility,
    }),
    [
      attackChiSpend,
      defenseChiSpend,
      activeAbilities,
      updateAttackChiSpend,
      updateDefenseChiSpend,
      handleReset,
      onConfirmAttack,
      onEndTurnNoAttack,
      onPerformActiveAbility,
      onRoll,
      onToggleHold,
      onSelectAttackCombo,
      openDiceTray,
      closeDiceTray,
      turnChiAvailable,
      consumeTurnChi,
      onUserDefenseRoll,
      onChooseDefenseOption,
      onConfirmDefense,
      onUserEvasiveRoll,
      performStatusClearRoll,
      popDamage,
      startInitialRoll,
      confirmInitialRoll,
    ]
  );

  return (
    <GameDataContext.Provider value={dataValue}>
      <GameControllerContext.Provider value={controllerValue}>
        {children}
      </GameControllerContext.Provider>
    </GameDataContext.Provider>
  );
};

export const useGameData = () => {
  const context = useContext(GameDataContext);
  if (!context) {
    throw new Error("useGameData must be used within a GameController");
  }
  return context;
};

export const useGameController = () => {
  const context = useContext(GameControllerContext);
  if (!context) {
    throw new Error("useGameController must be used within a GameController");
  }
  return context;
};

export { DEF_DIE_INDEX };


