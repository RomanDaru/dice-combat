import React from "react";
import AbilityList from "./AbilityList";
import DiceGrid from "./DiceGrid";
import { useGame } from "../context/GameContext";

export function AiPreviewPanel() {
  const { state } = useGame();
  const { dice, rolling, held } = state.aiPreview;

  return (
    <div className='row grid-2'>
      <AbilityList side="ai" />
      <div className='row'>
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
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          AI abilities highlight according to this preview roll sequence.
        </div>
      </div>
    </div>
  );
}
