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
import type {
  BaseDefenseResolution,
  CombatEvent,
  DefenseRollResult,
} from "../game/combat/types";
import { getStatus, getStacks, type StatusId } from "../engine/status";

import { useCombatLog } from "../hooks/useCombatLog";
import { useDiceAnimator } from "../hooks/useDiceAnimator";
import { useAiDiceAnimator } from "../hooks/useAiDiceAnimator";
import { useAiController } from "../hooks/useAiController";
import { useStatusManager } from "../hooks/useStatusManager";
import { useDefenseActions } from "../hooks/useDefenseActions";
import {
  useGameFlow,
  type ActiveTransition,
  type ActiveCue,
} from "../hooks/useTurnController";
import { useActiveAbilities } from "../hooks/useActiveAbilities";
import { useRollAnimator } from "../hooks/useRollAnimator";
import { useLatest } from "../hooks/useLatest";
import {
  bestAbility,
  detectCombos,
  rollDie,
  selectedAbilityForHero,
} from "../game/combos";
import { makeRng } from "../engine/rng";
import type { Rng } from "../engine/rng";
import type {
  ActiveAbility,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
} from "../game/types";
import {
  resolvePassTurn,
  TURN_TRANSITION_DELAY_MS,
  type TurnEndResolution,
} from "../game/flow/turnEnd";
import { getAbilityIcon } from "../assets/abilityIconMap";
import { getCueDuration } from "../config/cueDurations";

const DEF_DIE_INDEX = 2;
const ROLL_ANIM_MS = 1300;
const AI_ROLL_ANIM_MS = 900;
const AI_STEP_MS = 2000;
const AI_PASS_FOLLOW_UP_MS = 450;
const AI_PASS_EVENT_DURATION_MS = 600;

type PlayerDefenseState = {
  roll: DefenseRollResult;
  selectedCombo: Combo | null;
  baseResolution: BaseDefenseResolution;
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
  impactLocked: boolean;
  defenseStatusRoll: {
    dice: number[];
    inProgress: boolean;
    label: string | null;
    outcome: "success" | "failure" | null;
  } | null;
  attackBaseDamage: number;
  defenseBaseBlock: number;
  defenseStatusMessage: string | null;
  turnTransitionSide: Side | null;
  activeTransition: ActiveTransition | null;
  activeCue: ActiveCue | null;
};

type StatusSpendPhase = "attackRoll" | "defenseRoll";

type ControllerContext = {
  attackStatusRequests: Record<StatusId, number>;
  defenseStatusRequests: Record<StatusId, number>;
  requestStatusSpend: (phase: StatusSpendPhase, statusId: StatusId) => void;
  undoStatusSpend: (phase: StatusSpendPhase, statusId: StatusId) => void;
  clearAttackStatusRequests: () => void;
  clearDefenseStatusRequests: () => void;
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
  setDefenseStatusMessage: (message: string | null) => void;
  setDefenseStatusRollDisplay: (
    display: {
      dice: number[];
      inProgress: boolean;
      label: string | null;
      outcome: "success" | "failure" | null;
    } | null
  ) => void;
};

type FlowEventOptions = {
  afterReady?: () => void;
  durationMs?: number;
};

const GameDataContext = createContext<ComputedData | null>(null);
const GameControllerContext = createContext<ControllerContext | null>(null);

export const GameController = ({ children }: { children: ReactNode }) => {
  const { state, dispatch } = useGame();
  const rngRef = useRef<{ seed: number; rng: Rng }>({
    seed: state.rngSeed,
    rng: makeRng(state.rngSeed),
  });
  if (rngRef.current.seed !== state.rngSeed) {
    rngRef.current = {
      seed: state.rngSeed,
      rng: makeRng(state.rngSeed),
    };
  }
  const rng = rngRef.current.rng;
  const latestState = useLatest(state);
  const aiPlayRef = useRef<() => void>(() => {});
  const [attackStatusRequests, setAttackStatusRequests] = useState<
    Record<StatusId, number>
  >({});
  const [defenseStatusRequests, setDefenseStatusRequests] = useState<
    Record<StatusId, number>
  >({});
  const [turnChiAvailable, setTurnChiAvailable] = useState<
    Record<Side, number>
  >({
    you: getStacks(state.players.you.tokens, "chi", 0),
    ai: getStacks(state.players.ai.tokens, "chi", 0),
  });
  const [playerDefenseState, setPlayerDefenseState] =
    useState<PlayerDefenseState | null>(null);
  const [playerAttackSelection, setPlayerAttackSelection] =
    useState<Combo | null>(null);
  const [diceTrayVisible, setDiceTrayVisible] = useState(false);
  const [defenseStatusMessage, setDefenseStatusMessage] = useState<string | null>(
    null
  );
  const [defenseStatusRoll, setDefenseStatusRoll] = useState<{
    dice: number[];
    inProgress: boolean;
    label: string | null;
    outcome: "success" | "failure" | null;
  } | null>(null);
  const [activeTransition, setActiveTransition] =
    useState<ActiveTransition | null>(null);
  const [activeCue, setActiveCue] = useState<ActiveCue | null>(null);
  const openDiceTray = useCallback(() => {
    setDefenseStatusMessage(null);
    setDefenseStatusRoll(null);
    setDiceTrayVisible(true);
  }, [setDefenseStatusMessage, setDefenseStatusRoll]);
  const closeDiceTray = useCallback(() => {
    setDefenseStatusMessage(null);
    setDefenseStatusRoll(null);
    setDiceTrayVisible(false);
  }, [setDefenseStatusMessage, setDefenseStatusRoll]);
  const [impactLocked, setImpactLocked] = useState(false);
  const impactTimerRef = useRef<number | null>(null);

  const adjustStatusRequest = useCallback(
    (phase: StatusSpendPhase, statusId: StatusId, delta: number) => {
      if (delta === 0) return;
      const setter =
        phase === "attackRoll"
          ? setAttackStatusRequests
          : setDefenseStatusRequests;

      setter((prev) => {
        const current = prev[statusId] ?? 0;
        const player = latestState.current.players.you;
        if (!player) return prev;
        const ownedStacks = getStacks(player.tokens, statusId, 0);
        let limit = ownedStacks;
        if (statusId === "chi") {
          limit = Math.min(limit, turnChiAvailable.you ?? limit);
        }
        if (delta > 0 && limit <= 0) return prev;
        let nextValue = current + delta;
        if (delta > 0) {
          nextValue = Math.max(0, Math.min(nextValue, limit));
        } else {
          nextValue = Math.max(0, nextValue);
        }
        if (nextValue === current) return prev;
        if (nextValue <= 0) {
          const { [statusId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [statusId]: nextValue };
      });
    },
    [latestState, turnChiAvailable.you]
  );

  const requestStatusSpend = useCallback(
    (phase: StatusSpendPhase, statusId: StatusId) => {
      adjustStatusRequest(phase, statusId, 1);
    },
    [adjustStatusRequest]
  );

  const undoStatusSpend = useCallback(
    (phase: StatusSpendPhase, statusId: StatusId) => {
      adjustStatusRequest(phase, statusId, -1);
    },
    [adjustStatusRequest]
  );

  const clearAttackStatusRequests = useCallback(() => {
    setAttackStatusRequests({});
  }, []);

  const clearDefenseStatusRequests = useCallback(() => {
    setDefenseStatusRequests({});
  }, []);

  useEffect(() => {
    const clampChi = (prev: Record<StatusId, number>) => {
      if (!("chi" in prev)) return prev;
      const player = latestState.current.players.you;
      if (!player) return prev;
      const ownedChi = getStacks(player.tokens, "chi", 0);
      const maxChi = Math.min(ownedChi, turnChiAvailable.you ?? ownedChi);
      const current = prev.chi ?? 0;
      if (current <= maxChi) return prev;
      if (maxChi <= 0) {
        const { chi: _ignored, ...rest } = prev;
        return rest;
      }
      return { ...prev, chi: maxChi };
    };

    setAttackStatusRequests((prev) => clampChi(prev));
    setDefenseStatusRequests((prev) => clampChi(prev));
  }, [latestState, turnChiAvailable.you]);


  const triggerImpactLock = useCallback((kind: "hit" | "reflect") => {
    if (impactTimerRef.current !== null) {
      window.clearTimeout(impactTimerRef.current);
    }
    setImpactLocked(true);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(kind === "hit" ? 80 : 50);
      } catch {
        // ignore vibration errors
      }
    }
    impactTimerRef.current = window.setTimeout(() => {
      setImpactLocked(false);
      impactTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(
    () => () => {
      if (impactTimerRef.current !== null) {
        window.clearTimeout(impactTimerRef.current);
      }
    },
    []
  );

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
    rng,
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
      if (amount > 0) {
        triggerImpactLock(kind);
      }
      if (kind === "hit") {
        setShake(side, true);
        window.setTimeout(() => setShake(side, false), 450);
      }
      window.setTimeout(() => setFloatDamage(side, null), 1300);
    },
    [setFloatDamage, setShake, triggerImpactLock]
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
  const attackBaseDamage = ability?.damage ?? 0;
  useEffect(() => {
    if (!ability || attackBaseDamage <= 0) {
      setAttackStatusRequests({});
    }
  }, [ability, attackBaseDamage]);
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
  const defenseBaseBlock = playerDefenseState?.baseResolution.baseBlock ?? 0;
  useEffect(() => {
    if (!playerDefenseState || defenseBaseBlock > 0) return;
    setDefenseStatusRequests((prev) => {
      if (!("chi" in prev)) return prev;
      const { chi: _ignored, ...rest } = prev;
      return rest;
    });
  }, [playerDefenseState, defenseBaseBlock]);

  useEffect(() => {
    const currentChi =
      turn === "you"
        ? getStacks(players.you.tokens, "chi", 0)
        : getStacks(players.ai.tokens, "chi", 0);
    setTurnChiAvailable((prev) => ({
      ...prev,
      [turn]: currentChi,
    }));
  }, [turn, players.you.tokens, players.ai.tokens]);

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

  const {
    resetRoll,
    animateDefenseDie,
    animateDefenseRoll,
    restoreDiceAfterDefense,
  } = useDiceAnimator({ defenseDieIndex: DEF_DIE_INDEX, rng });
  const { animatePreviewRoll } = useAiDiceAnimator({
    rollDurationMs: AI_ROLL_ANIM_MS,
  });
  const {
    send: sendFlowEvent,
    resumePendingStatus,
    scheduleCallback,
    enqueueCue,
    clearCues,
    interruptCue,
  } = useGameFlow({
    resetRoll,
    pushLog,
    popDamage,
    onTransitionChange: setActiveTransition,
    onCueChange: setActiveCue,
  });

  const queueTurnCue = useCallback(
    (side: Side, durationMs?: number) => {
      const snapshot = latestState.current;
      const player = snapshot.players[side];
      if (!player) return;
      const fallbackDuration = getCueDuration("turn");
      const effectiveDuration =
        typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
          ? durationMs
          : fallbackDuration;
      interruptCue();
      enqueueCue({
        kind: "turn",
        title: side === "you" ? "Your Turn" : "Opponent Turn",
        subtitle: player.hero.name,
        durationMs: effectiveDuration,
        side,
        priority: "urgent",
        allowDuringTransition: true,
      });
    },
    [enqueueCue, interruptCue, latestState]
  );

  const handleFlowEvent = useCallback(
    (event: CombatEvent, options: FlowEventOptions = {}) => {
      if (event.type !== "TURN_END") {
        return;
      }

      const prePhase = event.payload.prePhase ?? "turnTransition";
      const defaultDuration = prePhase === "turnTransition" ? TURN_TRANSITION_DELAY_MS : 0;
      const rawDuration =
        options.durationMs ?? event.payload.durationMs ?? defaultDuration;
      const durationMs =
        typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration
          : 0;

      if (prePhase === "turnTransition") {
        const fallbackTurnDuration = getCueDuration("turn", TURN_TRANSITION_DELAY_MS);
        queueTurnCue(
          event.payload.next,
          durationMs > 0 ? durationMs : fallbackTurnDuration
        );
      }

      sendFlowEvent({
        type: "TURN_END",
        next: event.payload.next,
        prePhase,
        durationMs,
        afterReady: options.afterReady,
      });
    },
    [queueTurnCue, sendFlowEvent]
  );

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
                scheduleCallback(AI_PASS_FOLLOW_UP_MS, () => {
                  const snapshot = latestState.current;
                  const aiState = snapshot.players.ai;
                  const youState = snapshot.players.you;
                  if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
                    return;
                  aiPlayRef.current();
                });
              }
            : undefined;

        handleFlowEvent(event, { afterReady });
      });
    },
    [handleFlowEvent, latestState, pushLog, scheduleCallback]
  );

  const startInitialRoll = useCallback(() => {
    if (
      phase !== "standoff" ||
      initialRoll.inProgress ||
      initialRoll.awaitingConfirmation
    )
      return;
    dispatch({ type: "START_INITIAL_ROLL" });
    const youRoll = rollDie(rng);
    const aiRoll = rollDie(rng);
    const winner =
      youRoll === aiRoll ? null : youRoll > aiRoll ? ("you" as Side) : "ai";

    scheduleCallback(350, () => {
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
    });
  }, [
    dispatch,
    initialRoll.awaitingConfirmation,
    initialRoll.inProgress,
    phase,
    pushLog,
    rng,
    scheduleCallback,
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
          durationMs: AI_PASS_EVENT_DURATION_MS,
        })
      );
    },
    rng,
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
    openDiceTray,
    closeDiceTray,
    popDamage,
    restoreDiceAfterDefense,
    handleFlowEvent,
    sendFlowEvent,
    aiPlay,
    aiStepDelay: AI_STEP_MS,
    attackStatusRequests,
    defenseStatusRequests,
    clearAttackStatusRequests,
    clearDefenseStatusRequests,
    turnChiAvailable,
    consumeTurnChi,
    playerDefenseState,
    setPlayerDefenseState,
    applyTurnEndResolution,
    setDefenseStatusMessage,
    setDefenseStatusRollDisplay: setDefenseStatusRoll,
    enqueueCue,
    interruptCue,
    scheduleCallback,
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

  const turnTransitionSide =
    activeTransition?.phase === "turnTransition" ? activeTransition.side : null;

  const { abilities: activeAbilities, performAbility: onPerformActiveAbility } =
    useActiveAbilities({
      side: "you",
      pushLog,
      popDamage,
      sendFlowEvent,
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
      return scheduleCallback(700, () => performStatusClearRoll("ai"));
    }
    return undefined;
  }, [pendingStatusClear, performStatusClearRoll, scheduleCallback]);

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
    clearCues();
    dispatch({
      type: "RESET",
      payload: {
        youHero: current.players.you.hero,
        aiHero: current.players.ai.hero,
        seed: Date.now(),
      },
    });
    resetRoll();
  }, [clearCues, dispatch, resetRoll]);

  useEffect(() => {
    if (players.you.hp <= 0 || players.ai.hp <= 0) {
      clearCues();
    }
  }, [clearCues, players.ai.hp, players.you.hp]);

  const initialStartRef = useRef(false);
  const lastAttackCueKeyRef = useRef<string | null>(null);
  const lastStatusCueKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase === "standoff") {
      initialStartRef.current = false;
    }
  }, [state.phase]);

  useEffect(() => {
    if (!diceTrayVisible) {
      return;
    }

    const inPlayerRollPhase = state.phase === "roll" && turn === "you";
    const inDefensePhase = state.phase === "defense";
    const duringInitialRoll = state.initialRoll.inProgress;

    if (inPlayerRollPhase || inDefensePhase || duringInitialRoll) {
      return;
    }

    closeDiceTray();
  }, [
    diceTrayVisible,
    state.phase,
    state.initialRoll.inProgress,
    turn,
    closeDiceTray,
  ]);

  useEffect(() => {
    if (!pendingAttack) {
      lastAttackCueKeyRef.current = null;
      return;
    }
    const bonusDamage =
      pendingAttack.modifiers?.statusSpends?.reduce(
        (sum, spend) => sum + (spend.bonusDamage ?? 0),
        0
      ) ?? 0;
    const projectedDamage = Math.max(0, pendingAttack.baseDamage + bonusDamage);
    const key = `${pendingAttack.attacker}:${pendingAttack.ability.combo}:${pendingAttack.dice.join(
      ""
    )}:${projectedDamage}`;
    if (key === lastAttackCueKeyRef.current) {
      return;
    }
    lastAttackCueKeyRef.current = key;
    const attacker = players[pendingAttack.attacker];
    const attackerName = attacker?.hero.name ?? "Opponent";
    const abilityCombo = pendingAttack.ability.combo;
    const abilityIcon =
      attacker && abilityCombo
        ? getAbilityIcon(attacker.hero.id, abilityCombo, { variant: "offense" })
        : undefined;
    const abilityTitle =
      pendingAttack.ability.displayName ??
      pendingAttack.ability.label ??
      pendingAttack.ability.combo;
    enqueueCue({
      kind: "attack",
      title: abilityTitle,
      subtitle: `${attackerName} prepares an attack (${projectedDamage} dmg)`,
      icon: abilityIcon?.webp ?? abilityIcon?.png ?? null,
      cta: "Prepare for defense!",
      durationMs: getCueDuration("attackTelegraph"),
      side: pendingAttack.attacker,
      priority: "urgent",
    });
  }, [enqueueCue, pendingAttack, players]);

  useEffect(() => {
    if (!pendingStatusClear) {
      lastStatusCueKeyRef.current = null;
      return;
    }
    if (pendingStatusClear.rolling) {
      return;
    }
    const key = `${pendingStatusClear.side}:${pendingStatusClear.status}:${pendingStatusClear.stacks}`;
    if (key === lastStatusCueKeyRef.current) {
      return;
    }
    lastStatusCueKeyRef.current = key;
    const status = getStatus(pendingStatusClear.status);
    const ownerName =
      pendingStatusClear.side === "you"
        ? players.you.hero.name
        : players.ai.hero.name;
    enqueueCue({
      kind: "status",
      title: status?.name ?? pendingStatusClear.status,
      subtitle: `${ownerName} - ${pendingStatusClear.stacks} stack${
        pendingStatusClear.stacks === 1 ? "" : "s"
      }`,
      durationMs: getCueDuration("statusTick"),
      side: pendingStatusClear.side,
      priority: "low",
      mergeKey: key,
      mergeWindowMs: 2200,
    });
  }, [enqueueCue, pendingStatusClear, players.ai.hero.name, players.you.hero.name]);

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
      let cancelFollow: (() => void) | null = null;
      const cancelStart = scheduleCallback(0, () => {
        if (startingSide === "ai") {
          queueTurnCue("ai", TURN_TRANSITION_DELAY_MS);
          const cont = sendFlowEvent({
            type: "TURN_START",
            side: "ai",
            afterReady: () => {
              cancelFollow = scheduleCallback(450, () => {
                const aiState = latestState.current.players.ai;
                const youState = latestState.current.players.you;
                if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
                  return;
                aiPlay();
              });
            },
          });
          if (!cont) {
            cancelFollow?.();
            cancelFollow = null;
          }
        } else {
          queueTurnCue("you", TURN_TRANSITION_DELAY_MS);
          sendFlowEvent({ type: "TURN_START", side: "you" });
        }
      });
      return () => {
        cancelFollow?.();
        cancelStart();
      };
    }
  }, [
    aiPlay,
    queueTurnCue,
    scheduleCallback,
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
      impactLocked,
      defenseStatusRoll,
      attackBaseDamage,
      defenseBaseBlock,
      defenseStatusMessage,
      turnTransitionSide,
      activeTransition,
      activeCue,
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
      impactLocked,
      defenseStatusRoll,
      attackBaseDamage,
      defenseBaseBlock,
      defenseStatusMessage,
      turnTransitionSide,
      activeTransition,
      activeCue,
    ]
  );

  const controllerValue: ControllerContext = useMemo(
    () => ({
      attackStatusRequests,
      defenseStatusRequests,
      requestStatusSpend,
      undoStatusSpend,
      clearAttackStatusRequests,
      clearDefenseStatusRequests,
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
      setDefenseStatusMessage,
      setDefenseStatusRollDisplay: setDefenseStatusRoll,
    }),
    [
      attackStatusRequests,
      defenseStatusRequests,
      requestStatusSpend,
      undoStatusSpend,
      clearAttackStatusRequests,
      clearDefenseStatusRequests,
      activeAbilities,
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
      setDefenseStatusMessage,
      setDefenseStatusRoll,
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
