import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import HeroSelectScreen, { HeroOption } from "./components/HeroSelectScreen";
import { BattleScreen } from "./screens/BattleScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { AiPreviewPanel } from "./components/AiPreviewPanel";
import { HEROES } from "./game/heroes";
import { Phase, PlayerState, Side, Ability, Hero } from "./game/types";
import { bestAbility, detectCombos, rollDie } from "./game/combos";
import {
  AiDefenseState,
  AiPreviewState,
  GameState,
  PendingStatusClear,
  createInitialState,
  gameReducer,
} from "./game/state";
import {
  buildAttackResolutionLines,
  indentLog,
  useCombatLog,
} from "./hooks/useCombatLog";
import { useGameActions } from "./hooks/useGameActions";
import { useDiceAnimator } from "./hooks/useDiceAnimator";
import { useAiDiceAnimator } from "./hooks/useAiDiceAnimator";
import { useAiController } from "./hooks/useAiController";
import { useStatusManager } from "./hooks/useStatusManager";
import { useDefenseActions } from "./hooks/useDefenseActions";
import { useTurnController } from "./hooks/useTurnController";
import PyromancerPortrait from "./assets/Pyromancer_Hero.png";
import ShadowMonkPortrait from "./assets/Shadow_Monk_Hero.png";

const HERO_IMAGES: Record<string, string> = {
  Pyromancer: PyromancerPortrait,
  "Shadow Monk": ShadowMonkPortrait,
};

export default function App() {
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => createInitialState(HEROES.Pyromancer, HEROES["Shadow Monk"])
  );

  const stateRef = useRef<GameState>(state);
  const [screen, setScreen] = useState<"intro" | "hero-select" | "game">("intro");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const {
    players,
    turn,
    phase,
    dice,
    held,
    rolling,
    rollsLeft,
    log,
    aiPreview,
    aiDefense,
    pendingAttack,
    pendingStatusClear,
    savedDefenseDice,
    fx,
  } = state;

  const heroOptions: HeroOption[] = useMemo(
    () =>
      Object.values(HEROES).map((hero) => ({
        hero,
        image: HERO_IMAGES[hero.id] ?? PyromancerPortrait,
      })),
    []
  );

  const {
    pushLog,
    logPlayerAttackStart,
    logPlayerNoCombo,
    logAiAttackRoll,
    logAiNoCombo,
  } = useCombatLog(dispatch);

  const {
    setPlayer,
    setYou,
    setAi,
    setPendingStatusClear,
    setPendingAttack,
    setSavedDiceForDefense,
    setTurn,
    setPhase,
    setRound,
    setDice,
    setHeld,
    setRolling,
    setRollsLeft,
    setAiSimActive,
    setAiSimRolling,
    setAiSimDice,
    setAiSimHeld,
    setAiDefenseSim,
    setAiDefenseRoll,
    setAiEvasiveRoll,
    setFloatDamage,
    setShake,
  } = useGameActions(dispatch, stateRef);

  const DEF_DIE_INDEX = 2;
  const ROLL_ANIM_MS = 1300;
  const AI_ROLL_ANIM_MS = 900;
  const AI_STEP_MS = 2000;
  const timersRef = useRef<number | null>(null);

  function popDamage(
    side: Side,
    amount: number,
    kind: "hit" | "reflect" = "hit"
  ) {
    const payload = { val: amount, kind } as const;
    setFloatDamage(side, payload);
    if (kind === "hit") {
      setShake(side, true);
      setTimeout(() => setShake(side, false), 450);
    }
    setTimeout(() => setFloatDamage(side, null), 1300);
  }

  const acting = turn === "you" ? players.you : players.ai;
  const aiSimActive = aiPreview.active;
  const aiSimRolling = aiPreview.rolling;
  const aiSimDice = aiPreview.dice;
  const aiSimHeld = aiPreview.held;
  const aiDefenseSim = aiDefense.inProgress;
  const aiDefenseRoll = aiDefense.defenseRoll;
  const aiEvasiveRoll = aiDefense.evasiveRoll;
  const savedDiceForDefense = savedDefenseDice;
  const floatDmgYou = fx.floatDamage.you;
  const floatDmgAi = fx.floatDamage.ai;
  const shakeYou = fx.shake.you;
  const shakeAi = fx.shake.ai;
  const ability = useMemo(
    () => bestAbility(acting.hero, dice),
    [acting.hero, dice]
  );
  const readyForActing = useMemo(() => detectCombos(dice), [dice]);
  const readyForAI = useMemo(() => detectCombos(aiSimDice), [aiSimDice]);
  const { resetRoll, animateDefenseDie, restoreDiceAfterDefense } =
    useDiceAnimator({
      stateRef,
      savedDiceForDefense,
      setSavedDiceForDefense,
      setDice,
      setHeld,
      setRolling,
      setRollsLeft,
      defenseDieIndex: DEF_DIE_INDEX,
    });
  const { animatePreviewRoll } = useAiDiceAnimator({
    stateRef,
    setAiSimDice,
    setAiSimRolling,
    rollDurationMs: AI_ROLL_ANIM_MS,
  });
  const { statusResumeRef, performStatusClearRoll } = useStatusManager({
    stateRef,
    setPlayer,
    setPendingStatusClear,
    pushLog,
    animateDefenseDie,
    restoreDiceAfterDefense,
    setPhase,
  });
  const { tickAndStart } = useTurnController({
    resetRoll,
    pushLog,
    popDamage,
    statusResumeRef,
  });

  const startBattle = (playerHero: Hero, aiHero: Hero) => {
    if (timersRef.current) {
      window.clearInterval(timersRef.current);
      timersRef.current = null;
    }
    statusResumeRef.current = null;
    const resetState = createInitialState(playerHero, aiHero);
    stateRef.current = resetState;
    dispatch({
      type: "RESET",
      payload: { youHero: playerHero, aiHero },
    });
    setScreen("game");
    window.setTimeout(() => tickAndStart("you"), 0);
  };

  const { aiPlay } = useAiController({
    stateRef,
    setAiSimActive,
    setAiSimRolling,
    setAiSimHeld,
    setPendingAttack,
    setPhase,
    logAiNoCombo,
    logAiAttackRoll,
    animatePreviewRoll,
    tickAndStart,
    aiStepDelay: AI_STEP_MS,
  });
  const { onConfirmAttack, onUserDefenseRoll, onUserEvasiveRoll } =
    useDefenseActions({
      stateRef,
      turn,
      rolling,
      ability,
      dice,
      you: players.you,
      pendingAttack,
      setPhase,
      setAiDefenseSim,
      setAiDefenseRoll,
      setAiEvasiveRoll,
      setPendingAttack,
      setPlayer,
      logPlayerNoCombo,
      logPlayerAttackStart,
      pushLog,
      animateDefenseDie,
      popDamage,
      restoreDiceAfterDefense,
      tickAndStart,
      aiPlay,
      aiStepDelay: AI_STEP_MS,
    });
  const handleHeroSelection = (playerHero: Hero, aiHero: Hero) => {
    startBattle(playerHero, aiHero);
  };

  const handleOpenHeroSelect = () => setScreen("hero-select");
  const handleBackToIntro = () => setScreen("intro");

  function onRoll() {
    if (turn !== "you" || rollsLeft <= 0 || statusActive) return;
    const mask = held.map((h) => !h);
    setRolling(mask);
    const start = Date.now();
    let workingDice = [...dice];
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
  }
  const onToggleHold = (i: number) => {
    if (turn !== "you") return;
    setHeld((h) => h.map((v, idx) => (idx === i ? !v : v)));
  };

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
  }, [pendingStatusClear]);

  const onEndTurnNoAttack = () => {
    if (turn !== "you" || rolling.some(Boolean)) return;
    setTimeout(() => {
      const cont = tickAndStart("ai", () => {
        setTimeout(() => {
          const aiState = stateRef.current.players.ai;
          const youState = stateRef.current.players.you;
          if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
            return;
          aiPlay();
        }, 450);
      });
      if (!cont) return;
    }, 0);
  };
  const onReset = () => {
    startBattle(players.you.hero, players.ai.hero);
  };

  const isDefenseTurn =
    !!pendingAttack && pendingAttack.defender === "you";
  const statusActive = !!pendingStatusClear;
  const defenseAbility = pendingAttack?.ability;
  if (screen === "intro") {
    return <IntroScreen onBegin={handleOpenHeroSelect} />;
  }

  if (screen === "hero-select") {
    return (
      <HeroSelectScreen
        heroOptions={heroOptions}
        onConfirm={handleHeroSelection}
        onClose={handleBackToIntro}
      />
    );
  }

  const you = players.you;
  const ai = players.ai;
  const winner = you.hp <= 0 ? ai.hero.id : ai.hp <= 0 ? you.hero.id : null;
  const showDcLogo =
    turn === "you" && rollsLeft === 3 && !pendingAttack && !statusActive; // pred prvm rollom a ak nie je status

  const battleProps = {
    onReset,
    you,
    ai,
    turn,
    winner,
    showDcLogo,
    phase,
    dice,
    held,
    rolling,
    onToggleHold,
    defDieIndex: DEF_DIE_INDEX,
    onRoll,
    onConfirmAttack,
    onEndTurnNoAttack,
    onUserDefenseRoll,
    onUserEvasiveRoll,
    rollsLeft,
    isDefenseTurn,
    statusActive,
    pendingStatusClear,
    performStatusClearRoll,
    ability,
    readyForActing,
    readyForAI,
    aiSimDice,
    aiSimRolling,
    aiSimHeld,
    aiDefenseSim,
    aiDefenseRoll,
    aiEvasiveRoll,
    floatDmgYou,
    floatDmgAi,
    shakeYou,
    shakeAi,
    log,
  };

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      <BattleScreen {...battleProps} />
    </GameContext.Provider>
  );
}




