import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Section from "./components/Section";
import AbilityList from "./components/AbilityList";
import DiceGrid from "./components/DiceGrid";
import HeroSelectScreen, {
  HeroOption,
} from "./components/HeroSelectScreen";
import { PlayerPanel } from "./components/PlayerPanel";
import { PlayerActionPanel } from "./components/PlayerActionPanel";
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
  const [screen, setScreen] = useState<"welcome" | "game">("welcome");
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
    stateRef,
    setYou,
    setAi,
    setTurn,
    setPhase,
    setRound,
    setPendingAttack,
    setPendingStatusClear,
    setAiSimActive,
    setAiSimRolling,
    setAiDefenseSim,
    setAiDefenseRoll,
    setAiEvasiveRoll,
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
  if (screen === "welcome") {
    return (
      <HeroSelectScreen
        heroOptions={heroOptions}
        onConfirm={handleHeroSelection}
      />
    );
  }

  const you = players.you;
  const ai = players.ai;
  const winner = you.hp <= 0 ? ai.hero.id : ai.hp <= 0 ? you.hero.id : null;
  const showDcLogo =
    turn === "you" && rollsLeft === 3 && !pendingAttack && !statusActive; // pred prvm rollom a ak nie je status

  return (
    <div className='container'>
      <div className='row'>
        <div className='row'>
            <div
              style={{
                display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
            <h1
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 20,
                fontWeight: 600,
              }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid #059669",
                  background: "rgba(4,120,87,.3)",
                  fontWeight: 700,
                }}>
                DC
              </span>{" "}
              Fantasy Dice Combat
            </h1>
            <button className='btn' onClick={onReset}>
              Reset
            </button>
          </div>

          <div className='row grid-2'>
            <PlayerPanel
              title={`You - ${you.hero.name}`}
              active={turn === "you"}
              player={you}
              shake={shakeYou}
              floatDamage={floatDmgYou}
            />
            <PlayerPanel
              title={`Opponent - ${ai.hero.name} (AI)`}
              active={turn === "ai"}
              player={ai}
              shake={shakeAi}
              floatDamage={floatDmgAi}
            />
          </div>

          <Section title={`Kolo: ${turn === "you" ? "Ty to" : "AI hraje"}`}>
            {winner ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  fontSize: 24,
                }}>
                Vaz: <b>{winner}</b>
              </div>
            ) : (
              <div className='row'>
                <div className='row grid-2'>
                  <div
                    className='card'
                    style={{
                      padding: 12,
                      borderColor: turn === "you" ? "#059669" : "#27272a",
                      background:
                        turn === "you" ? "rgba(6,78,59,.3)" : undefined,
                    }}>
                    Tvoje kolo
                  </div>
                  <div
                    className='card'
                    style={{
                      padding: 12,
                      borderColor: turn === "ai" ? "#4338ca" : "#27272a",
                      background:
                        turn === "ai" ? "rgba(49,46,129,.3)" : undefined,
                    }}>
                    AI kolo
                  </div>
                </div>

                <div className='row grid-2'>
                  <AbilityList
                    hero={you.hero}
                    title={`Tvoje schopnosti (${you.hero.name})`}
                    showReadyCombos={readyForActing as any}
                  />

                  <PlayerActionPanel
                    phase={phase}
                    dice={dice}
                    held={held}
                    rolling={rolling}
                    canInteract={turn === "you" && !isDefenseTurn && !statusActive}
                    onToggleHold={onToggleHold}
                    defIndex={DEF_DIE_INDEX}
                    showDcLogo={showDcLogo}
                    isDefensePhase={
                      isDefenseTurn || statusActive || phase === "defense"
                    }
                    statusActive={statusActive}
                    onRoll={onRoll}
                    onConfirmAttack={onConfirmAttack}
                    onEndTurnNoAttack={onEndTurnNoAttack}
                    onUserDefenseRoll={onUserDefenseRoll}
                    onUserEvasiveRoll={onUserEvasiveRoll}
                    rollsLeft={rollsLeft}
                    turn={turn}
                    isDefenseTurn={isDefenseTurn}
                    youHasEvasive={you.tokens.evasive > 0}
                    pendingStatusClear={pendingStatusClear}
                    performStatusClearRoll={performStatusClearRoll}
                    youHeroName={you.hero.name}
                    aiHeroName={ai.hero.name}
                    aiEvasiveRoll={aiEvasiveRoll}
                    aiDefenseRoll={aiDefenseRoll}
                    aiDefenseSim={aiDefenseSim}
                    ability={ability}
                  />
                </div>

                <div className='row grid-2'>
                  <AbilityList
                    hero={ai.hero}
                    title={`Opponent Abilities (${ai.hero.name})`}
                    showReadyCombos={readyForAI as any}
                  />
                  <div className='row'>
                    <DiceGrid
                      dice={aiSimDice}
                      held={[]}
                      rolling={aiSimRolling}
                      canInteract={false}
                      onToggleHold={() => {}}
                      defIndex={-1}
                      showDcLogo={false}
                      isDefensePhase={false}
                      statusActive={false}
                      isAi={true}
                      aiSimHeld={aiSimHeld}
                    />
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      AI abilities highlight according to this preview roll
                      sequence.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Section>
        </div>

        <Section title='Combat Log'>
          <div
            style={{
              display: "grid",
              gap: 8,
              maxHeight: 360,
              overflow: "auto",
              paddingRight: 4,
            }}>
            {log.map((entry, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: 14,
                  color: "#e5e7eb",
                  whiteSpace: "pre-wrap",
                }}>
                {entry.t}
              </div>
            ))}
          </div>
        </Section>
        <Section title='Tips'>
          <ul
            style={{
              paddingLeft: 18,
              fontSize: 14,
              color: "#d4d4d8",
              display: "grid",
              gap: 4,
            }}>
            <li>
              Click a die to hold it. Held dice stay locked through rolls.
            </li>
            <li>
              Confirm Attack becomes available after your first roll this turn.
            </li>
            <li>
              Pyromancer defense: roll 5-6 to block 2 dmg, 3-4 to block 1 dmg.
            </li>
            <li>
              Burn ticks in upkeep; roll 5-6 afterwards to clear it, otherwise
              it persists.
            </li>
            <li>
              Evasive is consumed when used; a 5+ completely dodges the attack.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
