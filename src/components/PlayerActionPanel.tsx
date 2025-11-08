import React, { useEffect, useRef } from "react";
import clsx from "clsx";
import { useGame } from "../context/GameContext";
import { useGameController, useGameData } from "../context/GameController";
import { useCombatLog, indentLog } from "../hooks/useCombatLog";
import { getHeroSkin } from "../game/visuals";
import { getStatus } from "../engine/status";
import styles from "./PlayerActionPanel.module.css";

export function PlayerActionPanel() {
  const { state } = useGame();
  const { performStatusClearRoll, openDiceTray } = useGameController();
  const { statusActive, isDefenseTurn, diceTrayVisible, impactLocked } =
    useGameData();
  const { pushLog } = useCombatLog();
  const lastThreatLog = useRef<string | null>(null);

  const {
    players,
    turn,
    dice,
    held,
    rolling,
    rollsLeft,
    pendingAttack,
    pendingStatusClear,
  } = state;

  const you = players.you;
  const ai = players.ai;

  const youSkin = getHeroSkin(you.hero.skin);
  const dicePreviewFaces = youSkin.diceSet?.faces ?? null;

  const previewDisabled = impactLocked || rolling.some(Boolean);

  const incomingAttack = isDefenseTurn && pendingAttack ? pendingAttack : null;
  const incomingAbility = incomingAttack?.ability ?? null;
  const threatenedDamage = incomingAbility?.damage ?? null;
  const incomingStatusSpends = incomingAttack?.modifiers?.statusSpends ?? [];
  const attackChiSummary = incomingStatusSpends.find(
    (spend) => spend.id === "chi"
  );
  const attackChiStacks = attackChiSummary?.stacksSpent ?? 0;
  const attackChiBonusDamage = attackChiSummary?.bonusDamage ?? 0;
  const attackerHero =
    incomingAttack && players[incomingAttack.attacker]
      ? players[incomingAttack.attacker].hero
      : null;

  useEffect(() => {
    if (!incomingAttack || !incomingAbility) {
      lastThreatLog.current = null;
      return;
    }

    const attackerName =
      attackerHero?.name ??
      (incomingAttack.attacker === "you" ? "You" : "Opponent");
    const abilityName =
      incomingAbility.displayName ??
      incomingAbility.label ??
      incomingAbility.combo;
    const threatened = threatenedDamage ?? 0;
    const chiText =
      attackChiStacks > 0
        ? `, Chi x${attackChiStacks} (+${attackChiBonusDamage} dmg)`
        : "";
    const logLine = `[Threat] ${attackerName} threatens ${threatened} dmg (${abilityName}${chiText}).`;

    if (lastThreatLog.current !== logLine) {
      pushLog(indentLog(logLine));
      lastThreatLog.current = logLine;
    }
  }, [
    incomingAttack,
    incomingAbility,
    attackerHero?.name,
    attackChiStacks,
    attackChiBonusDamage,
    threatenedDamage,
    pushLog,
  ]);

  const defenseIndicators = null;

  const handleOpenTray = (
    event?: React.SyntheticEvent<HTMLDivElement | HTMLButtonElement>
  ) => {
    event?.stopPropagation();
    if (previewDisabled && !diceTrayVisible) return;
    openDiceTray();
  };

  const handleStatusRoll = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    event.stopPropagation();
    performStatusClearRoll("you");
  };

  const statusCard =
    statusActive &&
    pendingStatusClear && (
      <div className={clsx("card", styles.statusCard)}>
        <div className={styles.statusHeader}>
          <span className='badge indigo'>
            {pendingStatusClear.side === "you" ? you.hero.name : ai.hero.name}
          </span>
          {(() => {
            const targetDef = getStatus(pendingStatusClear.status);
            const sourceDef = pendingStatusClear.sourceStatus
              ? getStatus(pendingStatusClear.sourceStatus)
              : null;
            const mode = pendingStatusClear.action ?? "cleanse";
            const targetName = targetDef?.name ?? pendingStatusClear.status;
            const sourceName = sourceDef?.name ?? "Status";
            return mode === "transfer" ? (
              <span>
                {sourceName}: {targetName} ({pendingStatusClear.stacks} stack
                {pendingStatusClear.stacks === 1 ? "" : "s"})
              </span>
            ) : (
              <span>
                {targetName} stacks: {pendingStatusClear.stacks}
              </span>
            );
          })()}
        </div>
        <div className={styles.statusActions}>
          {pendingStatusClear.side === "you" ? (
            <button
              className='btn success'
              onClick={handleStatusRoll}
              disabled={impactLocked}>
              {pendingStatusClear.action === "transfer"
                ? "Attempt Transfer"
                : "Status Roll"}
            </button>
          ) : (
            <div className={styles.statusInfoColumn}>
              <div className={styles.statusInfoText}>
                {pendingStatusClear.rolling
                  ? "AI is rolling..."
                  : pendingStatusClear.action === "transfer"
                  ? "AI will attempt a transfer."
                  : "AI will roll automatically."}
              </div>
            </div>
          )}
          {pendingStatusClear.roll !== undefined && (
            <div className={styles.statusRollText}>
              Roll: <b>{pendingStatusClear.roll}</b>{" "}
              {pendingStatusClear.success
                ? pendingStatusClear.action === "transfer"
                  ? "-> Transfer success"
                  : "-> Cleansed"
                : pendingStatusClear.action === "transfer"
                ? "-> Transfer failed"
                : "-> Status sticks"}
            </div>
          )}
        </div>
      </div>
    );

  const previewLabel = isDefenseTurn
    ? "Roll For Defense"
    : `Rolls left: ${rollsLeft}`;
  const previewHint = isDefenseTurn
    ? "Open the tray to roll your defense dice."
    : "Tap dice to hold or release them before the next roll.";

  return (
    <div className={styles.panel} onClick={handleOpenTray}>
      <div
        className={clsx(
          styles.dicePreviewPanel,
          diceTrayVisible && styles.dicePreviewPanelActive,
          previewDisabled && styles.dicePreviewPanelDisabled
        )}
        role='presentation'
        aria-hidden='true'>
        <span className={styles.dicePreviewLabel}>{previewLabel}</span>
        <div className={styles.dicePreviewFaces}>
          {dice.map((value, index) => {
            const dieClass = clsx(styles.dicePreviewDie, {
              [styles.dicePreviewDieHeld]: held[index],
              [styles.dicePreviewDieRolling]: rolling[index],
            });
            const faceImage =
              typeof value === "number" && value >= 1 && value <= 6
                ? dicePreviewFaces?.[value - 1] ?? null
                : null;
            return (
              <span
                key={index}
                className={dieClass}
                aria-label={`Die ${index + 1}: ${value}${
                  held[index] ? " held" : ""
                }${rolling[index] ? " rolling" : ""}`}>
                {faceImage ? (
                  <img
                    src={faceImage}
                    alt={`Die face ${value}`}
                    className={styles.dicePreviewDieImage}
                    draggable={false}
                  />
                ) : (
                  <span className={styles.dicePreviewValue}>{value}</span>
                )}
              </span>
            );
          })}
        </div>
        <span className={styles.dicePreviewHint}>{previewHint}</span>
      </div>
      {statusCard}
      {defenseIndicators}
    </div>
  );
}
