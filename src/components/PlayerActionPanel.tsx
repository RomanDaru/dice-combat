import React from "react";
import clsx from "clsx";
import TurnProgress from "./TurnProgress";
import DiceGrid from "./DiceGrid";
import { useGame } from "../context/GameContext";
import { useGameController, useGameData } from "../context/GameController";
import styles from "./PlayerActionPanel.module.css";

export function PlayerActionPanel() {
  const { state } = useGame();
  const {
    onRoll,
    onToggleHold,
    onConfirmAttack,
    onEndTurnNoAttack,
    onUserDefenseRoll,
    performStatusClearRoll,
    activeAbilities,
    onPerformActiveAbility,
    attackChiSpend,
    defenseChiSpend,
    setAttackChiSpend,
    setDefenseChiSpend,
  } = useGameController();
  const {
    statusActive,
    isDefenseTurn,
    showDcLogo,
    ability,
    defenseDieIndex,
  } = useGameData();

  const {
    phase,
    dice,
    held,
    rolling,
    rollsLeft,
    turn,
    pendingAttack,
    pendingStatusClear,
    aiDefense,
  } = state;

  const you = state.players.you;
  const ai = state.players.ai;
  const availableChi = you.tokens.chi ?? 0;
  const attackChiValue = Math.max(0, Math.min(attackChiSpend, availableChi));
  const defenseChiValue = Math.max(0, Math.min(defenseChiSpend, availableChi));

  const canInteract = turn === "you" && !isDefenseTurn && !statusActive;
  const aiEvasiveRoll = aiDefense.evasiveRoll;
  const aiDefenseRoll = aiDefense.defenseRoll;
  const aiDefenseSim = aiDefense.inProgress;
  const isDefensePhase =
    isDefenseTurn || statusActive || phase === "defense";
  const incomingAttack = isDefenseTurn && pendingAttack ? pendingAttack : null;
  const incomingAbility = incomingAttack?.ability;
  const threatenedDamage = incomingAbility?.damage ?? null;
  const attackChiBonus = incomingAttack?.modifiers?.chiAttackSpend ?? 0;
  const attackerHero =
    incomingAttack && state.players[incomingAttack.attacker]
      ? state.players[incomingAttack.attacker].hero
      : null;
  const canAdjustAttackChi =
    canInteract && availableChi > 0 && turn === "you";
  const canAdjustDefenseChi = isDefenseTurn && availableChi > 0;

  const adjustAttackChi = (delta: number) => {
    setAttackChiSpend((prev) => {
      const next = prev + delta;
      return Math.max(0, Math.min(next, availableChi));
    });
  };

  const adjustDefenseChi = (delta: number) => {
    setDefenseChiSpend((prev) => {
      const next = prev + delta;
      return Math.max(0, Math.min(next, availableChi));
    });
  };

  const renderInfoBanner = () => {
    if (statusActive) {
      return (
        <div className={styles.infoHighlight}>
          {pendingStatusClear?.roll !== undefined
            ? `Status roll: ${pendingStatusClear.roll} ${
                pendingStatusClear.success
                  ? "-> Burn cleared"
                  : "-> Burn stays"
              }`
            : `Burn ${pendingStatusClear?.stacks ?? 0} stack(s) - roll 5-6 to clear.`}
        </div>
      );
    }

    if (incomingAttack && incomingAbility) {
      const abilityName = incomingAbility.label ?? incomingAbility.combo;
      const attackerName = attackerHero?.name ?? "Opponent";
      return (
        <div className={styles.infoDefense}>
          <span className={clsx("badge", "indigo", styles.badgeSpacing)}>
            {attackerName} threatens <b>{threatenedDamage ?? 0}</b> dmg (
            {abilityName}
            {attackChiBonus ? `, Chi x${attackChiBonus}` : ""})
          </span>
        </div>
      );
    }

    if (rollsLeft === 3) {
      return (
        <div className={styles.infoMuted}>
          Suggested ability appears after the first roll.
        </div>
      );
    }

    if (ability) {
      return (
        <div className={styles.infoHighlight}>
          <b>Best ability:</b> {ability.label ?? ability.combo} ({ability.damage} dmg)
        </div>
      );
    }

    return (
      <div className={styles.infoMuted}>
        No combo available
      </div>
    );
  };

  const statusCard =
    statusActive &&
    pendingStatusClear && (
      <div className={clsx("card", styles.statusCard)}>
        <div className={styles.statusHeader}>
          <span className='badge indigo'>
            {pendingStatusClear.side === "you"
              ? you.hero.name
              : ai.hero.name}
          </span>
          <span>Burn stacks: {pendingStatusClear.stacks}</span>
        </div>
        <div className={styles.statusActions}>
          {pendingStatusClear.side === "you" ? (
            <button
              className='btn success'
              onClick={() => performStatusClearRoll("you")}>
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
              {pendingStatusClear.success
                ? "-> Burn cleared"
                : "-> Burn sticks"}
            </div>
          )}
        </div>
      </div>
    );

  const defenseIndicators =
    aiDefenseSim && (
      <div className={styles.defenseIndicators}>
        {aiEvasiveRoll !== null && (
          <div className='badge indigo'>
            AI Evasive: <b>{aiEvasiveRoll}</b>
          </div>
        )}
        {aiDefenseRoll !== null && (
          <div className='badge indigo'>
            AI Defense: <b>{aiDefenseRoll}</b>
          </div>
        )}
        {aiEvasiveRoll === null && aiDefenseRoll === null && (
          <div>AI defense in progress...</div>
        )}
      </div>
    );

  const helperText = statusActive
    ? `Upkeep burn check: roll 5-6 to clear Burn (${
        pendingStatusClear?.side === "you"
          ? "click Status Roll"
          : "AI rolls automatically"
      }).`
    : isDefenseTurn
    ? "Adjust Chi spend if needed, then click Defense Roll or an active ability to respond."
    : "Tip: Confirm attack becomes available after the first Roll.";
  const showRollButton = !isDefenseTurn;
  const rollDisabled =
    turn !== "you" || statusActive || rollsLeft <= 0 || rolling.some(Boolean);

  return (
    <div className='row'>
      <TurnProgress phase={phase} />
      <DiceGrid
        dice={dice}
        held={held}
        rolling={rolling}
        canInteract={canInteract}
        onToggleHold={onToggleHold}
        defIndex={defenseDieIndex}
        showDcLogo={showDcLogo}
        isDefensePhase={isDefensePhase}
        statusActive={statusActive}
      />
      <div className={styles.actionRow}>
        {showRollButton && (
          <button
            className='btn primary'
            onClick={onRoll}
            disabled={rollDisabled}>
            Roll ({rollsLeft})
          </button>
        )}
        {canAdjustAttackChi && (
          <div className={styles.chiSpendControl}>
            <span className={styles.chiSpendLabel}>Chi for attack</span>
            <div className={styles.chiStepper}>
              <button
                type='button'
                className={styles.chiStepperBtn}
                onClick={() => adjustAttackChi(-1)}
                disabled={attackChiValue <= 0}>
                -
              </button>
              <span className={styles.chiValue}>{attackChiValue}</span>
              <button
                type='button'
                className={styles.chiStepperBtn}
                onClick={() => adjustAttackChi(1)}
                disabled={attackChiValue >= availableChi}>
                +
              </button>
              <span className={styles.chiMax}>/ {availableChi}</span>
            </div>
          </div>
        )}
        {!statusActive &&
          (isDefenseTurn ? (
            <>
              <button className='btn success' onClick={onUserDefenseRoll}>
                Defense Roll
              </button>
            </>
          ) : (
            <>
              <button
                className='btn success'
                onClick={onConfirmAttack}
                disabled={turn !== "you" || rollsLeft === 3}
                title={
                  rollsLeft === 3
                    ? "Roll at least once before attacking"
                    : "Confirm attack"
                }>
                Confirm Attack
              </button>
              <button
                className='btn'
                onClick={onEndTurnNoAttack}
                disabled={turn !== "you"}>
                Pass Turn
              </button>
            </>
          ))}
        {canAdjustDefenseChi && (
          <div className={styles.chiSpendControl}>
            <span className={styles.chiSpendLabel}>Chi for block</span>
            <div className={styles.chiStepper}>
              <button
                type='button'
                className={styles.chiStepperBtn}
                onClick={() => adjustDefenseChi(-1)}
                disabled={defenseChiValue <= 0}>
                -
              </button>
              <span className={styles.chiValue}>{defenseChiValue}</span>
              <button
                type='button'
                className={styles.chiStepperBtn}
                onClick={() => adjustDefenseChi(1)}
                disabled={defenseChiValue >= availableChi}>
                +
              </button>
              <span className={styles.chiMax}>/ {availableChi}</span>
            </div>
          </div>
        )}
        {renderInfoBanner()}
        {!statusActive && activeAbilities.length > 0 && (
          <div className={styles.activeAbilityRow}>
            {activeAbilities.map((activeAbility) => (
              <button
                key={activeAbility.id}
                className='btn'
                onClick={() => onPerformActiveAbility(activeAbility.id)}
                title={activeAbility.description ?? activeAbility.label}>
                {activeAbility.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {statusCard}
      {defenseIndicators}

      <div className={styles.helperText}>{helperText}</div>
    </div>
  );
}
