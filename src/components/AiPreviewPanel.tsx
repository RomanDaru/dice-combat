import React, { type CSSProperties } from "react";
import clsx from "clsx";
import DiceGrid from "./DiceGrid";
import { useGame } from "../context/GameContext";
import styles from "./AiPreviewPanel.module.css";

type AiPreviewPanelProps = {
  trayImage?: string | null;
  diceImages?: (string | null | undefined)[];
};

export function AiPreviewPanel({ trayImage, diceImages }: AiPreviewPanelProps) {
  const { state } = useGame();
  const { aiPreview, aiDefense, dice: sharedDice } = state;

  const usingDefense =
    aiDefense.inProgress || (aiDefense.defenseDice && aiDefense.defenseDice.length > 0);

  const displayDice = usingDefense
    ? aiDefense.defenseDice ?? sharedDice
    : aiPreview.dice;
  const displayRolling = usingDefense ? aiDefense.inProgress : aiPreview.rolling;
  const displayHeld = usingDefense ? [false, false, false, false, false] : aiPreview.held;
  const style = trayImage
    ? ({ ["--tray-image" as const]: `url(${trayImage})` } as CSSProperties)
    : undefined;

  return (
    <div
      className={clsx(styles.preview, trayImage && styles.withImage)}
      style={style}>
      <div className={styles.content}>
        <DiceGrid
          dice={displayDice}
          held={displayHeld}
          rolling={displayRolling}
          canInteract={false}
          onToggleHold={() => {}}
          defIndex={-1}
          showDcLogo={false}
          isDefensePhase={false}
          statusActive={false}
          isAi={true}
          aiSimHeld={displayHeld}
          diceImages={diceImages}
        />
      </div>
    </div>
  );
}
