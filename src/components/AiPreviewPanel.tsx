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
  const { dice, rolling, held } = state.aiPreview;
  const style = trayImage
    ? ({ ["--tray-image" as const]: `url(${trayImage})` } as CSSProperties)
    : undefined;

  return (
    <div
      className={clsx(styles.preview, trayImage && styles.withImage)}
      style={style}>
      <div className={styles.content}>
        <DiceGrid
          dice={dice}
          held={[]}
          rolling={rolling}
          canInteract={false}
          onToggleHold={() => {}}
          defIndex={-1}
          showDcLogo={false}
          isDefensePhase={false}
          statusActive={false}
          isAi={true}
          aiSimHeld={held}
          diceImages={diceImages}
        />
      </div>
    </div>
  );
}
