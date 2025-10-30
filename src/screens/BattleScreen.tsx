import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { PlayerAbilityList } from "../components/PlayerAbilityList";
import { PlayerPanel } from "../components/PlayerPanel";
import { PlayerActionPanel } from "../components/PlayerActionPanel";
import { CombatLogPanel } from "../components/CombatLogPanel";
import { OpponentAbilityList } from "../components/OpponentAbilityList";
import {
  GameController,
  useGameController,
  useGameData,
} from "../context/GameController";
import { useGame } from "../context/GameContext";
import DefaultBoard from "../assets/Default_Board.png";
import PyromancerBoard from "../assets/Pyromancer_Board.png";
import { DiceTrayOverlay } from "../components/DiceTrayOverlay";
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

type SettingsMenuProps = {
  onReset: () => void;
  onHeroSelect: () => void;
};

const SettingsMenu = ({ onReset, onHeroSelect }: SettingsMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleAction = (cb: () => void) => {
    cb();
    setOpen(false);
  };

  return (
    <div className={styles.settingsMenu} ref={menuRef}>
      <button
        type='button'
        className={styles.settingsButton}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup='true'
        aria-expanded={open}
        aria-label='Toggle settings menu'>
        {"\u2699"}
      </button>
      {open && (
        <div className={styles.settingsDropdown}>
          <button
            type='button'
            className={styles.settingsItem}
            onClick={() => handleAction(onReset)}>
            Reset Battle
          </button>
          <button
            type='button'
            className={styles.settingsItem}
            onClick={() => handleAction(onHeroSelect)}>
            Hero Select
          </button>
        </div>
      )}
    </div>
  );
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
        <div className={styles.main}>
          <div className={styles.boardColumn}>
            <div
              className={styles.boardWrap}
              style={{ backgroundImage: `url(${boardImage})` }}>
              <DiceTrayOverlay />
              <div className={styles.boardContent}>
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
                        <button
                          className='btn primary'
                          onClick={confirmInitialRoll}>
                          Start the battle
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <aside className={styles.utilityColumn}>
            <SettingsMenu
              onReset={handleReset}
              onHeroSelect={onBackToHeroSelect}
            />
            <div className={styles.utilityStack}>
              <div className={clsx(styles.utilityItem, styles.utilityItemLog)}>
                <CombatLogPanel />
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <div className={styles.boardColumn}>
          <div
            className={styles.boardWrap}
            style={{ backgroundImage: `url(${boardImage})` }}>
            <DiceTrayOverlay />
            <div className={styles.boardContent}>
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
                <div className={styles.boardSplit}>
                  <div className={clsx(styles.boardHalf, styles.opponentHalf)}>
                    <div className={styles.halfHeader}>
                      <span>Opponent</span>
                    </div>
                    <div className={styles.halfBody}>
                      <div className={styles.hudRow}>
                        <PlayerPanel side='ai' />
                      </div>
                      <div className={styles.abilityCenter}>
                        <OpponentAbilityList />
                      </div>
                    </div>
                  </div>
                  <div className={styles.turnRow}>
                    <div className={styles.turnMeta}>
                      <span className={styles.roundPill}>
                        Round {roundNumber}
                      </span>
                      <span className={styles.phasePill}>
                        {phaseLabelFor(phase)}
                      </span>
                      <span className={styles.turnSummary}>{turnSummary}</span>
                      <div className={styles.controlsRow}>
                        <PlayerActionPanel />
                      </div>
                    </div>
                  </div>
                  <div className={clsx(styles.boardHalf, styles.playerHalf)}>
                    <div className={styles.halfHeader}>
                      <span>You</span>
                    </div>
                    <div className={styles.halfBody}>
                      <div className={styles.hudRow}>
                        <PlayerPanel side='you' />
                      </div>
                      <div className={styles.abilityCenter}>
                        <PlayerAbilityList />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <aside className={styles.utilityColumn}>
          <SettingsMenu
            onReset={handleReset}
            onHeroSelect={onBackToHeroSelect}
          />
          <div className={styles.utilityStack}>
            <div className={clsx(styles.utilityItem, styles.utilityItemLog)}>
              <CombatLogPanel />
            </div>
          </div>
        </aside>
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
