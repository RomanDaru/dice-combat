import React, { useMemo } from "react";
import clsx from "clsx";
import { useGame } from "../context/GameContext";
import { useGameData, useGameController } from "../context/GameController";
import {
  getOffensiveAbilities,
  getDefensiveAbilities,
} from "../game/abilityBoards";
import { getEffectDefinition } from "../game/effects";
import type { Combo, DefensiveAbility, OffensiveAbility } from "../game/types";
import { DefenseRow } from "./AbilityRows";
import abilityStyles from "./AbilityIcons.module.css";

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
  for (const def of defs) {
    const val = apply?.[def.key];
    if (val) {
      const meta = getEffectDefinition(def.key);
      out.push(`${meta?.icon ?? def.fallbackIcon} ${meta?.name ?? def.fallbackName} +${val}`);
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

  const offenseAbilities = useMemo(() => getOffensiveAbilities(hero), [hero]);
  const defenseAbilities = useMemo(() => getDefensiveAbilities(hero), [hero]);

  const readyCombos = useMemo<Partial<Record<Combo, boolean>>>(() => {
    if (isDefenseTurn) {
      const map: Partial<Record<Combo, boolean>> = {};
      defenseRoll?.options.forEach((option) => {
        map[option.combo] = true;
      });
      return map;
    }
    return { ...(readyForActing ?? {}) };
  }, [defenseRoll, isDefenseTurn, readyForActing]);

  if (isDefenseTurn) {
    return (
      <div className='card'>
        <div className='label'>{`Defensive Abilities (${hero.name})`}</div>
        <div style={{ display: "grid", gap: 6 }}>
          {(defenseAbilities as DefensiveAbility[]).map((ability) => {
            const ready = !!readyCombos[ability.combo];
            const selected = defenseSelection === ability.combo;
            const canSelect = awaitingDefenseSelection && ready;
            return (
              <DefenseRow
                key={ability.combo}
                ability={ability}
                ready={ready}
                selected={selected}
                canSelect={!!canSelect}
                onSelect={() => onChooseDefenseOption(ability.combo)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const canSelectOffense =
    state.turn === "you" && !statusActive && !state.rolling.some(Boolean);

  return (
    <div className={abilityStyles.panel}>
      <div className={abilityStyles.title}>{`Your Abilities (${hero.name})`}</div>
      <div className={abilityStyles.grid}>
        {(offenseAbilities as OffensiveAbility[]).map((ability) => {
          const ready = !!readyCombos[ability.combo];
          const selected = selectedAttackCombo === ability.combo;
          const canSelect = canSelectOffense && ready;
          const effectsText = formatEffects(buildEffects(ability.apply));
          const abilityName =
            ability.displayName ?? ability.label ?? ability.combo;
          const iconLabel = abilityName
            .split(/[^A-Za-z0-9]+/)
            .filter(Boolean)
            .map((part) => part[0]!.toUpperCase())
            .join("")
            .slice(0, 2);

          const tooltipParts = [abilityName];
          if (ability.damage != null) tooltipParts.push(`${ability.damage} dmg`);
          if (effectsText) tooltipParts.push(effectsText);

          return (
            <button
              key={ability.combo}
              type='button'
              className={clsx(
                abilityStyles.iconButton,
                ready && abilityStyles.ready,
                selected && abilityStyles.selected,
                ability.ultimate && abilityStyles.ultimate
              )}
              onClick={() =>
                onSelectAttackCombo(selected ? null : ability.combo)
              }
              disabled={!canSelect}
              title={tooltipParts.join(" - ")}
            >
              <span className={abilityStyles.iconLabel}>{iconLabel}</span>
              {ability.ultimate && (
                <span className={abilityStyles.smallBadge}>ULT</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
