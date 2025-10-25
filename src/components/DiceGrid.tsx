import React from "react";

type DiceGridProps = {
  dice: number[];
  held: boolean[];
  rolling: boolean[] | boolean;
  canInteract: boolean;
  onToggleHold: (index: number) => void;
  defIndex: number;
  showDcLogo: boolean;
  isDefensePhase: boolean;
  statusActive: boolean;
  isAi?: boolean;
  aiSimHeld?: boolean[];
};

export default function DiceGrid({
  dice,
  held,
  rolling,
  canInteract,
  onToggleHold,
  defIndex,
  showDcLogo,
  isDefensePhase,
  statusActive,
  isAi = false,
  aiSimHeld,
}: DiceGridProps) {
  return (
    <div className='grid-5'>
      {dice.map((value, index) => {
        const isDefenseDie = index === defIndex && isDefensePhase;
        const isHeld = isAi ? Boolean(aiSimHeld?.[index]) : Boolean(held[index]);
        const rollingState = Array.isArray(rolling)
          ? rolling[index]
          : rolling;
        const isRolling = Boolean(rollingState) && (!isAi || !isHeld);
        const canToggle = canInteract || isDefenseDie;

        const className =
          `die ${isDefenseDie ? "def" : isHeld ? "held" : ""}` +
          (!canToggle ? " disabled" : "") +
          (isRolling ? " rolling" : "");

        const flagLabel = isDefenseDie
          ? statusActive
            ? "STS"
            : "DEF"
          : isHeld
          ? "HELD"
          : isRolling
          ? "ROLLING"
          : "ROLL";

        const tagLabel = statusActive ? "STATUS" : "DEF";

        const handleClick = () => {
          if (canToggle) {
            onToggleHold(index);
          }
        };

        return (
          <button
            key={index}
            type='button'
            className={className}
            onClick={handleClick}
            aria-pressed={isHeld}
            disabled={!canToggle}>
            {showDcLogo && !isRolling ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  border: "1px solid #059669",
                  borderRadius: 8,
                  fontWeight: 700,
                }}>
                DC
              </span>
            ) : (
              <span className={`num ${isRolling ? "animate-pulse" : ""}`}>
                {value}
              </span>
            )}
            <span
              className={`die-flag ${
                isDefenseDie ? "def" : isHeld ? "held" : ""
              }`}>
              {flagLabel}
            </span>
            {isDefenseDie && <span className='die-def-tag'>{tagLabel}</span>}
          </button>
        );
      })}
    </div>
  );
}
