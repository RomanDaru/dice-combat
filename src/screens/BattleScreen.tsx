import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { PlayerAbilityList } from "../components/PlayerAbilityList";
import { PlayerPanel } from "../components/PlayerPanel";
import { PlayerActionPanel } from "../components/PlayerActionPanel";
import { CombatLogPanel } from "../components/CombatLogPanel";
import TurnProgress from "../components/TurnProgress";
import { OpponentAbilityList } from "../components/OpponentAbilityList";
import { AiPreviewPanel } from "../components/AiPreviewPanel";
import ArtButton from "../components/ArtButton";
import {
  GameController,
  useGameController,
  useGameData,
} from "../context/GameController";
import { useGame } from "../context/GameContext";
import TableBackground from "../assets/defualtTableBg.png";
import { getHeroSkin } from "../game/visuals";
import { DiceTrayOverlay } from "../components/DiceTrayOverlay";
import styles from "./BattleScreen.module.css";

type BattleScreenProps = {
  onBackToHeroSelect: () => void;
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
  const { handleReset, startInitialRoll, confirmInitialRoll, openDiceTray } =
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

  const youSkin = useMemo(() => getHeroSkin(you.hero.skin), [you.hero.skin]);
  const aiSkin = useMemo(() => getHeroSkin(ai.hero.skin), [ai.hero.skin]);

  const playerBoardImage =
    youSkin.boardHalf ?? youSkin.board ?? TableBackground;
  const opponentBoardImage =
    aiSkin.boardHalf ?? aiSkin.board ?? TableBackground;
  const playerTrayImage = youSkin.tray ?? youSkin.board ?? TableBackground;
  const opponentTrayImage = aiSkin.tray ?? aiSkin.board ?? TableBackground;
  const playerDiceFaces = youSkin.diceSet?.faces ?? undefined;
  const opponentDiceFaces = aiSkin.diceSet?.faces ?? undefined;
  const standoffContentClassName = clsx(
    styles.boardContent,
    styles.boardContentStandoff
  );
  const boardContentClassName = clsx(
    styles.boardContent,
    winnerName && styles.boardContentWinner
  );

  const renderStandoffDie = (
    label: string,
    value: number | null,
    faces?: (string | null | undefined)[]
  ) => {
    const faceValue = typeof value === "number" ? value : null;
    const imageSrc =
      faceValue && faceValue >= 1 && faceValue <= 6 && faces
        ? faces[faceValue - 1] ?? null
        : null;

    return (
      <div className={styles.diceColumn}>
        <span className='label'>{label}</span>
        <div
          className={clsx(
            styles.diceFace,
            initialRoll.inProgress && styles.diceRolling
          )}>
          {imageSrc ? (
            <>
              <img
                src={imageSrc}
                alt={`${label} die showing ${faceValue}`}
                className={styles.diceFaceImage}
                draggable={false}
              />
            </>
          ) : (
            <span className={styles.diceFaceValue}>
              {faceValue ?? "-"}
            </span>
          )}
        </div>
      </div>
    );
  };

  if (phase === "standoff") {
    return (
      <div className={styles.root}>
        <div className={styles.main}>
          <div className={styles.boardColumn}>
            <div
              className={styles.boardWrap}
              style={{ backgroundImage: `url(${TableBackground})` }}>
              <DiceTrayOverlay
                trayImage={playerTrayImage}
                diceImages={playerDiceFaces}
              />
              <div className={standoffContentClassName}>
                <div className={styles.standoffShell}>
                  <div className={styles.standoffCard}>
                    <p>{standoffMessage}</p>
                    <div className={styles.standoffDiceRow}>
                      {renderStandoffDie("You", displayRolls.you, playerDiceFaces)}
                      {renderStandoffDie("AI", displayRolls.ai, opponentDiceFaces)}
                    </div>
                    <div className={styles.standoffActions}>
                      <ArtButton
                        variant='medium'
                        onClick={startInitialRoll}
                        disabled={rollButtonDisabled}
                        className={styles.standoffButton}>
                        {rollButtonLabel}
                      </ArtButton>
                      {showConfirm && (
                        <ArtButton
                          variant='medium'
                          onClick={confirmInitialRoll}
                          className={styles.standoffButton}>
                          Start the battle
                        </ArtButton>
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
            style={{ backgroundImage: `url(${TableBackground})` }}>
            <DiceTrayOverlay
              trayImage={playerTrayImage}
              diceImages={playerDiceFaces}
            />
            <div className={boardContentClassName}>
              {winnerName ? (
                <div className={styles.winnerBoard}>
                  <h2>Winner: {winnerName}</h2>
                  <div className={styles.winnerActions}>
                    <ArtButton
                      variant='medium'
                      onClick={handleReset}
                      className={styles.winnerButton}>
                      Play Again
                    </ArtButton>
                    <ArtButton
                      variant='medium'
                      onClick={onBackToHeroSelect}
                      className={styles.winnerButton}>
                      Hero Select
                    </ArtButton>
                  </div>
                </div>
              ) : (
                <div className={styles.boardSplit}>
                  <section
                    className={clsx(styles.boardHalf, styles.opponentHalf)}
                    style={{ backgroundImage: `url(${opponentBoardImage})` }}>
                    <div className={styles.halfBody}>
                      <div className={styles.opponentBoardRow}>
                        <div className={styles.opponentAbilities}>
                          <OpponentAbilityList />
                        </div>
                        <div className={styles.opponentTray}>
                          <AiPreviewPanel
                            trayImage={opponentTrayImage}
                            diceImages={opponentDiceFaces}
                          />
                        </div>
                        <div className={styles.opponentHud}>
                          <PlayerPanel side='ai' />
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className={styles.turnRow}>
                    <div className={styles.turnMeta}>
                      <span
                        className={styles.roundPill}
                        title={turnSummary}
                        aria-label={`Round ${roundNumber}. ${turnSummary}`}>
                        Round {roundNumber}
                      </span>
                      <div className={styles.turnProgressWrap}>
                        <TurnProgress phase={phase} />
                      </div>
                    </div>
                  </div>

                  <section
                    className={clsx(styles.boardHalf, styles.playerHalf)}
                    style={{ backgroundImage: `url(${playerBoardImage})` }}>
                    <div className={styles.halfBody}>
                      <div className={styles.playerBoardRow}>
                        <div className={styles.playerAbilities}>
                          <PlayerAbilityList />
                        </div>
                        <div
                          className={styles.playerTray}
                          style={{
                            backgroundImage: `url(${playerTrayImage})`,
                          }}
                          role='button'
                          tabIndex={0}
                          onClick={openDiceTray}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openDiceTray();
                            }
                          }}
                          aria-label='Open dice tray'>
                          <div className={styles.playerTrayInner}>
                            <PlayerActionPanel />
                          </div>
                        </div>
                        <div className={styles.playerHud}>
                          <PlayerPanel side='you' />
                        </div>
                      </div>
                    </div>
                  </section>
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
