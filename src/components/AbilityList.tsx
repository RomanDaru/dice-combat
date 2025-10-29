import React, { useMemo } from "react";
import { useGame } from "../context/GameContext";
import { useGameData, useGameController } from "../context/GameController";
import {
  getOffensiveAbilities,
  getDefensiveAbilities,
} from "../game/abilityBoards";
import { getEffectDefinition } from "../game/effects";
import type { Combo, OffensiveAbility, DefensiveAbility } from "../game/types";

type AbilityListProps = {
  side: "you" | "ai";
};

type ApplyMap = {
  burn?: number;
  chi?: number;
  evasive?: number;
};

const formatEffects = (effects: string[]) =>
  effects.length ? effects.join(" | ") : "";

function buildEffects(apply?: ApplyMap) {
  if (!apply) return [];
  const defs = [
    { key: "burn" as const, fallbackName: "Burn", fallbackIcon: "B" },
    { key: "chi" as const, fallbackName: "Chi", fallbackIcon: "C" },
    { key: "evasive" as const, fallbackName: "Evasive", fallbackIcon: "E" },
  ];
  const out: string[] = [];
  for (const d of defs) {
    const val = apply?.[d.key];
    if (val) {
      const def = getEffectDefinition(d.key);
      out.push(
        `${def?.icon ?? d.fallbackIcon} ${def?.name ?? d.fallbackName} +${val}`
      );
    }
  }
  return out;
}

function OffenseRow(props: {
  ability: OffensiveAbility;
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
  const effectsText = formatEffects(buildEffects(ability.apply));

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
          <span style={{ color: "#a1a1aa", fontSize: 12 }}>{effectsText}</span>
        )}
        {ready && <span className='badge indigo'>READY</span>}
      </div>
    </button>
  );
}

function DefenseRow(props: {
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
      `Retaliate ${Math.round(ability.retaliatePercent * 100)}%`
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

export default function AbilityList({ side }: AbilityListProps) {
  const { state } = useGame();
  const {
    readyForActing,
    readyForAI,
    isDefenseTurn,
    defenseRoll,
    defenseSelection,
    awaitingDefenseSelection,
  } = useGameData();
  const { onChooseDefenseOption } = useGameController();

  const player = state?.players?.[side];
  if (!player) return null;

  const hero = player.hero;
  const showingDefenseBoard = side === "you" && isDefenseTurn;

  const offenseAbilities = useMemo(() => getOffensiveAbilities(hero), [hero]);
  const defenseAbilities = useMemo(() => getDefensiveAbilities(hero), [hero]);

  const readyCombos = useMemo<Partial<Record<Combo, boolean>>>(() => {
    if (showingDefenseBoard) {
      const m: Partial<Record<Combo, boolean>> = {};
      defenseRoll?.options.forEach((o) => {
        m[o.combo] = true;
      });
      return m;
    }
    const source: Partial<Record<Combo, boolean>> =
      (side === "you" ? readyForActing : readyForAI) ?? {};
    return { ...source };
  }, [showingDefenseBoard, defenseRoll, readyForActing, readyForAI, side]);

  const title =
    side === "you"
      ? showingDefenseBoard
        ? `Defensive Abilities (${hero.name})`
        : `Your Abilities (${hero.name})`
      : `Opponent Abilities (${hero.name})`;

  return (
    <div className='card'>
      <div className='label'>{title}</div>

      <div style={{ display: "grid", gap: 6 }}>
        {showingDefenseBoard
          ? (defenseAbilities as DefensiveAbility[]).map((ability) => {
              const ready = !!readyCombos[ability.combo];
              const selected = defenseSelection === ability.combo;
              const canSelect = awaitingDefenseSelection && ready;
              return (
                <DefenseRow
                  key={ability.combo}
                  ability={ability}
                  ready={ready}
                  selected={!!selected}
                  canSelect={!!canSelect}
                  onSelect={() => onChooseDefenseOption(ability.combo)}
                />
              );
            })
          : (offenseAbilities as OffensiveAbility[]).map((ability) => {
              const ready = !!readyCombos[ability.combo];
              // v útoku sa nekliká? Ak áno, doplň vlastnú logiku
              const selected = false;
              const canSelect = false;
              return (
                <OffenseRow
                  key={ability.combo}
                  ability={ability}
                  ready={ready}
                  selected={selected}
                  canSelect={canSelect}
                  onSelect={() => {}}
                />
              );
            })}
      </div>
    </div>
  );
}
