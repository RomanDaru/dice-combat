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

export function DiceTrayOverlay({ trayImage, diceImages }: DiceTrayOverlayProps) {
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
  const { dice, held, rolling, turn, rollsLeft, pendingStatusClear, players } = state;
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

  const isRolling = Array.isArray(rolling)
    ? rolling.some(Boolean)
    : Boolean(rolling);
  const canInteract =
    turn === "you" && !statusActive && !isDefenseTurn && !isRolling;
  const showRollAction = !isDefenseTurn && rollsLeft > 0;
  const hasDefenseRoll = Boolean(defenseRoll);
  const showDefenseRollAction = isDefenseTurn && !hasDefenseRoll;
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

  const statusOwnerName =
    pendingStatusClear?.side === "you"
      ? players.you.hero.name
      : players.ai.hero.name;
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
  const statusInfo = pendingStatusClear
    ? pendingStatusClear.action === "transfer"
      ? `${statusSourceDef?.name ?? "Status"}: ${
          statusTargetDef?.name ?? pendingStatusClear.status
        } (${pendingStatusClear.stacks} stack${
          pendingStatusClear.stacks === 1 ? "" : "s"
        })`
      : `${statusTargetDef?.name ?? pendingStatusClear.status} stacks: ${
          pendingStatusClear.stacks
        }`
    : null;
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
    if (statusRoll) {
      if (statusRoll.inProgress) {
        return defenseStatusMessage ?? "Rolling...";
      }
      if (statusRoll.outcome) {
        return null;
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
        <div className={styles.trayContent}>
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
          <div className={styles.trayBody}>
            {pendingStatusClear && (
              <div className={styles.statusPrompt}>
                <div className={styles.statusPromptHeader}>
                  <span className={styles.statusBadge}>{statusOwnerName}</span>
                  <span className={styles.statusPromptTitle}>
                    {statusTargetDef?.name ?? pendingStatusClear.status}
                  </span>
                </div>
                <div className={styles.statusPromptBody}>
                  <div className={styles.statusPromptText}>{statusInfo}</div>
                  <div className={styles.statusPromptControls}>
                    {pendingStatusClear.side === "you" ? (
                      <ArtButton
                        variant='medium'
                        className={styles.statusPromptButton}
                        onClick={() => performStatusClearRoll("you")}
                        disabled={!canRollStatus}>
                        {statusActionLabel}
                      </ArtButton>
                    ) : (
                      <div className={styles.statusPromptHint}>
                        {pendingStatusClear.rolling
                          ? "AI is rolling..."
                          : pendingStatusClear.action === "transfer"
                          ? "AI will attempt a transfer."
                          : "AI will roll automatically."}
                      </div>
                    )}
                  </div>
                </div>
                {pendingStatusClear.roll !== undefined && (
                  <div className={styles.statusPromptResult}>
                    Roll: <b>{pendingStatusClear.roll}</b> {statusResultText}
                  </div>
                )}
              </div>
            )}
            {statusRoll && statusDice.length > 0 && (
              <div
                className={clsx(
                  styles.statusRollSection,
                  statusRoll.outcome === "success" && styles.statusRollSuccess,
                  statusRoll.outcome === "failure" && styles.statusRollFailure
                )}>
                <div className={styles.statusRollHeader}>
                  {statusRoll.label ?? "Status Roll"}
                </div>
                <div className={styles.statusRollDice}>
                  <DiceGrid
                    dice={statusDice}
                    held={statusHeld}
                    rolling={statusRolling.length ? statusRolling : false}
                    canInteract={false}
                    onToggleHold={() => {}}
                    defIndex={-1}
                    showDcLogo={false}
                    isDefensePhase={isDefenseTurn}
                    statusActive={statusActive}
                    diceImages={diceImages}
                  />
                </div>
                {showStatusToast && (
                  <div
                    className={clsx(
                      styles.statusToast,
                      statusRoll.outcome === "success" && styles.toastSuccess,
                      statusRoll.outcome === "failure" && styles.toastFailure,
                      statusRoll.outcome === "failure" && styles.toastShake
                    )}>
                    {defenseStatusMessage}
                  </div>
                )}
              </div>
            )}
            {!statusRoll && (
              <div className={styles.diceWrapper}>
                <DiceGrid
                  dice={dice}
                  held={held}
                  rolling={rolling}
                  canInteract={canInteract}
                  onToggleHold={onToggleHold}
                  defIndex={defenseDieIndex}
                  showDcLogo={false}
                  isDefensePhase={isDefenseTurn}
                  statusActive={statusActive}
                  diceImages={diceImages}
                />
              </div>
            )}
            <div className={styles.actions}>
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
            </div>
            {helperText && (
              <div className={styles.helper}>{helperText}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
