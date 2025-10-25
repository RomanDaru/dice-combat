import React from "react";
import TurnProgress from "./TurnProgress";
import DiceGrid from "./DiceGrid";
import { useGame } from "../context/GameContext";
import { useGameController, useGameData } from "../context/GameController";

export function PlayerActionPanel() {
  const { state } = useGame();
  const {
    onRoll,
    onToggleHold,
    onConfirmAttack,
    onEndTurnNoAttack,
    onUserDefenseRoll,
    onUserEvasiveRoll,
    performStatusClearRoll,
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
    pendingStatusClear,
    aiDefense,
  } = state;

  const you = state.players.you;
  const ai = state.players.ai;

  const canInteract = turn === "you" && !isDefenseTurn && !statusActive;
  const youHasEvasive = you.tokens.evasive > 0;
  const aiEvasiveRoll = aiDefense.evasiveRoll;
  const aiDefenseRoll = aiDefense.defenseRoll;
  const aiDefenseSim = aiDefense.inProgress;
  const isDefensePhase =
    isDefenseTurn || statusActive || phase === "defense";

  const renderInfoBanner = () => {
    if (statusActive) {
      return (
        <div
          style={{
            marginLeft: "auto",
            fontSize: 14,
            color: "#e4e4e7",
          }}>
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

    if (isDefenseTurn) {
      return (
        <div
          style={{
            marginLeft: "auto",
            fontSize: 14,
            color: "#d4d4d8",
          }}>
          {aiEvasiveRoll !== null && (
            <span className='badge indigo' style={{ marginRight: 8 }}>
              AI Evasive roll: <b>{aiEvasiveRoll}</b>
            </span>
          )}
          {aiDefenseRoll !== null && (
            <span className='badge indigo'>
              AI Defense roll: <b>{aiDefenseRoll}</b>
            </span>
          )}
          {aiEvasiveRoll === null && aiDefenseRoll === null && (
            <span>AI defense resolving...</span>
          )}
        </div>
      );
    }

    if (rollsLeft === 3) {
      return (
        <div
          style={{
            marginLeft: "auto",
            fontSize: 14,
            color: "#a1a1aa",
          }}>
          Suggested ability appears after the first roll.
        </div>
      );
    }

    if (ability) {
      return (
        <div
          style={{
            marginLeft: "auto",
            fontSize: 14,
            color: "#e4e4e7",
          }}>
          <b>Best ability:</b> {ability.label ?? ability.combo} ({ability.damage} dmg)
        </div>
      );
    }

    return (
      <div
        style={{
          marginLeft: "auto",
          fontSize: 14,
          color: "#a1a1aa",
        }}>
        No combo available
      </div>
    );
  };

  const statusCard =
    statusActive &&
    pendingStatusClear && (
      <div
        className='card'
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
          }}>
          <span className='badge indigo'>
            {pendingStatusClear.side === "you"
              ? you.hero.name
              : ai.hero.name}
          </span>
          <span>Burn stacks: {pendingStatusClear.stacks}</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {pendingStatusClear.side === "you" ? (
            <button
              className='btn success'
              onClick={() => performStatusClearRoll("you")}>
              Status Roll
            </button>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}>
              <div
                style={{
                  fontSize: 14,
                  color: "#a1a1aa",
                }}>
                {pendingStatusClear.rolling
                  ? "AI is rolling..."
                  : "AI will roll automatically."}
              </div>
            </div>
          )}
          {pendingStatusClear.roll !== undefined && (
            <div style={{ fontSize: 14, color: "#e4e4e7" }}>
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
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 14,
          color: "#d4d4d8",
        }}>
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
    ? "Click Defense Roll (or use Evasive) to respond to the attack."
    : "Tip: Confirm attack becomes available after the first Roll.";

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
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
        <button
          className='btn primary'
          onClick={onRoll}
          disabled={
            turn !== "you" || rollsLeft <= 0 || isDefenseTurn || statusActive
          }>
          Roll ({rollsLeft})
        </button>
        {!statusActive &&
          (isDefenseTurn ? (
            <>
              <button className='btn success' onClick={onUserDefenseRoll}>
                Defense Roll
              </button>
              {youHasEvasive && (
                <button className='btn' onClick={onUserEvasiveRoll}>
                  Use Evasive
                </button>
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
        {renderInfoBanner()}
      </div>

      {statusCard}
      {defenseIndicators}

      <div style={{ fontSize: 12, color: "#a1a1aa" }}>{helperText}</div>
    </div>
  );
}
