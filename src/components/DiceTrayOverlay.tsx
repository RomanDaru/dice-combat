import React from "react";
import DiceGrid from "./DiceGrid";
import { useGame } from "../context/GameContext";
import { useGameData, useGameController } from "../context/GameController";
import styles from "./DiceTrayOverlay.module.css";

export function DiceTrayOverlay() {
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

  return (
    <div className={styles.overlay}>
      <div className={styles.tray}>
        <div className={styles.header}>
          <span>Dice Tray</span>
          <button className='btn' onClick={closeDiceTray}>
            Close
          </button>
        </div>
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
          />
        </div>
        <div className={styles.actions}>
          <button
            className='btn primary'
            onClick={onRoll}
            disabled={!canInteract || rollsLeft <= 0}>
            Roll ({rollsLeft})
          </button>
          <button className='btn' onClick={closeDiceTray}>
            Done
          </button>
        </div>
        <div className={styles.helper}>
          {canInteract
            ? "Tap dice to hold or release them before the next roll."
            : "Dice are locked while rolling or during defense."}
        </div>
      </div>
    </div>
  );
}
