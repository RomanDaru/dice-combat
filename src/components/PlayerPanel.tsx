import React, { useMemo } from "react";
import clsx from "clsx";
import Section from "./Section";
import HPBar from "./HPBar";
import TokenChips from "./TokenChips";
import DamageOverlay from "./DamageOverlay";
import { useGame } from "../context/GameContext";
import { useGameController } from "../context/GameController";
import { getStacks, setStacks, type StatusId } from "../engine/status";
import styles from "./PlayerPanel.module.css";

type PlayerPanelProps = {
  side: "you" | "ai";
};

export function PlayerPanel({ side }: PlayerPanelProps) {
  const { state } = useGame();
  const { attackStatusRequests, defenseStatusRequests } = useGameController();
  const player = state.players[side];
  const shake = state.fx.shake[side];
  const floatDamage = state.fx.floatDamage[side];
  const impactActive = Boolean(floatDamage) && !shake;
  const active = state.turn === side;
  const title =
    side === "you"
      ? `You - ${player.hero.name}`
      : `Opponent - ${player.hero.name} (AI)`;
  const displayTokens = useMemo(() => {
    if (side !== "you") {
      return player.tokens;
    }
    let adjusted = player.tokens;
    const applyRequest = (requests: Record<StatusId, number>) => {
      Object.entries(requests).forEach(([rawId, amount]) => {
        if (amount <= 0) return;
        const statusId = rawId as StatusId;
        const current = getStacks(adjusted, statusId, 0);
        if (current <= 0) return;
        const nextValue = Math.max(0, current - amount);
        adjusted = setStacks(adjusted, statusId, nextValue);
      });
    };
    applyRequest(attackStatusRequests);
    applyRequest(defenseStatusRequests);
    return adjusted;
  }, [attackStatusRequests, defenseStatusRequests, player.tokens, side]);

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
