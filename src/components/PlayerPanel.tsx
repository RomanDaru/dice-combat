import React from "react";
import Section from "./Section";
import HPBar from "./HPBar";
import TokenChips from "./TokenChips";
import DamageOverlay from "./DamageOverlay";
import type { PlayerState, Side } from "../game/types";
import type { GameState } from "../game/state";

type PlayerPanelProps = {
  title: string;
  active: boolean;
  player: PlayerState;
  shake: boolean;
  floatDamage: GameState["fx"]["floatDamage"][Side];
};

export function PlayerPanel({
  title,
  active,
  player,
  shake,
  floatDamage,
}: PlayerPanelProps) {
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

