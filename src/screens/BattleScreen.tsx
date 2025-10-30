import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { PlayerAbilityList } from "../components/PlayerAbilityList";
import { PlayerPanel } from "../components/PlayerPanel";
import { PlayerActionPanel } from "../components/PlayerActionPanel";
import { AiPreviewPanel } from "../components/AiPreviewPanel";
import { CombatLogPanel } from "../components/CombatLogPanel";
import { TipsPanel } from "../components/TipsPanel";
import { TurnIndicator } from "../components/TurnIndicator";
import {
  GameController,
  useGameController,
  useGameData,
} from "../context/GameController";
import { useGame } from "../context/GameContext";
import DefaultBoard from "../assets/Default_Board.png";
import PyromancerBoard from "../assets/Pyromancer_Board.png";
import styles from "./BattleScreen.module.css";

type BattleScreenProps = {
  onBackToHeroSelect: () => void;
};

const phaseLabelFor = (phase: string): string => {
  switch (phase) {
    case "upkeep":
      return "Upkeep Phase";
    case "roll":
      return "Roll Phase";
    case "attack":
      return "Attack Phase";
    case "defense":
      return "Defense Phase";
    case "end":
      return "End Phase";
    default:
      return "Standoff";
  }
};

const BattleContent = ({ onBackToHeroSelect }: BattleScreenProps) => {
  const { state } = useGame();
  const { handleReset, startInitialRoll, confirmInitialRoll } =
    useGameController();
  const { phase, initialRoll } = useGameData();
  const { players, turn, round } = state;
  const you = players.you;
  const ai = players.ai;
  const roundNumber = round <= 0 ? 1 : round;
  const turnSummary =
    turn === "you" ? `${you.hero.name} to act` : `${ai.hero.name} to act`;
  const winnerSide =
    you.hp <= 0 && ai.hp <= 0
      ? "draw"
      : you.hp <= 0
      ? ("ai" as const)
      : ai.hp <= 0
      ? ("you" as const)
      : null;
  const winnerName =
    winnerSide === "you"
      ? you.hero.name
      : winnerSide === "ai"
      ? ai.hero.name
      : null;

  const [displayRolls, setDisplayRolls] = useState<{
    you: number | null;
    ai: number | null;
  }>({ you: null, ai: null });
  const rollAnimRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== "standoff") {
      if (rollAnimRef.current) {
        window.clearInterval(rollAnimRef.current);
        rollAnimRef.current = null;
      }
      setDisplayRolls({ you: null, ai: null });
    }
  }, [phase]);

  useEffect(() => {
    if (!initialRoll.inProgress) {
      if (rollAnimRef.current) {
        window.clearInterval(rollAnimRef.current);
        rollAnimRef.current = null;
      }
      if (initialRoll.you !== null || initialRoll.ai !== null) {
        setDisplayRolls({
          you: initialRoll.you,
          ai: initialRoll.ai,
        });
      }
      return;
    }

    if (rollAnimRef.current) {
      window.clearInterval(rollAnimRef.current);
    }

    setDisplayRolls({
      you: 1 + Math.floor(Math.random() * 6),
      ai: 1 + Math.floor(Math.random() * 6),
    });

    rollAnimRef.current = window.setInterval(() => {
      setDisplayRolls({
        you: 1 + Math.floor(Math.random() * 6),
        ai: 1 + Math.floor(Math.random() * 6),
      });
    }, 120);

    return () => {
      if (rollAnimRef.current) {
        window.clearInterval(rollAnimRef.current);
        rollAnimRef.current = null;
      }
    };
  }, [
    initialRoll.ai,
    initialRoll.inProgress,
    initialRoll.tie,
    initialRoll.you,
  ]);

  useEffect(() => {
    return () => {
      if (rollAnimRef.current) {
        window.clearInterval(rollAnimRef.current);
        rollAnimRef.current = null;
      }
    };
  }, []);

  const standoffMessage = useMemo(() => {
    if (initialRoll.inProgress) {
      return "Rolling for initiative...";
    }
    if (initialRoll.awaitingConfirmation && initialRoll.winner) {
      return initialRoll.winner === "you"
        ? "You won the initiative. Confirm to begin the fight."
        : "The AI won the initiative. Brace for defense.";
    }
    if (initialRoll.tie) {
      return "It's a tie! Roll again.";
    }
    if (initialRoll.you !== null && initialRoll.ai !== null) {
      return `Result: You ${initialRoll.you} vs AI ${initialRoll.ai}.`;
    }
    return "Roll to see who starts.";
  }, [
    initialRoll.ai,
    initialRoll.awaitingConfirmation,
    initialRoll.inProgress,
    initialRoll.tie,
    initialRoll.winner,
    initialRoll.you,
  ]);

  const rollButtonDisabled =
    initialRoll.inProgress || initialRoll.awaitingConfirmation;
  const rollButtonLabel = initialRoll.inProgress
    ? "Rolling..."
    : initialRoll.tie
    ? "Roll again"
    : "Roll initiative";
  const showConfirm =
    !initialRoll.inProgress &&
    initialRoll.awaitingConfirmation &&
    initialRoll.winner !== null;

  const boardImage = useMemo(() => {
    const heroId = players.you?.hero?.id;
    if (heroId === "Pyromancer") {
      return PyromancerBoard;
    }
    return DefaultBoard;
  }, [players.you?.hero?.id]);

  if (phase === "standoff") {
    return (
      <div className={styles.root}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>
            <span className={styles.brandBadge}>DC</span> Fantasy Dice Combat
          </h1>
          <div className={styles.headerActions}>
            <button className='btn' onClick={handleReset}>
              Reset Battle
            </button>
            <button className='btn' onClick={onBackToHeroSelect}>
              Hero Select
            </button>
          </div>
        </div>

        <div className={styles.standoffShell}>
          <div className={styles.standoffCard}>
            <p>{standoffMessage}</p>
            <div className={styles.standoffDiceRow}>
              <div className={styles.diceColumn}>
                <span className='label'>You</span>
                <div
                  className={clsx(
                    styles.diceFace,
                    initialRoll.inProgress && styles.diceRolling
                  )}>
                  {displayRolls.you ?? "-"}
                </div>
              </div>
              <div className={styles.diceColumn}>
                <span className='label'>AI</span>
                <div
                  className={clsx(
                    styles.diceFace,
                    initialRoll.inProgress && styles.diceRolling
                  )}>
                  {displayRolls.ai ?? "-"}
                </div>
              </div>
            </div>
            <div className={styles.standoffActions}>
              <button
                className='btn success'
                onClick={startInitialRoll}
                disabled={rollButtonDisabled}>
                {rollButtonLabel}
              </button>
              {showConfirm && (
                <button className='btn primary' onClick={confirmInitialRoll}>
                  Start the battle
                </button>
              )}
              <button className='btn' onClick={handleReset}>
                Reset Battle
              </button>
            </div>
          </div>
        </div>

        <div className={styles.sidePanels}>
          <CombatLogPanel />
          <TipsPanel />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>
          <span className={styles.brandBadge}>DC</span> Fantasy Dice Combat
        </h1>
        <div className={styles.headerActions}>
          <button className='btn' onClick={handleReset}>
            Reset Battle
          </button>
          <button className='btn' onClick={onBackToHeroSelect}>
            Hero Select
          </button>
        </div>
      </div>

      <div className={styles.main}>
        <div
          className={styles.boardWrap}
          style={{ backgroundImage: `url(${boardImage})` }}>
          <div className={styles.boardContent}>
            <div className={styles.turnRow}>
              <TurnIndicator turn={turn} />
              <div className={styles.turnMeta}>
                <span className={styles.roundPill}>Round {roundNumber}</span>
                <span className={styles.phasePill}>
                  {phaseLabelFor(phase)}
                </span>
                <span className={styles.turnSummary}>{turnSummary}</span>
              </div>
            </div>

            {winnerName ? (
              <div className={styles.winnerBoard}>
                <h2>Winner: {winnerName}</h2>
                <div className={styles.winnerActions}>
                  <button className='btn success' onClick={handleReset}>
                    Play Again
                  </button>
                  <button className='btn' onClick={onBackToHeroSelect}>
                    Hero Select
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.boardGrid}>
                <div className={styles.hudColumn}>
                  <div className={clsx(styles.hudCard, styles.opponentCard)}>
                    <PlayerPanel side="ai" />
                  </div>
                  <div className={styles.hudCard}>
                    <AiPreviewPanel />
                  </div>
                  <div className={clsx(styles.hudCard, styles.playerCard)}>
                    <PlayerPanel side="you" />
                  </div>
                </div>
                <div className={styles.uiColumn}>
                  <PlayerActionPanel />
                  <PlayerAbilityList />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.sidePanels}>
          <CombatLogPanel />
          <TipsPanel />
        </div>
      </div>
    </div>
  );
};

export function BattleScreen({ onBackToHeroSelect }: BattleScreenProps) {
  return (
    <GameController>
      <BattleContent onBackToHeroSelect={onBackToHeroSelect} />
    </GameController>
  );
}
