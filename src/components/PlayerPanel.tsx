import React from "react";
import Section from "./Section";
import HPBar from "./HPBar";
import TokenChips from "./TokenChips";
import DamageOverlay from "./DamageOverlay";
import { useGame } from "../context/GameContext";
import type { Side } from "../game/types";

type PlayerPanelProps = {
  side: Side;
};

export function PlayerPanel({ side }: PlayerPanelProps) {
  const { state } = useGame();
  const player = state.players[side];
  const shake = state.fx.shake[side];
  const floatDamage = state.fx.floatDamage[side];
  const active = state.turn === side;
  const title =
    side === "you"
      ? `You - ${player.hero.name}`
      : `Opponent - ${player.hero.name} (AI)`;

  return (
    <Section title={title} active={active}>
      <div
        className={shake ? "shake-card" : ""}
        style={{ position: "relative" }}>
        <div className='row'>
          <HPBar hp={player.hp} max={player.hero.maxHp} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
            <div className='label'>Statuses</div>
            <TokenChips tokens={player.tokens} />
          </div>
        </div>
        {floatDamage && (
          <div
            style={{
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
            <DamageOverlay val={floatDamage.val} kind={floatDamage.kind} />
          </div>
        )}
      </div>
    </Section>
  );
}
