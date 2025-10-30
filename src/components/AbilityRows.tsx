import React from "react";
import type { DefensiveAbility, OffensiveAbility } from "../game/types";

export function OffenseRow(props: {
  ability: OffensiveAbility;
  ready: boolean;
  selected: boolean;
  canSelect: boolean;
  effectsText?: string;
  onSelect: () => void;
}) {
  const { ability, ready, selected, canSelect, effectsText, onSelect } = props;

  const border = selected ? "#facc15" : ready ? "#6366f1" : "#27272a";
  const bg = selected
    ? "rgba(234,179,8,.25)"
    : ready
    ? "rgba(30,27,75,.3)"
    : "rgba(24,24,27,.4)";

  return (
    <button
      key={ability.combo}
      type='button'
      disabled={!canSelect}
      aria-pressed={selected || undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 8px",
        borderRadius: 8,
        border: `1px solid ${border}`,
        background: bg,
        cursor: canSelect ? "pointer" : "default",
        width: "100%",
        textAlign: "left",
      }}
      onClick={() => {
        if (canSelect) onSelect();
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          className='badge'
          style={{ background: ability.ultimate ? "#6d28d9" : "#52525b" }}>
          {ability.combo}
        </span>
        <span>{ability.displayName ?? ability.label ?? ability.combo}</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {ability.damage != null && (
          <span className='num' style={{ color: "#e4e4e7" }}>
            {ability.damage} dmg
          </span>
        )}
        {effectsText && (
          <span style={{ color: "#a1a1aa", fontSize: 12 }}>
            {effectsText}
          </span>
        )}
        {ready && <span className='badge indigo'>READY</span>}
      </div>
    </button>
  );
}

export function DefenseRow(props: {
  ability: DefensiveAbility;
  ready: boolean;
  selected: boolean;
  canSelect: boolean;
  onSelect: () => void;
}) {
  const { ability, ready, selected, canSelect, onSelect } = props;

  const border = selected ? "#facc15" : ready ? "#6366f1" : "#27272a";
  const bg = selected
    ? "rgba(234,179,8,.25)"
    : ready
    ? "rgba(30,27,75,.3)"
    : "rgba(24,24,27,.4)";

  const defenseStats: string[] = [];
  if (ability.block != null) defenseStats.push(`Block ${ability.block}`);
  if (ability.reflect) defenseStats.push(`Reflect ${ability.reflect}`);
  if (ability.heal) defenseStats.push(`Heal ${ability.heal}`);
  if (ability.retaliatePercent)
    defenseStats.push(
      `Retaliate ${Math.round((ability.retaliatePercent ?? 0) * 100)}%`
    );

  return (
    <button
      key={ability.combo}
      type='button'
      disabled={!canSelect}
      aria-pressed={selected || undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 8px",
        borderRadius: 8,
        border: `1px solid ${border}`,
        background: bg,
        cursor: canSelect ? "pointer" : "default",
        width: "100%",
        textAlign: "left",
      }}
      onClick={() => {
        if (canSelect) onSelect();
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className='badge' style={{ background: "#52525b" }}>
          {ability.combo}
        </span>
        <span>{ability.displayName ?? ability.label ?? ability.combo}</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {defenseStats.length > 0 && (
          <span className='num' style={{ color: "#e4e4e7" }}>
            {defenseStats.join(" | ")}
          </span>
        )}
        {ready && <span className='badge indigo'>ROLLED</span>}
      </div>
    </button>
  );
}
