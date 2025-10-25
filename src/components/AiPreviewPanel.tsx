import React from "react";
import AbilityList from "./AbilityList";
import DiceGrid from "./DiceGrid";
import type { Hero } from "../game/types";
import type { Combo } from "../game/types";

type ReadyCombos = Record<Combo, boolean> | Record<string, boolean>;

type AiPreviewPanelProps = {
  hero: Hero;
  readyCombos: ReadyCombos;
  dice: number[];
  rolling: boolean;
  held: boolean[];
};

export function AiPreviewPanel({
  hero,
  readyCombos,
  dice,
  rolling,
  held,
}: AiPreviewPanelProps) {
  return (
    <div className='row grid-2'>
      <AbilityList
        hero={hero}
        title={`Opponent Abilities (${hero.name})`}
        showReadyCombos={readyCombos as Record<Combo, boolean>}
      />
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

