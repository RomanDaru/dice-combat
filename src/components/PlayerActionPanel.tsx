import React, { useEffect, useRef } from "react";
import clsx from "clsx";
import { useGame } from "../context/GameContext";
import { useGameController, useGameData } from "../context/GameController";
import { useCombatLog, indentLog } from "../hooks/useCombatLog";
import styles from "./PlayerActionPanel.module.css";
import { getStatus, getStacks } from "../engine/status";

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
    attackStatusRequests,
    defenseStatusRequests,
    requestStatusSpend,
    undoStatusSpend,
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
    impactLocked,
    attackBaseDamage,
    defenseBaseBlock,
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
  const chiDef = getStatus("chi");
  const evasiveDef = getStatus("evasive");
  const chiSpend = chiDef?.spend;
  const evasiveSpend = evasiveDef?.spend;
  const chiAttackEnabled =
    !!chiSpend?.allowedPhases?.includes("attackRoll");
  const chiDefenseEnabled =
    !!chiSpend?.allowedPhases?.includes("defenseRoll");
  const evasiveEnabled =
    !!evasiveSpend?.allowedPhases?.includes("defenseRoll");
  const evasiveNeedsRoll = !!evasiveSpend?.needsRoll;
  const evasiveButtonLabel = evasiveNeedsRoll
    ? `${evasiveDef?.name ?? "Evasive"} Roll`
    : `Use ${evasiveDef?.name ?? "Evasive"}`;
  const availableChiTokens = getStacks(you.tokens, "chi", 0);
  const turnChiCap = Math.max(
    0,
    Math.min(availableChiTokens, turnChiAvailable.you ?? 0)
  );
  const attackChiCap =
    turn === "you" && selectedAttackCombo && attackBaseDamage > 0
      ? turnChiCap
      : 0;
  const defenseChiCap =
    awaitingDefenseSelection && defenseBaseBlock > 0 ? turnChiCap : 0;
  const attackChiRequest = Math.min(
    attackStatusRequests.chi ?? 0,
    attackChiCap
  );
  const defenseChiRequest = Math.min(
    defenseStatusRequests.chi ?? 0,
    defenseChiCap
  );

  const canInteract =
    turn === "you" && !isDefenseTurn && !statusActive && !impactLocked;
  const aiEvasiveRoll = aiDefense.evasiveRoll;
  const aiDefenseDice = aiDefense.defenseDice;
  const aiDefenseCombo = aiDefense.defenseCombo;
  const aiDefenseBlock = aiDefense.defenseRoll;
  const aiDefenseSim =
    aiDefense.inProgress || !!aiDefenseDice || aiEvasiveRoll !== null;
  const incomingAttack = isDefenseTurn && pendingAttack ? pendingAttack : null;
  const incomingAbility = incomingAttack?.ability;
  const threatenedDamage = incomingAbility?.damage ?? null;
  const incomingStatusSpends = incomingAttack?.modifiers?.statusSpends ?? [];
  const attackChiSummary = incomingStatusSpends.find(
    (spend) => spend.id === "chi"
  );
  const attackChiStacks = attackChiSummary?.stacksSpent ?? 0;
  const attackChiBonusDamage = attackChiSummary?.bonusDamage ?? 0;
  const attackerHero =
    incomingAttack && state.players[incomingAttack.attacker]
      ? state.players[incomingAttack.attacker].hero
      : null;
  const canAdjustAttackChi =
    canInteract && chiAttackEnabled && attackChiCap > 0;
  const canAdjustDefenseChi =
    isDefenseTurn &&
    chiDefenseEnabled &&
    defenseChiCap > 0 &&
    awaitingDefenseSelection &&
    !impactLocked;
  const playerEvasiveStacks = getStacks(you.tokens, "evasive", 0);
  const canUseEvasive =
    isDefenseTurn &&
    evasiveEnabled &&
    playerEvasiveStacks > 0 &&
    !impactLocked;
  const hasDefenseCombos = Boolean(defenseRoll && defenseRoll.options.length);
  const { pushLog } = useCombatLog();
  const lastThreatLog = useRef<string | null>(null);

  useEffect(() => {
    if (!incomingAttack || !incomingAbility) {
      lastThreatLog.current = null;
      return;
    }

    const attackerName =
      attackerHero?.name ??
      (incomingAttack.attacker === "you" ? "You" : "Opponent");
    const abilityName =
      incomingAbility.displayName ?? incomingAbility.label ?? incomingAbility.combo;
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

  const spendAttackChi = () => {
    requestStatusSpend("attackRoll", "chi");
  };

  const undoAttackChi = () => {
    undoStatusSpend("attackRoll", "chi");
  };

  const spendDefenseChi = () => {
    requestStatusSpend("defenseRoll", "chi");
  };

  const undoDefenseChi = () => {
    undoStatusSpend("defenseRoll", "chi");
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
            onClick={() => performStatusClearRoll("you")}
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

  const showRollButton = !isDefenseTurn;
  const rollDisabled =
    turn !== "you" ||
    statusActive ||
    rollsLeft <= 0 ||
    rolling.some(Boolean) ||
    impactLocked;
  const trayToggleDisabled =
    turn !== "you" ||
    statusActive ||
    rolling.some(Boolean) ||
    impactLocked;

  const actionRowClass = clsx(
    styles.actionRow,
    impactLocked && styles.actionRowLocked
  );

  return (
    <div className={styles.panel}>
      <div className={actionRowClass}>
        {showRollButton && (
          <button
            className='btn primary'
            onClick={onRoll}
            disabled={rollDisabled}>
            Roll ({rollsLeft})
          </button>
        )}
        {!isDefenseTurn && (
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
        )}
        {canAdjustAttackChi && (
          <div className={styles.chiSpendControl}>
            <span className={styles.chiSpendLabel}>Chi for attack</span>
            <div className={styles.chiStepper}>
              <button
                type='button'
                className={styles.chiStepperBtn}
                onClick={spendAttackChi}
                disabled={attackChiRequest >= attackChiCap || impactLocked}>
                Spend
              </button>
              <span className={styles.chiValue}>{attackChiRequest}</span>
              <button
                type='button'
                className={styles.chiStepperBtn}
                onClick={undoAttackChi}
                disabled={attackChiRequest <= 0 || impactLocked}>
                Undo
              </button>
              <span className={styles.chiMax}>/ {attackChiCap}</span>
            </div>
          </div>
        )}
        {!statusActive &&
          (isDefenseTurn ? (
            <>
              <button
                className='btn success'
                onClick={onUserDefenseRoll}
                disabled={Boolean(defenseRoll) || impactLocked}>
                {defenseRoll ? "Defense Rolled" : "Defense Roll"}
              </button>
              {canUseEvasive && (
                <button
                  className='btn warning'
                  onClick={onUserEvasiveRoll}
                  disabled={impactLocked}>
                  {evasiveButtonLabel}
                </button>
              )}
              {defenseRoll && (
                <>
                  {hasDefenseCombos && (
                    <button
                      className='btn'
                      onClick={() => onChooseDefenseOption(null)}
                      disabled={impactLocked}>
                      Skip ability
                    </button>
                  )}
                  <button
                    className='btn success'
                    onClick={onConfirmDefense}
                    disabled={!awaitingDefenseSelection || impactLocked}>
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
                disabled={turn !== "you" || rollsLeft === 3 || impactLocked}
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
                disabled={turn !== "you" || impactLocked}>
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
                onClick={spendDefenseChi}
                disabled={defenseChiRequest >= defenseChiCap || impactLocked}>
                Spend
              </button>
              <span className={styles.chiValue}>{defenseChiRequest}</span>
              <button
                type='button'
                className={styles.chiStepperBtn}
                onClick={undoDefenseChi}
                disabled={defenseChiRequest <= 0 || impactLocked}>
                Undo
              </button>
              <span className={styles.chiMax}>/ {defenseChiCap}</span>
            </div>
          </div>
        )}
        {!statusActive && activeAbilities.length > 0 && (
          <div className={styles.activeAbilityRow}>
            {activeAbilities.map((activeAbility) => (
              <button
                key={activeAbility.id}
                className='btn'
                onClick={() => onPerformActiveAbility(activeAbility.id)}
                disabled={impactLocked}
                title={activeAbility.description ?? activeAbility.label}>
                {activeAbility.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {statusCard}
      {defenseIndicators}
    </div>
  );
}
