import React from "react";
import clsx from "clsx";
import Section from "./Section";
import HPBar from "./HPBar";
import TokenChips from "./TokenChips";
import DamageOverlay from "./DamageOverlay";
import { useGame } from "../context/GameContext";
import { useGameData } from "../context/GameController";
import styles from "./PlayerPanel.module.css";

type PlayerPanelProps = {
  side: "you" | "ai";
};

export function PlayerPanel({ side }: PlayerPanelProps) {
  const { state } = useGame();
  const { virtualTokens } = useGameData();
  const player = state.players[side];
  const shake = state.fx.shake[side];
  const floatDamage = state.fx.floatDamage[side];
  const impactActive = Boolean(floatDamage) && !shake;
  const active = state.turn === side;
  const title =
    side === "you"
      ? `You - ${player.hero.name}`
      : `Opponent - ${player.hero.name} (AI)`;
  const displayTokens =
    side === "you" ? virtualTokens.you ?? player.tokens : player.tokens;

  return (
    <Section title={title} active={active}>
      <div
        className={clsx(
          styles.panelContainer,
          shake && "shake-card",
          impactActive && styles.impactPop
        )}>
        <div className='row'>
          <HPBar hp={player.hp} max={player.hero.maxHp} />
          <div className={styles.statusRow}>
            <div className='label'>Statuses</div>
            <TokenChips tokens={displayTokens} />
          </div>
        </div>
        {floatDamage && (
          <div className={styles.floatOverlay}>
            <DamageOverlay val={floatDamage.val} kind={floatDamage.kind} />
          </div>
        )}
      </div>
    </Section>
  );
}
