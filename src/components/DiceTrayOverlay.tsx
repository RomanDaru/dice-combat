import React from "react";
import DiceGrid from "./DiceGrid";
import ArtButton from "./ArtButton";
import { useGame } from "../context/GameContext";
import { useGameData, useGameController } from "../context/GameController";
import styles from "./DiceTrayOverlay.module.css";

type DiceTrayOverlayProps = {
  trayImage?: string | null;
  diceImages?: (string | null | undefined)[];
};

export function DiceTrayOverlay({ trayImage, diceImages }: DiceTrayOverlayProps) {
  const { state } = useGame();
  const {
    diceTrayVisible,
    isDefenseTurn,
    statusActive,
    defenseDieIndex,
  } = useGameData();
  const { onToggleHold, onRoll, closeDiceTray } = useGameController();
  const { dice, held, rolling, turn, rollsLeft } = state;

  if (!diceTrayVisible) return null;

  const isRolling = Array.isArray(rolling)
    ? rolling.some(Boolean)
    : Boolean(rolling);
  const canInteract =
    turn === "you" && !statusActive && !isDefenseTurn && !isRolling;
  const showRollAction = !isDefenseTurn && rollsLeft > 0;

  return (
    <div className={styles.overlay}>
      <div
        className={styles.tray}
        style={
          trayImage
            ? {
                backgroundImage: `url(${trayImage})`,
              }
            : undefined
        }>
        <div className={styles.trayContent}>
          <div className={styles.header}>
            <span>Dice Tray</span>
            <ArtButton
              variant='square'
              className={styles.closeButton}
              onClick={closeDiceTray}
              aria-label='Close dice tray'>
              ✕
            </ArtButton>
          </div>
          <div className={styles.trayBody}>
            <div className={styles.diceWrapper}>
              <DiceGrid
                dice={dice}
                held={held}
                rolling={rolling}
                canInteract={canInteract}
                onToggleHold={onToggleHold}
                defIndex={defenseDieIndex}
                showDcLogo={false}
                isDefensePhase={isDefenseTurn}
                statusActive={statusActive}
                diceImages={diceImages}
              />
            </div>
            <div className={styles.actions}>
              {showRollAction && (
                <ArtButton
                  variant='medium'
                  className={styles.actionButton}
                  onClick={onRoll}
                  disabled={!canInteract}>
                  Roll ({rollsLeft})
                </ArtButton>
              )}
              <ArtButton
                variant='medium'
                className={styles.actionButton}
                onClick={closeDiceTray}>
                Select Attack
              </ArtButton>
            </div>
            <div className={styles.helper}>
              {canInteract
                ? "Tap dice to hold or release them before the next roll."
                : isDefenseTurn
                  ? "Defense result locked. Check highlighted abilities to see what triggered."
                  : "Dice are locked while rolling or during defense."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
