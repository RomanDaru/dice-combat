import React from "react";
import clsx from "clsx";
import TurnProgress from "./TurnProgress";
import { useGame } from "../context/GameContext";
import { useGameController, useGameData } from "../context/GameController";
import styles from "./PlayerActionPanel.module.css";

export function PlayerActionPanel() {
  const { state } = useGame();
  const {
    onRoll,
    onConfirmAttack,
    onEndTurnNoAttack,
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserEvasiveRoll,
    performStatusClearRoll,
    activeAbilities,
    onPerformActiveAbility,
    attackChiSpend,
    defenseChiSpend,
    setAttackChiSpend,
    setDefenseChiSpend,
    turnChiAvailable,
    openDiceTray,
    closeDiceTray,
  } = useGameController();
  const {
    statusActive,
    isDefenseTurn,
    ability,
    suggestedAbility,
    selectedAttackCombo,
    defenseRoll,
    defenseSelection,
    awaitingDefenseSelection,
    diceTrayVisible,
  } = useGameData();

  const {
    phase,
    rollsLeft,
    rolling,
    turn,
    pendingAttack,
    pendingStatusClear,
    aiDefense,
  } = state;

  const you = state.players.you;
  const ai = state.players.ai;
  const availableChiTokens = you.tokens.chi ?? 0;
  const spendableChi = Math.max(
    0,
    Math.min(availableChiTokens, turnChiAvailable.you ?? 0)
  );
  const attackChiValue = Math.max(0, Math.min(attackChiSpend, spendableChi));
  const defenseChiValue = Math.max(0, Math.min(defenseChiSpend, spendableChi));

  const canInteract = turn === "you" && !isDefenseTurn && !statusActive;
  const aiEvasiveRoll = aiDefense.evasiveRoll;
  const aiDefenseDice = aiDefense.defenseDice;
  const aiDefenseCombo = aiDefense.defenseCombo;
  const aiDefenseBlock = aiDefense.defenseRoll;
  const aiDefenseSim =
    aiDefense.inProgress || !!aiDefenseDice || aiEvasiveRoll !== null;
  const incomingAttack = isDefenseTurn && pendingAttack ? pendingAttack : null;
  const incomingAbility = incomingAttack?.ability;
  const threatenedDamage = incomingAbility?.damage ?? null;
  const attackChiBonus = incomingAttack?.modifiers?.chiAttackSpend ?? 0;
  const attackerHero =
    incomingAttack && state.players[incomingAttack.attacker]
      ? state.players[incomingAttack.attacker].hero
      : null;
  const canAdjustAttackChi = canInteract && spendableChi > 0 && turn === "you";
  const canAdjustDefenseChi = isDefenseTurn && spendableChi > 0;
  const hasDefenseCombos = Boolean(defenseRoll && defenseRoll.options.length);

  const adjustAttackChi = (delta: number) => {
    setAttackChiSpend((prev) => {
      const next = prev + delta;
      return Math.max(0, Math.min(next, spendableChi));
    });
  };

  const adjustDefenseChi = (delta: number) => {
    setDefenseChiSpend((prev) => {
      const next = prev + delta;
      return Math.max(0, Math.min(next, spendableChi));
    });
  };

  const renderInfoBanner = () => {
    if (statusActive) {
      return (
        <div className={styles.infoHighlight}>
          {pendingStatusClear?.roll !== undefined
            ? `Status roll: ${pendingStatusClear.roll} ${
                pendingStatusClear.success ? "-> Burn cleared" : "-> Burn stays"
              }`
            : `Burn ${
                pendingStatusClear?.stacks ?? 0
              } stack(s) - roll 5-6 to clear.`}
        </div>
      );
    }

    if (isDefenseTurn && defenseRoll) {
      const noCombos = defenseRoll.options.length === 0;
      return (
        <div className={styles.infoHighlight}>
          Defense roll: {defenseRoll.dice.join(" ")} --{" "}
          {noCombos
            ? "No defensive combos available. Block 0 damage."
            : awaitingDefenseSelection
            ? "Select a defensive ability or confirm to resolve."
            : "Waiting for attack resolution."}
        </div>
      );
    }

    if (incomingAttack && incomingAbility) {
      const abilityName =
        incomingAbility.displayName ??
        incomingAbility.label ??
        incomingAbility.combo;
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

    const abilityToShow = ability ?? suggestedAbility;
    if (abilityToShow) {
      const isSelected =
        Boolean(
          selectedAttackCombo &&
            ability &&
            ability.combo === selectedAttackCombo
        ) && turn === "you";
      const label = isSelected ? "Selected ability" : "Suggested ability";
      const primary = isSelected ? ability : abilityToShow;
      const primaryName =
        primary?.displayName ?? primary?.label ?? primary?.combo;
      const primaryDamage =
        primary?.damage != null ? `${primary.damage} dmg` : null;

      return (
        <div className={styles.infoHighlight}>
          <div>
            <b>{label}:</b> {primaryName}
            {primaryDamage ? ` (${primaryDamage})` : ""}
          </div>
          {isSelected &&
            suggestedAbility &&
            ability &&
            suggestedAbility.combo !== ability.combo && (
              <div className={styles.infoMuted}>
                Suggested alternative:{" "}
                {suggestedAbility.displayName ??
                  suggestedAbility.label ??
                  suggestedAbility.combo}
                {suggestedAbility.damage != null
                  ? ` (${suggestedAbility.damage} dmg)`
                  : ""}
              </div>
            )}
        </div>
      );
    }
    return null;
  };

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
            {pendingStatusClear.success ? "-> Burn cleared" : "-> Burn sticks"}
          </div>
        )}
      </div>
    </div>
  );

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

  const helperText = statusActive
    ? `Upkeep burn check: roll 5-6 to clear Burn (${
        pendingStatusClear?.side === "you"
          ? "click Status Roll"
          : "AI rolls automatically"
      }).`
    : isDefenseTurn
    ? defenseRoll
      ? defenseRoll.options.length === 0
        ? "No defensive combos available. Confirm defense to block 0 damage."
        : awaitingDefenseSelection
        ? "Select a defensive ability (or skip) and press Confirm Defense."
        : "Defense locked in. Waiting for resolution."
      : "Roll your defense dice to reveal available abilities."
    : turn !== "you"
    ? "Waiting for the opponent to complete their turn."
    : rollsLeft === 3
    ? "Roll once to reveal available abilities."
    : !ability
    ? "No combos yet—open the dice tray and roll again or pass the turn."
    : selectedAttackCombo && ability && ability.combo === selectedAttackCombo
    ? "Selected ability is ready. Press Confirm Attack when you're set."
    : "Click an ability card to lock it in, or Confirm Attack to use the suggestion.";
  const showRollButton = !isDefenseTurn;
  const rollDisabled =
    turn !== "you" || statusActive || rollsLeft <= 0 || rolling.some(Boolean);
  const trayToggleDisabled =
    turn !== "you" || statusActive || rolling.some(Boolean);

  return (
    <div className='row'>
      <TurnProgress phase={phase} />
      <div className={styles.actionRow}>
        {showRollButton && (
          <button
            className='btn primary'
            onClick={onRoll}
            disabled={rollDisabled}>
            Roll ({rollsLeft})
          </button>
        )}
        <button
          className='btn'
          onClick={() => {
            if (diceTrayVisible) {
              closeDiceTray();
            } else {
              openDiceTray();
            }
          }}
          disabled={trayToggleDisabled}>
          {diceTrayVisible ? "Hide Dice Tray" : "Open Dice Tray"}
        </button>
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
                disabled={attackChiValue >= spendableChi}>
                +
              </button>
              <span className={styles.chiMax}>/ {spendableChi}</span>
            </div>
          </div>
        )}
        {!statusActive &&
          (isDefenseTurn ? (
            <>
              <button
                className='btn success'
                onClick={onUserDefenseRoll}
                disabled={Boolean(defenseRoll)}>
                {defenseRoll ? "Defense Rolled" : "Defense Roll"}
              </button>
              {defenseRoll && (
                <>
                  {hasDefenseCombos && (
                    <button
                      className='btn'
                      onClick={() => onChooseDefenseOption(null)}>
                      Skip ability
                    </button>
                  )}
                  <button
                    className='btn success'
                    onClick={onConfirmDefense}
                    disabled={!awaitingDefenseSelection}>
                    Confirm Defense
                  </button>
                </>
              )}
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
                disabled={defenseChiValue >= spendableChi}>
                +
              </button>
              <span className={styles.chiMax}>/ {spendableChi}</span>
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

      <div className={styles.helperText}>{helperText}</div>
      {statusCard}
      {defenseIndicators}
    </div>
  );
}
