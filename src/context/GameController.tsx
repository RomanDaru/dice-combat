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
import type { GameState } from "../game/state";
import type { Ability, Side } from "../game/types";

import { useCombatLog } from "../hooks/useCombatLog";
import { useDiceAnimator } from "../hooks/useDiceAnimator";
import { useAiDiceAnimator } from "../hooks/useAiDiceAnimator";
import { useAiController } from "../hooks/useAiController";
import { useStatusManager } from "../hooks/useStatusManager";
import { useDefenseActions } from "../hooks/useDefenseActions";
import { useTurnController } from "../hooks/useTurnController";
import { useActiveAbilities } from "../hooks/useActiveAbilities";
import { bestAbility, detectCombos, rollDie } from "../game/combos";
import type {
  ActiveAbility,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
} from "../game/types";

const DEF_DIE_INDEX = 2;
const ROLL_ANIM_MS = 1300;
const AI_ROLL_ANIM_MS = 900;
const AI_STEP_MS = 2000;

type ComputedData = {
  ability: Ability | null;
  readyForActing: ReturnType<typeof detectCombos>;
  readyForAI: ReturnType<typeof detectCombos>;
  isDefenseTurn: boolean;
  statusActive: boolean;
  showDcLogo: boolean;
  defenseDieIndex: number;
};

type ControllerContext = {
  attackChiSpend: number;
  defenseChiSpend: number;
  setAttackChiSpend: (value: number | ((prev: number) => number)) => void;
  setDefenseChiSpend: (value: number | ((prev: number) => number)) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  onRoll: () => void;
  onToggleHold: (index: number) => void;
  onEndTurnNoAttack: () => void;
  handleReset: () => void;
  performStatusClearRoll: (side: Side) => void;
  onConfirmAttack: () => void;
  onUserDefenseRoll: () => void;
  onUserEvasiveRoll: () => void;
  activeAbilities: ActiveAbility[];
  onPerformActiveAbility: (abilityId: string) => boolean;
};

const GameDataContext = createContext<ComputedData | null>(null);
const GameControllerContext = createContext<ControllerContext | null>(null);

export const GameController = ({ children }: { children: ReactNode }) => {
  const { state, dispatch } = useGame();
  const stateRef = useRef<GameState>(state);
  const [attackChiSpend, setAttackChiSpend] = useState(0);
  const [defenseChiSpend, setDefenseChiSpend] = useState(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateAttackChiSpend = useCallback(
    (value: number | ((prev: number) => number)) => {
      setAttackChiSpend((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: number) => number)(prev)
            : value;
        const max = stateRef.current.players.you.tokens.chi ?? 0;
        return Math.max(0, Math.min(next, max));
      });
    },
    []
  );

  const updateDefenseChiSpend = useCallback(
    (value: number | ((prev: number) => number)) => {
      setDefenseChiSpend((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prev: number) => number)(prev)
            : value;
        const max = stateRef.current.players.you.tokens.chi ?? 0;
        return Math.max(0, Math.min(next, max));
      });
    },
    []
  );

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
          ? (value as (prev: number[]) => number[])(stateRef.current.dice)
          : value;
      dispatch({ type: "SET_DICE", dice: next });
    },
    [dispatch]
  );

  const setHeld = useCallback(
    (value: boolean[] | ((prev: boolean[]) => boolean[])) => {
      const next =
        typeof value === "function"
          ? (value as (prev: boolean[]) => boolean[])(stateRef.current.held)
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
          ? (value as (prev: number) => number)(stateRef.current.rollsLeft)
          : value;
      dispatch({ type: "SET_ROLLS_LEFT", rollsLeft: next });
    },
    [dispatch]
  );

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

  const acting = turn === "you" ? players.you : players.ai;
  const ability = useMemo(
    () => bestAbility(acting.hero, dice),
    [acting.hero, dice]
  );
  const readyForActing = useMemo(() => detectCombos(dice), [dice]);
  const readyForAI = useMemo(
    () => detectCombos(aiPreview.dice),
    [aiPreview.dice]
  );
  const isDefenseTurn = !!pendingAttack && pendingAttack.defender === "you";
  const statusActive = !!pendingStatusClear;
  const showDcLogo =
    turn === "you" && rollsLeft === 3 && !pendingAttack && !statusActive;

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

  const timersRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timersRef.current) {
        window.clearInterval(timersRef.current);
      }
    };
  }, []);

  const { resetRoll, animateDefenseDie, restoreDiceAfterDefense } =
    useDiceAnimator({ defenseDieIndex: DEF_DIE_INDEX });
  const { animatePreviewRoll } = useAiDiceAnimator({
    rollDurationMs: AI_ROLL_ANIM_MS,
  });
  const { statusResumeRef, performStatusClearRoll } = useStatusManager({
    pushLog,
    animateDefenseDie,
    restoreDiceAfterDefense,
  });
  const { tickAndStart } = useTurnController({
    resetRoll,
    pushLog,
    popDamage,
    statusResumeRef,
  });
  const { aiPlay } = useAiController({
    logAiNoCombo,
    logAiAttackRoll,
    animatePreviewRoll,
    tickAndStart,
    aiStepDelay: AI_STEP_MS,
  });
  const { onConfirmAttack, onUserDefenseRoll, onUserEvasiveRoll } =
    useDefenseActions({
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
      popDamage,
      restoreDiceAfterDefense,
      tickAndStart,
      aiPlay,
      aiStepDelay: AI_STEP_MS,
      attackChiSpend,
      defenseChiSpend,
      clearAttackChiSpend,
      clearDefenseChiSpend,
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
    const mask = held.map((h) => !h);
    setRolling(mask);
    const start = Date.now();
    let workingDice = [...stateRef.current.dice];
    if (timersRef.current) window.clearInterval(timersRef.current);
    timersRef.current = window.setInterval(() => {
      workingDice = workingDice.map((value, idx) =>
        mask[idx] ? rollDie() : value
      );
      setDice([...workingDice]);
      if (Date.now() - start > ROLL_ANIM_MS) {
        if (timersRef.current) window.clearInterval(timersRef.current);
        workingDice = workingDice.map((value, idx) =>
          mask[idx] ? rollDie() : value
        );
        setDice([...workingDice]);
        setRolling([false, false, false, false, false]);
        setRollsLeft((n) => n - 1);
      }
    }, 100);
  }, [
    held,
    isDefenseTurn,
    rollsLeft,
    setDice,
    setRolling,
    setRollsLeft,
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
    window.setTimeout(() => {
      const cont = tickAndStart("ai", () => {
        window.setTimeout(() => {
          const aiState = stateRef.current.players.ai;
          const youState = stateRef.current.players.you;
          if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
            return;
          aiPlay();
        }, 450);
      });
      if (!cont) return;
    }, 0);
  }, [aiPlay, rolling, tickAndStart, turn]);

  const handleReset = useCallback(() => {
    const current = stateRef.current;
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
    if (
      state.phase === "upkeep" &&
      state.round === 0 &&
      state.log.length === 1
    ) {
      initialStartRef.current = false;
    }
  }, [state.phase, state.round, state.log.length]);

  useEffect(() => {
    if (
      !initialStartRef.current &&
      state.phase === "upkeep" &&
      state.round === 0
    ) {
      initialStartRef.current = true;
      window.setTimeout(() => tickAndStart("you"), 0);
    }
  }, [state.phase, state.round, tickAndStart]);

  const dataValue: ComputedData = useMemo(
    () => ({
      ability,
      readyForActing,
      readyForAI,
      isDefenseTurn,
      statusActive,
      showDcLogo,
      defenseDieIndex: DEF_DIE_INDEX,
    }),
    [
      ability,
      readyForActing,
      readyForAI,
      isDefenseTurn,
      statusActive,
      showDcLogo,
    ]
  );

  const controllerValue: ControllerContext = useMemo(
    () => ({
      attackChiSpend,
      defenseChiSpend,
      setAttackChiSpend: updateAttackChiSpend,
      setDefenseChiSpend: updateDefenseChiSpend,
      popDamage,
      onRoll,
      onToggleHold,
      onEndTurnNoAttack,
      handleReset,
      performStatusClearRoll,
      onConfirmAttack,
      onUserDefenseRoll,
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
      onUserDefenseRoll,
      onUserEvasiveRoll,
      performStatusClearRoll,
      popDamage,
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
