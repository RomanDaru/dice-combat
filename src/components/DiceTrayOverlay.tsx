import { useMemo } from "react";
import clsx from "clsx";
import DiceGrid from "./DiceGrid";
import ArtButton from "./ArtButton";
import { useGame } from "../context/GameContext";
import { useGameData, useGameController } from "../context/GameController";
import { getStatus } from "../engine/status";
import styles from "./DiceTrayOverlay.module.css";

type DiceTrayOverlayProps = {
  trayImage?: string | null;
  diceImages?: (string | null | undefined)[];
};

export function DiceTrayOverlay({
  trayImage,
  diceImages,
}: DiceTrayOverlayProps) {
  const { state } = useGame();
  const {
    diceTrayVisible,
    isDefenseTurn,
    statusActive,
    defenseDieIndex,
    awaitingDefenseSelection,
    awaitingDefenseConfirmation,
    defenseRoll,
    impactLocked,
    defenseStatusRoll,
    defenseStatusMessage,
  } = useGameData();
  const {
    onToggleHold,
    onRoll,
    closeDiceTray,
    onUserDefenseRoll,
    activeAbilities,
    onPerformActiveAbility,
    onConfirmDefenseResolution,
    performStatusClearRoll,
  } = useGameController();
  const { dice, held, rolling, turn, rollsLeft, pendingStatusClear, players } =
    state;
  const statusRoll = defenseStatusRoll;
  const statusDice = statusRoll?.dice ?? [];
  const statusHeld = useMemo(() => statusDice.map(() => false), [statusDice]);
  const statusRolling = statusRoll?.inProgress
    ? statusDice.map(() => true)
    : statusDice.map(() => false);
  const showStatusToast = Boolean(
    !statusRoll?.inProgress && statusRoll?.outcome && defenseStatusMessage
  );

  if (!diceTrayVisible) return null;

  const isStatusMode = Boolean(pendingStatusClear);

  const isRolling = Array.isArray(rolling)
    ? rolling.some(Boolean)
    : Boolean(rolling);
  const canInteract =
    turn === "you" && !statusActive && !isDefenseTurn && !isRolling;
  const showRollAction = !isDefenseTurn && rollsLeft > 0 && !isStatusMode;
  const hasDefenseRoll = Boolean(defenseRoll);
  const showDefenseRollAction =
    isDefenseTurn && !hasDefenseRoll && !isStatusMode;
  const defenseRollDisabled =
    !isDefenseTurn ||
    statusActive ||
    isRolling ||
    impactLocked ||
    Boolean(statusRoll?.inProgress) ||
    statusRoll?.outcome === "success";
  const needsDefenseSelection = isDefenseTurn && awaitingDefenseSelection;
  const needsDefenseConfirmationOnly =
    isDefenseTurn && !needsDefenseSelection && awaitingDefenseConfirmation;
  const defenseConfirmDisabled = impactLocked;
  const defenseActiveAbilities = isDefenseTurn ? activeAbilities : [];
  const activeAbilityDisabled =
    statusActive ||
    isRolling ||
    impactLocked ||
    Boolean(statusRoll?.inProgress) ||
    statusRoll?.outcome === "success";

  const statusTargetDef = pendingStatusClear
    ? getStatus(pendingStatusClear.status)
    : null;
  const statusSourceDef =
    pendingStatusClear?.sourceStatus != null
      ? getStatus(pendingStatusClear.sourceStatus)
      : null;
  const statusActionLabel =
    pendingStatusClear?.action === "transfer"
      ? "Attempt Transfer"
      : "Status Roll";
  const statusInfo = (() => {
    if (!pendingStatusClear) return null;
    const statusName = statusTargetDef?.name ?? pendingStatusClear.status;
    const stacksLine = `${statusName} stacks: ${pendingStatusClear.stacks}`;
    const dieSize = pendingStatusClear.dieSize ?? 6;
    const threshold = pendingStatusClear.rollThreshold ?? 4;
    const highRange =
      threshold >= dieSize ? `${threshold}` : `${threshold}-${dieSize}`;
    const effectVerb =
      pendingStatusClear.action === "transfer" ? "transfer" : "cleanse";
    const ruleLine =
      threshold > 1
        ? `Roll d${dieSize}. On ${highRange}: ${effectVerb} ${statusName}.`
        : `Roll d${dieSize} to ${effectVerb} ${statusName}.`;
    return `${stacksLine}\n${ruleLine}`;
  })();
  const statusResultText =
    pendingStatusClear && pendingStatusClear.roll !== undefined
      ? pendingStatusClear.success
        ? pendingStatusClear.action === "transfer"
          ? "-> Transfer success"
          : "-> Cleansed"
        : pendingStatusClear.action === "transfer"
        ? "-> Transfer failed"
        : "-> Status sticks"
      : null;
  const canRollStatus =
    pendingStatusClear?.side === "you" &&
    !pendingStatusClear.rolling &&
    !impactLocked;

  const helperText = (() => {
    if (isStatusMode) {
      // For status rolls, keep helper minimal; main explanation lives in statusInfo.
      if (statusRoll?.inProgress) {
        return defenseStatusMessage ?? "Rolling status...";
      }
      if (statusRoll?.outcome) {
        return defenseStatusMessage ?? null;
      }
      return "Tap Status Roll to resolve the effect.";
    }
    if (statusRoll) {
      if (statusRoll.inProgress) {
        return defenseStatusMessage ?? "Rolling...";
      }
      if (statusRoll.outcome) {
        return defenseStatusMessage ?? null;
      }
    }
    if (isDefenseTurn) {
      if (!hasDefenseRoll) {
        return "Roll to reveal your defense options.";
      }
      if (awaitingDefenseSelection) {
        return "Select a defense ability, then confirm to resolve the attack.";
      }
      return "Defense result locked.";
    }
    if (canInteract) {
      return "Tap dice to hold or release them before the next roll.";
    }
    return "Dice are locked while rolling or during defense.";
  })();

  const showingStatusRoll = Boolean(statusRoll && statusDice.length > 0);
  const showStatusDice = isStatusMode && showingStatusRoll;
  const showMainDice = !isStatusMode;
  const trayDice = showStatusDice ? statusDice : dice;
  const trayHeld = showStatusDice ? statusHeld : held;
  const trayRolling = showStatusDice
    ? statusRolling.length
      ? statusRolling
      : false
    : rolling;
  const trayCanInteract = showStatusDice ? false : canInteract;
  const trayDefIndex = showStatusDice ? -1 : defenseDieIndex;
  const trayToggleHold = showStatusDice ? () => {} : onToggleHold;

  return (
    <div className={styles.overlay}>
      <div
        className={styles.tray}
        style={
          trayImage
            ? {
                backgroundImage: `url(${trayImage})`,
              }
            : undefined
        }>
        <div className={styles.header}>
          <span>Dice Tray</span>
          <ArtButton
            variant='square'
            className={styles.closeButton}
            onClick={closeDiceTray}
            aria-label='Close dice tray'>
            {"\u2715"}
          </ArtButton>
        </div>
        <div className={styles.trayContent}>
          <div className={styles.trayBody}>
            {(showMainDice || showStatusDice) && (
              <div
                className={clsx(
                  styles.diceWrapper,
                  showStatusDice && styles.statusRollDice
                )}>
                <DiceGrid
                  dice={trayDice}
                  held={trayHeld}
                  rolling={trayRolling}
                  canInteract={trayCanInteract}
                  onToggleHold={trayToggleHold}
                  defIndex={trayDefIndex}
                  showDcLogo={false}
                  isDefensePhase={isDefenseTurn}
                  statusActive={statusActive}
                  diceImages={diceImages}
                />
              </div>
            )}
            <div className={styles.actions}>
              {isStatusMode ? (
                pendingStatusClear?.side === "you" ? (
                  <ArtButton
                    variant='medium'
                    className={styles.actionButton}
                    onClick={() => performStatusClearRoll("you")}
                    disabled={!canRollStatus}>
                    {statusActionLabel}
                  </ArtButton>
                ) : (
                  <div className={styles.statusPromptHint}>
                    {pendingStatusClear?.rolling
                      ? "AI is rolling..."
                      : pendingStatusClear?.action === "transfer"
                      ? "AI will attempt a transfer."
                      : "AI will roll automatically."}
                  </div>
                )
              ) : (
                <>
                  {showRollAction && (
                    <ArtButton
                      variant='medium'
                      className={styles.actionButton}
                      onClick={onRoll}
                      disabled={!canInteract}>
                      Roll ({rollsLeft})
                    </ArtButton>
                  )}
                  {showDefenseRollAction && (
                    <ArtButton
                      variant='medium'
                      className={styles.actionButton}
                      onClick={onUserDefenseRoll}
                      disabled={defenseRollDisabled}>
                      Roll Defense
                    </ArtButton>
                  )}
                  {defenseActiveAbilities.map((ability) => (
                    <ArtButton
                      key={ability.id}
                      variant='medium'
                      className={styles.actionButton}
                      onClick={() => onPerformActiveAbility(ability.id)}
                      disabled={activeAbilityDisabled}>
                      {ability.label}
                    </ArtButton>
                  ))}
                  {needsDefenseSelection && (
                    <ArtButton
                      variant='medium'
                      className={styles.actionButton}
                      onClick={closeDiceTray}
                      disabled={defenseConfirmDisabled}>
                      Select Defense
                    </ArtButton>
                  )}
                  {needsDefenseConfirmationOnly && (
                    <ArtButton
                      variant='medium'
                      className={styles.actionButton}
                      onClick={onConfirmDefenseResolution}
                      disabled={defenseConfirmDisabled}>
                      Confirm Defense
                    </ArtButton>
                  )}
                  {!needsDefenseSelection &&
                    !needsDefenseConfirmationOnly &&
                    !isDefenseTurn && (
                      <ArtButton
                        variant='medium'
                        className={styles.actionButton}
                        onClick={closeDiceTray}>
                        Select Attack
                      </ArtButton>
                    )}
                </>
              )}
            </div>
            {isStatusMode && statusInfo && (
              <div className={styles.statusPromptText}>
                {statusInfo.split("\n").map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
            {helperText && <div className={styles.helper}>{helperText}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
