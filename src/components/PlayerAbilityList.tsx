import React, { useMemo } from "react";
import { useGame } from "../context/GameContext";
import { useGameData, useGameController } from "../context/GameController";
import {
  getOffensiveAbilities,
  getDefensiveAbilities,
} from "../game/abilityBoards";
import { getEffectDefinition } from "../game/effects";
import type { Combo, DefensiveAbility, OffensiveAbility } from "../game/types";
import { DefenseRow, OffenseRow } from "./AbilityRows";

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

export function PlayerAbilityList() {
  const { state } = useGame();
  const {
    readyForActing,
    isDefenseTurn,
    defenseRoll,
    defenseSelection,
    awaitingDefenseSelection,
    selectedAttackCombo,
    statusActive,
  } = useGameData();
  const { onChooseDefenseOption, onSelectAttackCombo } = useGameController();

  const player = state.players.you;
  const hero = player.hero;

  const showingDefenseBoard = isDefenseTurn;
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
    return { ...(readyForActing ?? {}) };
  }, [showingDefenseBoard, defenseRoll, readyForActing]);

  const title = showingDefenseBoard
    ? `Defensive Abilities (${hero.name})`
    : `Your Abilities (${hero.name})`;

  const canSelectOffense =
    state.turn === "you" &&
    !isDefenseTurn &&
    !statusActive &&
    !state.rolling.some(Boolean);

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
              const selected = selectedAttackCombo === ability.combo;
              const canSelect = canSelectOffense && ready;
              const effectsText = formatEffects(buildEffects(ability.apply));
              return (
                <OffenseRow
                  key={ability.combo}
                  ability={ability}
                  ready={ready}
                  selected={selected}
                  canSelect={canSelect}
                  effectsText={effectsText}
                  onSelect={() =>
                    onSelectAttackCombo(selected ? null : ability.combo)
                  }
                />
              );
            })}
      </div>
    </div>
  );
}
