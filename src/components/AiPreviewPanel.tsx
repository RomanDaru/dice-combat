import React from "react";
import DiceGrid from "./DiceGrid";
import { useGame } from "../context/GameContext";
import styles from "./AiPreviewPanel.module.css";

export function AiPreviewPanel() {
  const { state } = useGame();
  const { dice, rolling, held } = state.aiPreview;

  return (
    <div className={styles.preview}>
      <div className={styles.header}>AI Preview</div>
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
      />
      <div className={styles.infoText}>
        AI abilities highlight according to this preview roll sequence.
      </div>
    </div>
  );
}
