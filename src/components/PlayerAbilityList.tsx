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
    impactLocked,
  } = useGameData();
  const {
    onChooseDefenseOption,
    onSelectAttackCombo,
    onConfirmAttack,
  } = useGameController();

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

  const abilityInitials = (label: string) =>
    label
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part[0]!.toUpperCase())
      .join("")
      .slice(0, 2) || label.slice(0, 2).toUpperCase();

  const renderAbilityButton = (
    ability: OffensiveAbility | DefensiveAbility,
    options: {
      ready: boolean;
      selected: boolean;
      disabled: boolean;
      onClick: () => void;
      tooltipParts: string[];
    }
  ) => {
    const abilityName =
      ability.displayName ?? ability.label ?? ability.combo;
    const hasUltimate =
      "ultimate" in (ability as Partial<OffensiveAbility>) &&
      Boolean((ability as Partial<OffensiveAbility>).ultimate);

    return (
      <button
        key={ability.combo}
        type='button'
        className={clsx(
          abilityStyles.iconButton,
          options.ready && abilityStyles.ready,
          options.selected && abilityStyles.selected,
          hasUltimate && abilityStyles.ultimate
        )}
        onClick={options.onClick}
        disabled={options.disabled}
        title={[abilityName, ...options.tooltipParts].join(" - ")}
      >
        <span className={abilityStyles.iconLabel}>
          {abilityInitials(abilityName)}
        </span>
        {hasUltimate && (
          <span className={abilityStyles.smallBadge}>ULT</span>
        )}
      </button>
    );
  };

  if (isDefenseTurn) {
    return (
      <div className={abilityStyles.panel}>
        <div className={abilityStyles.title}>{`Defensive Abilities (${hero.name})`}</div>
        <div className={abilityStyles.grid}>
          {(defenseAbilities as DefensiveAbility[]).map((ability) => {
            const ready = !!readyCombos[ability.combo];
            const selected = defenseSelection === ability.combo;
            const canSelect = awaitingDefenseSelection && ready;

            const tooltipParts: string[] = [];
            if (ability.block != null)
              tooltipParts.push(`Block ${ability.block}`);
            if (ability.reflect != null)
              tooltipParts.push(`Reflect ${ability.reflect}`);
            if (ability.heal != null) tooltipParts.push(`Heal ${ability.heal}`);
            if (ability.retaliatePercent != null)
              tooltipParts.push(`Retaliate ${ability.retaliatePercent}%`);

            const effectsText = formatEffects(
              buildEffects(ability.apply as ApplyMap)
            );
            if (effectsText) tooltipParts.push(effectsText);

            return renderAbilityButton(ability, {
              ready,
              selected,
              disabled: !canSelect,
              onClick: () => onChooseDefenseOption(ability.combo),
              tooltipParts,
            });
          })}
        </div>
      </div>
    );
  }

  const canSelectOffense =
    state.turn === "you" && !statusActive && !state.rolling.some(Boolean);
  const selectedComboReady = selectedAttackCombo
    ? Boolean(readyCombos?.[selectedAttackCombo])
    : false;
  const canConfirmAttack =
    selectedAttackCombo !== null &&
    state.turn === "you" &&
    !statusActive &&
    !state.rolling.some(Boolean) &&
    state.rollsLeft < 3 &&
    selectedComboReady &&
    !impactLocked;

  return (
    <div className={abilityStyles.panel}>
      <div className={abilityStyles.title}>{`Your Abilities (${hero.name})`}</div>
      <div className={abilityStyles.grid}>
        {(offenseAbilities as OffensiveAbility[]).map((ability) => {
          const ready = !!readyCombos[ability.combo];
          const selected = selectedAttackCombo === ability.combo;
          const canSelect = canSelectOffense && ready;
          const effectsText = formatEffects(buildEffects(ability.apply));
          const tooltipParts: string[] = [];
          if (ability.damage != null) tooltipParts.push(`${ability.damage} dmg`);
          if (effectsText) tooltipParts.push(effectsText);

          return renderAbilityButton(ability, {
            ready,
            selected,
            disabled: !canSelect,
            onClick: () =>
              onSelectAttackCombo(selected ? null : ability.combo),
            tooltipParts,
          });
        })}
      </div>
      {selectedAttackCombo && (
        <div className={abilityStyles.actions}>
          <button
            type='button'
            className='btn success'
            onClick={onConfirmAttack}
            disabled={!canConfirmAttack}
            title={
              state.rollsLeft >= 3
                ? "Roll at least once before confirming"
                : "Confirm selected attack"
            }>
            Confirm Attack
          </button>
        </div>
      )}
    </div>
  );
}
