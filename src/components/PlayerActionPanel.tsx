import React, { useEffect, useRef } from "react";
import clsx from "clsx";
import { useGame } from "../context/GameContext";
import { useGameController, useGameData } from "../context/GameController";
import { useCombatLog, indentLog } from "../hooks/useCombatLog";
import { getHeroSkin } from "../game/visuals";
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
    aiDefense,
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

  const statusCard = statusActive && pendingStatusClear && (
    <div className={clsx("card", styles.statusCard)}>
      <div className={styles.statusHeader}>
        <span className='badge indigo'>
          {pendingStatusClear.side === "you" ? you.hero.name : ai.hero.name}
        </span>
        <span>Burn stacks: {pendingStatusClear.stacks}</span>
      </div>
      <div className={styles.statusActions}>
        {pendingStatusClear.side === "you" ? (
          <button
            className='btn success'
            onClick={handleStatusRoll}
            disabled={impactLocked}>
            Status Roll
          </button>
        ) : (
          <div className={styles.statusInfoColumn}>
            <div className={styles.statusInfoText}>
              {pendingStatusClear.rolling
                ? "AI is rolling..."
                : "AI will roll automatically."}
            </div>
          </div>
        )}
        {pendingStatusClear.roll !== undefined && (
          <div className={styles.statusRollText}>
            Roll: <b>{pendingStatusClear.roll}</b>{" "}
            {pendingStatusClear.success ? "-> Burn cleared" : "-> Burn sticks"}
          </div>
        )}
      </div>
    </div>
  );

  const aiEvasiveRoll = aiDefense.evasiveRoll;
  const aiDefenseDice = aiDefense.defenseDice;
  const aiDefenseCombo = aiDefense.defenseCombo;
  const aiDefenseBlock = aiDefense.defenseRoll;
  const aiDefenseSim =
    aiDefense.inProgress || !!aiDefenseDice || aiEvasiveRoll !== null;

  const defenseIndicators = aiDefenseSim && (
    <div className={styles.defenseIndicators}>
      {aiEvasiveRoll !== null && (
        <div className='badge indigo'>
          AI Evasive Roll: <b>{aiEvasiveRoll}</b>
        </div>
      )}
      {aiDefenseDice && (
        <div className='badge indigo'>
          AI Defense Roll: <b>{aiDefenseDice.join(" ")}</b>
        </div>
      )}
      {aiDefenseCombo && (
        <div className='badge indigo'>
          AI Defense Combo: <b>{aiDefenseCombo}</b>
        </div>
      )}
      {aiDefenseBlock !== null && (
        <div className='badge indigo'>
          AI Blocks: <b>{aiDefenseBlock}</b>
        </div>
      )}
      {!aiDefenseDice && aiEvasiveRoll === null && (
        <div>AI defense in progress...</div>
      )}
    </div>
  );

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
        <span className={styles.dicePreviewLabel}>Rolls left: {rollsLeft}</span>
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
        <span className={styles.dicePreviewHint}>Tap to roll / open</span>
      </div>
      {statusCard}
      {defenseIndicators}
    </div>
  );
}
