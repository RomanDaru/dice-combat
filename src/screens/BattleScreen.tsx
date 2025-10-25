import React from "react";
import AbilityList from "../components/AbilityList";
import { PlayerPanel } from "../components/PlayerPanel";
import { PlayerActionPanel } from "../components/PlayerActionPanel";
import { AiPreviewPanel } from "../components/AiPreviewPanel";
import { CombatLogPanel } from "../components/CombatLogPanel";
import { TipsPanel } from "../components/TipsPanel";
import { TurnIndicator } from "../components/TurnIndicator";
import Section from "../components/Section";
import { GameController, useGameController } from "../context/GameController";
import { useGame } from "../context/GameContext";

const BattleContent = () => {
  const { state } = useGame();
  const { handleReset } = useGameController();

  const { players, turn, aiPreview } = state;
  const you = players.you;
  const ai = players.ai;
  const winner = you.hp <= 0 ? ai.hero.id : ai.hp <= 0 ? you.hero.id : null;

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
            <button className='btn' onClick={handleReset}>
              Reset
            </button>
          </div>

          <div className='row grid-2'>
            <PlayerPanel side="you" />
            <PlayerPanel side="ai" />
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
                  <AbilityList side="you" />

                  <PlayerActionPanel />
                </div>

                <AiPreviewPanel
                  hero={ai.hero}
                  readyCombos={readyForAI as any}
                  dice={aiPreview.dice}
                  rolling={aiPreview.rolling}
                  held={aiPreview.held}
                />
              </div>
            )}
          </Section>
        </div>

        <CombatLogPanel />
        <TipsPanel />
      </div>
    </div>
  );
};

export function BattleScreen() {
  return (
    <GameController>
      <BattleContent />
    </GameController>
  );
}
