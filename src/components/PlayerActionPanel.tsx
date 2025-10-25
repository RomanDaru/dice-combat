import React from "react";
import TurnProgress from "./TurnProgress";
import DiceGrid from "./DiceGrid";
import type { Ability, Phase, Side } from "../game/types";
import type { PendingStatusClear } from "../game/state";

type PlayerActionPanelProps = {
  phase: Phase;
  dice: number[];
  held: boolean[];
  rolling: boolean[];
  canInteract: boolean;
  onToggleHold: (index: number) => void;
  defIndex: number;
  showDcLogo: boolean;
  isDefensePhase: boolean;
  statusActive: boolean;
  onRoll: () => void;
  onConfirmAttack: () => void;
  onEndTurnNoAttack: () => void;
  onUserDefenseRoll: () => void;
  onUserEvasiveRoll: () => void;
  rollsLeft: number;
  turn: Side;
  isDefenseTurn: boolean;
  youHasEvasive: boolean;
  pendingStatusClear: PendingStatusClear;
  performStatusClearRoll: (side: Side) => void;
  youHeroName: string;
  aiHeroName: string;
  aiEvasiveRoll: number | null;
  aiDefenseRoll: number | null;
  aiDefenseSim: boolean;
  ability: Ability | null;
};

export function PlayerActionPanel({
  phase,
  dice,
  held,
  rolling,
  canInteract,
  onToggleHold,
  defIndex,
  showDcLogo,
  isDefensePhase,
  statusActive,
  onRoll,
  onConfirmAttack,
  onEndTurnNoAttack,
  onUserDefenseRoll,
  onUserEvasiveRoll,
  rollsLeft,
  turn,
  isDefenseTurn,
  youHasEvasive,
  pendingStatusClear,
  performStatusClearRoll,
  youHeroName,
  aiHeroName,
  aiEvasiveRoll,
  aiDefenseRoll,
  aiDefenseSim,
  ability,
}: PlayerActionPanelProps) {
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
    pendingStatusClear && (
      <div
        className='card'
        style={{
          borderColor: "#f97316",
          background: "rgba(249,115,22,.12)",
        }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          Burn on{" "}
          <b>
            {pendingStatusClear.side === "you" ? youHeroName : aiHeroName}
          </b>{" "}
          - stacks: <b>{pendingStatusClear.stacks}</b>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}>
          {pendingStatusClear.side === "you" ? (
            <button
              className='btn success'
              onClick={() => performStatusClearRoll("you")}
              disabled={pendingStatusClear.rolling}>
              {pendingStatusClear.rolling ? "Rolling..." : "Status Roll (Burn)"}
            </button>
          ) : (
            <div style={{ fontSize: 14, color: "#d4d4d8" }}>
              {pendingStatusClear.roll === undefined
                ? pendingStatusClear.rolling
                  ? "AI is rolling..."
                  : "AI will roll automatically."
                : ""}
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
        defIndex={defIndex}
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

