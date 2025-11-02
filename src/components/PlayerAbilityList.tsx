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
import { getStatus, getStacks, type StatusId } from "../engine/status";
import abilityStyles from "./AbilityIcons.module.css";
import ArtButton from "./ArtButton";
import { getAbilityIcon } from "../assets/abilityIconMap";

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
    defenseBaseBlock,
  } = useGameData();
  const {
    onChooseDefenseOption,
    onSelectAttackCombo,
    onConfirmAttack,
    onConfirmDefense,
    onEndTurnNoAttack,
    attackStatusRequests,
    defenseStatusRequests,
    requestStatusSpend,
    undoStatusSpend,
    turnChiAvailable,
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
      variant: "offense" | "defense";
    }
  ) => {
    const abilityName =
      ability.displayName ?? ability.label ?? ability.combo;
    const hasUltimate =
      "ultimate" in (ability as Partial<OffensiveAbility>) &&
      Boolean((ability as Partial<OffensiveAbility>).ultimate);
    const iconSources =
      getAbilityIcon(hero.id, ability.combo as Combo, {
        variant: options.variant,
      }) ?? null;

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
        {iconSources ? (
          <picture className={abilityStyles.iconPicture}>
            {iconSources.webp && (
              <source srcSet={iconSources.webp} type='image/webp' />
            )}
            <img
              src={iconSources.png}
              alt={abilityName}
              className={abilityStyles.iconImage}
              draggable={false}
            />
          </picture>
        ) : (
          <span className={abilityStyles.iconLabel}>
            {abilityInitials(abilityName)}
          </span>
        )}
        {hasUltimate && (
          <span className={abilityStyles.smallBadge}>ULT</span>
        )}
      </button>
    );
  };

  const inRollPhase = state.phase === "roll";
  const canSelectOffense =
    state.turn === "you" && inRollPhase && !statusActive && !state.rolling.some(Boolean);
  const selectedComboReady = selectedAttackCombo
    ? Boolean(readyCombos?.[selectedAttackCombo])
    : false;
  const canConfirmAttack =
    selectedAttackCombo !== null &&
    state.turn === "you" &&
    inRollPhase &&
    !statusActive &&
    !state.rolling.some(Boolean) &&
    state.rollsLeft < 3 &&
    selectedComboReady &&
    !impactLocked;
  const canConfirmDefense = awaitingDefenseSelection && !impactLocked;
  const hasAttackOptions = Object.values(readyCombos ?? {}).some(Boolean);
  const canEndTurn =
    !isDefenseTurn &&
    inRollPhase &&
    !hasAttackOptions &&
    state.rollsLeft <= 0 &&
    state.turn === "you" &&
    !statusActive &&
    !impactLocked &&
    !state.rolling.some(Boolean);

  const spendControls = (() => {
    const shouldShow =
      (isDefenseTurn && awaitingDefenseSelection && !impactLocked) ||
      (!isDefenseTurn && canConfirmAttack);
    if (!shouldShow) return null;

    const spendPhase = isDefenseTurn ? "defenseRoll" : "attackRoll";
    const baseBlockForDefense = defenseBaseBlock ?? 0;
    const statusRequests = isDefenseTurn
      ? defenseStatusRequests
      : attackStatusRequests;
    const tokens = player.tokens ?? {};
    const ids = new Set<StatusId>();

    Object.entries(tokens).forEach(([rawId, stacks]) => {
      if ((stacks ?? 0) <= 0) return;
      const statusId = rawId as StatusId;
      const definition = getStatus(statusId);
      if (!definition?.spend) return;
      if (
        isDefenseTurn &&
        statusId === "chi" &&
        baseBlockForDefense <= 0
      ) {
        return;
      }
      if (definition.spend.needsRoll) return;
      if (!definition.spend.allowedPhases.includes(spendPhase)) return;
      ids.add(statusId);
    });

    Object.keys(statusRequests).forEach((rawId) => {
      const statusId = rawId as StatusId;
      const definition = getStatus(statusId);
      if (!definition?.spend) return;
      if (
        isDefenseTurn &&
        statusId === "chi" &&
        baseBlockForDefense <= 0
      ) {
        return;
      }
      if (definition.spend.needsRoll) return;
      if (!definition.spend.allowedPhases.includes(spendPhase)) return;
      ids.add(statusId);
    });

    const spendable = Array.from(ids)
      .map((statusId) => ({
        statusId,
        definition: getStatus(statusId),
      }))
      .sort((a, b) => {
        const nameA = a.definition?.name ?? a.statusId;
        const nameB = b.definition?.name ?? b.statusId;
        return nameA.localeCompare(nameB);
      });

    if (spendable.length === 0) return null;

    return (
      <div className={abilityStyles.spendControls}>
        {spendable.map(({ statusId, definition }) => {
          const name = definition?.name ?? statusId;
          const icon = definition?.icon ?? name.slice(0, 2).toUpperCase();
          const ownedStacks = getStacks(player.tokens, statusId, 0);
          const requested = statusRequests[statusId] ?? 0;
          const maxSpend =
            statusId === "chi"
              ? Math.min(ownedStacks, turnChiAvailable.you ?? ownedStacks)
              : ownedStacks;
          const canIncrement = requested < maxSpend && maxSpend > 0;
          const canDecrement = requested > 0;
          const handleAdjust = (delta: number) => {
            if (delta > 0) {
              requestStatusSpend(spendPhase, statusId);
            } else {
              undoStatusSpend(spendPhase, statusId);
            }
          };

          return (
            <div key={statusId} className={abilityStyles.spendRow}>
              <div className={abilityStyles.spendInfo}>
                <span className={abilityStyles.spendBadge}>{icon}</span>
                <span className={abilityStyles.spendLabel}>{name}</span>
                <span className={abilityStyles.spendCount}>
                  {requested}/{maxSpend}
                </span>
              </div>
              <div className={abilityStyles.spendButtons}>
                <ArtButton
                  variant='square'
                  className={abilityStyles.spendButton}
                  onClick={() => handleAdjust(-1)}
                  disabled={!canDecrement}>
                  -
                </ArtButton>
                <ArtButton
                  variant='square'
                  className={abilityStyles.spendButton}
                  onClick={() => handleAdjust(1)}
                  disabled={!canIncrement}>
                  +
                </ArtButton>
              </div>
            </div>
          );
        })}
      </div>
    );
  })();

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
              variant: "defense",
            });
          })}
        </div>
        {awaitingDefenseSelection && (
          <>
            {spendControls}
            <div className={abilityStyles.actions}>
              <button
                type='button'
                className='btn success'
                onClick={onConfirmDefense}
                disabled={!canConfirmDefense}>
                Confirm Defense
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
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
            variant: "offense",
          });
        })}
      </div>
      {selectedAttackCombo && spendControls}
      {!selectedAttackCombo && canEndTurn && (
        <div className={abilityStyles.actions}>
          <button
            type='button'
            className='btn secondary'
            onClick={onEndTurnNoAttack}>
            End Turn
          </button>
        </div>
      )}
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
