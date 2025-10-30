import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { PlayerAbilityList } from "../components/PlayerAbilityList";
import { PlayerPanel } from "../components/PlayerPanel";
import { PlayerActionPanel } from "../components/PlayerActionPanel";
import { AiPreviewPanel } from "../components/AiPreviewPanel";
import { CombatLogPanel } from "../components/CombatLogPanel";
import { TipsPanel } from "../components/TipsPanel";
import { TurnIndicator } from "../components/TurnIndicator";
import Section from "../components/Section";
import {
  GameController,
  useGameController,
  useGameData,
} from "../context/GameController";
import { useGame } from "../context/GameContext";
import styles from "./BattleScreen.module.css";

type BattleScreenProps = {
  onBackToHeroSelect: () => void;
};

const BattleContent = ({ onBackToHeroSelect }: BattleScreenProps) => {
  const { state } = useGame();
  const { handleReset, startInitialRoll, confirmInitialRoll } =
    useGameController();
  const { phase, initialRoll } = useGameData();
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
      return "Hádzanie o iniciatívu prebieha...";
    }
    if (initialRoll.awaitingConfirmation && initialRoll.winner) {
      return initialRoll.winner === "you"
        ? "Vyhrávaš iniciatívu – začínaš ty."
        : "AI získala iniciatívu – priprav sa na obranu.";
    }
    if (initialRoll.tie) {
      return "Remíza! Hodíte si ešte raz.";
    }
    if (initialRoll.you !== null && initialRoll.ai !== null) {
      return `Výsledok: Ty ${initialRoll.you} vs AI ${initialRoll.ai}.`;
    }
    return "Hoď kockou o iniciatívu. Vyšší hod začne bitku.";
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
    ? "Hoď znova"
    : "Hoď o iniciatívu";
  const showConfirm =
    !initialRoll.inProgress &&
    initialRoll.awaitingConfirmation &&
    initialRoll.winner !== null;

  const { players, turn } = state;
  const you = players.you;
  const ai = players.ai;
  const winner = you.hp <= 0 ? ai.hero.id : ai.hp <= 0 ? you.hero.id : null;

  if (phase === "standoff") {
    const { inProgress, you: youRoll, ai: aiRoll, tie } = initialRoll;
    return (
      <div className='container'>
        <div className='row'>
          <div className='row'>
            <div className={styles.headerRow}>
              <h1 className={styles.title}>
                <span className={styles.brandBadge}>DC</span>{" "}
                Fantasy Dice Combat
              </h1>
              <button className='btn' onClick={onBackToHeroSelect}>
                Back to Hero Select
              </button>
            </div>
            <Section title='Roll for Initiative'>
              <div className={styles.standoffLayout}>
                <p>{standoffMessage}</p>
                <div className={styles.standoffDiceRow}>
                  <div className={styles.diceColumn}>
                    <span className='label'>Ty</span>
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
                      Začať bitku
                    </button>
                  )}
                  <button className='btn' onClick={handleReset}>
                    Reset Battle
                  </button>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='container'>
      <div className='row'>
        <div className='row'>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>
              <span className={styles.brandBadge}>
                DC
              </span>{" "}
              Fantasy Dice Combat
            </h1>
            <button className='btn' onClick={handleReset}>
              Reset
            </button>
          </div>

          <div className='row grid-2'>
            <PlayerPanel side="you" />
            <PlayerPanel side="ai" />
          </div>

          <Section title={`Kolo: ${turn === "you" ? "Ty to" : "AI hraje"}`}>
            {winner ? (
              <div className={styles.winnerMessage}>
                Vitaz: <b>{winner}</b>
                <div className={styles.winnerActions}>
                  <button className='btn success' onClick={handleReset}>
                    Play Again
                  </button>
                  <button className='btn' onClick={onBackToHeroSelect}>
                    Back to Hero Select
                  </button>
                </div>
              </div>
            ) : (
              <div className='row'>
                <TurnIndicator turn={turn} />

                <div className='row grid-2'>
                  <PlayerAbilityList />

                  <PlayerActionPanel />
                </div>

                <AiPreviewPanel />
              </div>
            )}
          </Section>
        </div>

        <CombatLogPanel />
        <TipsPanel />
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
