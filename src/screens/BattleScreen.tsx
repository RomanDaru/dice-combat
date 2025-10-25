import React from "react";
import AbilityList from "../components/AbilityList";
import { PlayerPanel } from "../components/PlayerPanel";
import { PlayerActionPanel } from "../components/PlayerActionPanel";
import { AiPreviewPanel } from "../components/AiPreviewPanel";
import { CombatLogPanel } from "../components/CombatLogPanel";
import { TipsPanel } from "../components/TipsPanel";
import { TurnIndicator } from "../components/TurnIndicator";
import Section from "../components/Section";
import type { Ability, Phase, PlayerState, Side } from "../game/types";
import type {
  GameState,
  PendingStatusClear,
} from "../game/state";

type BattleScreenProps = {
  onReset: () => void;
  you: PlayerState;
  ai: PlayerState;
  turn: Side;
  winner: string | null;
  showDcLogo: boolean;
  phase: Phase;
  dice: number[];
  held: boolean[];
  rolling: boolean[];
  onToggleHold: (index: number) => void;
  defDieIndex: number;
  onRoll: () => void;
  onConfirmAttack: () => void;
  onEndTurnNoAttack: () => void;
  onUserDefenseRoll: () => void;
  onUserEvasiveRoll: () => void;
  rollsLeft: number;
  isDefenseTurn: boolean;
  statusActive: boolean;
  pendingStatusClear: PendingStatusClear;
  performStatusClearRoll: (side: Side) => void;
  ability: Ability | null;
  readyForActing: Record<string, boolean>;
  readyForAI: Record<string, boolean>;
  aiSimDice: number[];
  aiSimRolling: boolean;
  aiSimHeld: boolean[];
  aiDefenseSim: boolean;
  aiDefenseRoll: number | null;
  aiEvasiveRoll: number | null;
  floatDmgYou: GameState["fx"]["floatDamage"]["you"];
  floatDmgAi: GameState["fx"]["floatDamage"]["ai"];
  shakeYou: boolean;
  shakeAi: boolean;
  log: GameState["log"];
};

export function BattleScreen({
  onReset,
  you,
  ai,
  turn,
  winner,
  showDcLogo,
  phase,
  dice,
  held,
  rolling,
  onToggleHold,
  defDieIndex,
  onRoll,
  onConfirmAttack,
  onEndTurnNoAttack,
  onUserDefenseRoll,
  onUserEvasiveRoll,
  rollsLeft,
  isDefenseTurn,
  statusActive,
  pendingStatusClear,
  performStatusClearRoll,
  ability,
  readyForActing,
  readyForAI,
  aiSimDice,
  aiSimRolling,
  aiSimHeld,
  aiDefenseSim,
  aiDefenseRoll,
  aiEvasiveRoll,
  floatDmgYou,
  floatDmgAi,
  shakeYou,
  shakeAi,
  log,
}: BattleScreenProps) {
  return (
    <div className='container'>
      <div className='row'>
        <div className='row'>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
            <h1
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 20,
                fontWeight: 600,
              }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid #059669",
                  background: "rgba(4,120,87,.3)",
                  fontWeight: 700,
                }}>
                DC
              </span>{" "}
              Fantasy Dice Combat
            </h1>
            <button className='btn' onClick={onReset}>
              Reset
            </button>
          </div>

          <div className='row grid-2'>
            <PlayerPanel
              title={`You - ${you.hero.name}`}
              active={turn === "you"}
              player={you}
              shake={shakeYou}
              floatDamage={floatDmgYou}
            />
            <PlayerPanel
              title={`Opponent - ${ai.hero.name} (AI)`}
              active={turn === "ai"}
              player={ai}
              shake={shakeAi}
              floatDamage={floatDmgAi}
            />
          </div>

          <Section title={`Kolo: ${turn === "you" ? "Ty to" : "AI hraje"}`}>
            {winner ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  fontSize: 24,
                }}>
                Vaz: <b>{winner}</b>
              </div>
            ) : (
              <div className='row'>
                <TurnIndicator turn={turn} />

                <div className='row grid-2'>
                  <AbilityList
                    hero={you.hero}
                    title={`Tvoje schopnosti (${you.hero.name})`}
                    showReadyCombos={readyForActing as any}
                  />

                  <PlayerActionPanel
                    phase={phase}
                    dice={dice}
                    held={held}
                    rolling={rolling}
                    canInteract={turn === "you" && !isDefenseTurn && !statusActive}
                    onToggleHold={onToggleHold}
                    defIndex={defDieIndex}
                    showDcLogo={showDcLogo}
                    isDefensePhase={
                      isDefenseTurn || statusActive || phase === "defense"
                    }
                    statusActive={statusActive}
                    onRoll={onRoll}
                    onConfirmAttack={onConfirmAttack}
                    onEndTurnNoAttack={onEndTurnNoAttack}
                    onUserDefenseRoll={onUserDefenseRoll}
                    onUserEvasiveRoll={onUserEvasiveRoll}
                    rollsLeft={rollsLeft}
                    turn={turn}
                    isDefenseTurn={isDefenseTurn}
                    youHasEvasive={you.tokens.evasive > 0}
                    pendingStatusClear={pendingStatusClear}
                    performStatusClearRoll={performStatusClearRoll}
                    youHeroName={you.hero.name}
                    aiHeroName={ai.hero.name}
                    aiEvasiveRoll={aiEvasiveRoll}
                    aiDefenseRoll={aiDefenseRoll}
                    aiDefenseSim={aiDefenseSim}
                    ability={ability}
                  />
                </div>

                <AiPreviewPanel
                  hero={ai.hero}
                  readyCombos={readyForAI as any}
                  dice={aiSimDice}
                  rolling={aiSimRolling}
                  held={aiSimHeld}
                />
              </div>
            )}
          </Section>
        </div>

        <CombatLogPanel entries={log} />
        <TipsPanel />
      </div>
    </div>
  );
}

