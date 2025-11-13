import React, { useMemo } from "react";
import clsx from "clsx";
import Section from "./Section";
import HPBar from "./HPBar";
import TokenChips from "./TokenChips";
import DamageOverlay from "./DamageOverlay";
import { useGame } from "../context/GameContext";
import { useGameData } from "../context/GameController";
import { DefenseSchemaPanel } from "./DefenseSchemaPanel";
import { getStatus } from "../engine/status";
import type { StatusTimingPhase } from "../engine/status/types";
import styles from "./PlayerPanel.module.css";

type PlayerPanelProps = {
  side: "you" | "ai";
};

export function PlayerPanel({ side }: PlayerPanelProps) {
  const { state } = useGame();
  const {
    pendingDefenseBuffs,
    defenseBuffExpirations,
    defenseRoll,
  } = useGameData();
  const player = state.players[side];
  const shake = state.fx.shake[side];
  const floatDamage = state.fx.floatDamage[side];
  const impactActive = Boolean(floatDamage) && !shake;
  const active = state.turn === side;
  const title =
    side === "you"
      ? `You - ${player.hero.name}`
      : `Opponent - ${player.hero.name} (AI)`;

  const formatPhase = (phase: StatusTimingPhase | undefined) => {
    if (!phase) return "—";
    return phase
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/:/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const ownedPendingBuffs = useMemo(
    () =>
      pendingDefenseBuffs
        .filter((buff) => buff.owner === side)
        .map((buff) => {
          const status = getStatus(buff.statusId);
          return {
            ...buff,
            displayName: status?.name ?? buff.statusId,
          };
        }),
    [pendingDefenseBuffs, side]
  );

  const ownedRecentExpirations = useMemo(
    () =>
      defenseBuffExpirations
        .filter((buff) => buff.owner === side)
        .slice(-3)
        .reverse(),
    [defenseBuffExpirations, side]
  );

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
            <TokenChips tokens={player.tokens} />
          </div>
        </div>
        {ownedPendingBuffs.length > 0 && (
          <div className={styles.defenseBuffSection}>
            <div className={styles.defenseBuffHeader}>Defense Buffs</div>
            <ul className={styles.defenseBuffList}>
              {ownedPendingBuffs.map((buff) => (
                <li key={buff.id} className={styles.defenseBuffItem}>
                  <span className={styles.defenseBuffName}>
                    {buff.displayName}
                  </span>
                  <span className={styles.defenseBuffMeta}>
                    x{buff.stacks} · Ready: {formatPhase(buff.usablePhase)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {ownedRecentExpirations.length > 0 && (
          <div className={styles.defenseBuffSection}>
            <div className={styles.defenseBuffHeader}>
              Expired Defense Buffs
            </div>
            <ul className={styles.defenseBuffList}>
              {ownedRecentExpirations.map((buff) => {
                const status = getStatus(buff.statusId);
                return (
                  <li key={`${buff.id}-expired`} className={styles.defenseBuffItem}>
                    <span className={styles.defenseBuffName}>
                      {status?.name ?? buff.statusId}
                    </span>
                    <span className={styles.defenseBuffMeta}>
                      {buff.reason} · {buff.expiredAt.cause === "ko" ? "KO" : formatPhase(buff.expiredAt.phase)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {floatDamage && (
          <div className={styles.floatOverlay}>
            <DamageOverlay val={floatDamage.val} kind={floatDamage.kind} />
          </div>
        )}
        <DefenseSchemaPanel hero={player.hero} activeSchema={defenseRoll?.schema ?? null} />
      </div>
    </Section>
  );
}
