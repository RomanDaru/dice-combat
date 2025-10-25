import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import AbilityList from "../components/AbilityList";
import { PlayerPanel } from "../components/PlayerPanel";
import { PlayerActionPanel } from "../components/PlayerActionPanel";
import { AiPreviewPanel } from "../components/AiPreviewPanel";
import { CombatLogPanel } from "../components/CombatLogPanel";
import { TipsPanel } from "../components/TipsPanel";
import { TurnIndicator } from "../components/TurnIndicator";
import Section from "../components/Section";
import { useGame } from "../context/GameContext";
import { useCombatLog } from "../hooks/useCombatLog";
import { useDiceAnimator } from "../hooks/useDiceAnimator";
import { useAiDiceAnimator } from "../hooks/useAiDiceAnimator";
import { useAiController } from "../hooks/useAiController";
import { useStatusManager } from "../hooks/useStatusManager";
import { useDefenseActions } from "../hooks/useDefenseActions";
import { useTurnController } from "../hooks/useTurnController";
import { bestAbility, detectCombos, rollDie } from "../game/combos";
import type { GameState } from "../game/state";
import type { Side } from "../game/types";

const DEF_DIE_INDEX = 2;
const ROLL_ANIM_MS = 1300;
const AI_ROLL_ANIM_MS = 900;
const AI_STEP_MS = 2000;

export function BattleScreen() {
  const { state, dispatch } = useGame();
  const stateRef = useRef<GameState>(state);

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
    fx,
  } = state;

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
  const readyForAI = useMemo(() => detectCombos(aiPreview.dice), [aiPreview.dice]);
  const isDefenseTurn = !!pendingAttack && pendingAttack.defender === "you";
  const statusActive = !!pendingStatusClear;
  const showDcLogo =
    turn === "you" && rollsLeft === 3 && !pendingAttack && !statusActive;

  const timersRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timersRef.current) {
        window.clearInterval(timersRef.current);
      }
    },
    []
  );

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

  const you = players.you;
  const ai = players.ai;
  const winner = you.hp <= 0 ? ai.hero.id : ai.hp <= 0 ? you.hero.id : null;

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
            <button className='btn' onClick={handleReset}>
              Reset
            </button>
          </div>

          <div className='row grid-2'>
            <PlayerPanel
              title={`You - ${you.hero.name}`}
              active={turn === "you"}
              player={you}
              shake={fx.shake.you}
              floatDamage={fx.floatDamage.you}
            />
            <PlayerPanel
              title={`Opponent - ${ai.hero.name} (AI)`}
              active={turn === "ai"}
              player={ai}
              shake={fx.shake.ai}
              floatDamage={fx.floatDamage.ai}
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
                <TurnIndicator turn={turn} />

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
                    aiEvasiveRoll={aiDefense.evasiveRoll}
                    aiDefenseRoll={aiDefense.defenseRoll}
                    aiDefenseSim={aiDefense.inProgress}
                    ability={ability}
                  />
                </div>

                <AiPreviewPanel
                  hero={ai.hero}
                  readyCombos={readyForAI as any}
                  dice={aiPreview.dice}
                  rolling={aiPreview.rolling}
                  held={aiPreview.held}
                />
              </div>
            )}
          </Section>
        </div>

        <CombatLogPanel entries={log} />
        <TipsPanel />
      </div>
    </div>
  );
}
