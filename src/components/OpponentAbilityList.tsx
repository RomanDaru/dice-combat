import React, { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useGame } from "../context/GameContext";
import { useGameData } from "../context/GameController";
import { getOffensiveAbilities } from "../game/abilityBoards";
import type { OffensiveAbility } from "../game/types";
import { getEffectDefinition } from "../game/effects";
import { getAbilityIcon } from "../assets/abilityIconMap";
import { DefenseSchemaPanel } from "./DefenseSchemaPanel";
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
      out.push(
        `${meta?.icon ?? def.fallbackIcon} ${meta?.name ?? def.fallbackName} +${val}`
      );
    }
  }
  return out;
}

const abilityInitials = (label: string) =>
  label
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join("")
    .slice(0, 2) || label.slice(0, 2).toUpperCase();

const renderTooltip = (
  abilityName: string,
  tooltipParts: string[],
  ready: boolean
) => {
  const lines = [abilityName, ...tooltipParts];
  return (
    <div
      className={clsx(
        abilityStyles.tooltip,
        ready && abilityStyles.tooltipReady
      )}
      role='status'
      aria-live='polite'>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
};

const renderAbilityButton = (
  heroId: string,
  ability: OffensiveAbility,
  options: {
    ready: boolean;
    tooltipParts: string[];
  }
) => {
  const abilityName = ability.displayName ?? ability.label ?? ability.combo;
  const iconVariants = getAbilityIcon(heroId, ability.combo);
  const primarySource = iconVariants?.offense ?? iconVariants?.defense;
  const primaryIconSrc = primarySource?.webp ?? primarySource?.png ?? null;

  return (
    <button
      key={ability.combo}
      type='button'
      className={clsx(
        abilityStyles.iconButton,
        options.ready && abilityStyles.ready,
        ability.ultimate && abilityStyles.ultimate
      )}
      title={abilityName}
      disabled>
      {renderTooltip(abilityName, options.tooltipParts, options.ready)}
      {primarySource && primaryIconSrc ? (
        <picture className={abilityStyles.iconPicture}>
          {primarySource.webp && (
            <source srcSet={primarySource.webp} type='image/webp' />
          )}
          <img
            src={primaryIconSrc}
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
      {ability.ultimate && (
        <span className={abilityStyles.smallBadge}>ULT</span>
      )}
    </button>
  );
};

export function OpponentAbilityList() {
  const { state } = useGame();
  const { readyForAI } = useGameData();

  const opponent = state.players.ai;
  const hero = opponent.hero;
  const abilities = useMemo(() => getOffensiveAbilities(hero), [hero]);
  const aiDefenseSchema = state.aiDefense.defenseSchema ?? null;

  const isAiOffense = state.turn === "ai";

  const [panelSide, setPanelSide] = useState<"offense" | "defense">(
    isAiOffense ? "offense" : "defense"
  );

  useEffect(() => {
    setPanelSide(isAiOffense ? "offense" : "defense");
  }, [isAiOffense]);

  const togglePanelSide = () => {
    setPanelSide((prev) => (prev === "offense" ? "defense" : "offense"));
  };

  const showingDefense = panelSide === "defense";

  const offenseContent = (
    <div className={abilityStyles.grid}>
      {abilities.map((ability) => {
        const ready = !!readyForAI?.[ability.combo];
        const effectsText = formatEffects(buildEffects(ability.apply as ApplyMap));
        const tooltipParts: string[] = [];
        if (ability.damage != null) tooltipParts.push(`${ability.damage} dmg`);
        if (effectsText) tooltipParts.push(effectsText);

        return renderAbilityButton(hero.id, ability, {
          ready,
          tooltipParts,
        });
      })}
    </div>
  );

  const defenseContent = (
    <div className={abilityStyles.schemaWrapper}>
      <DefenseSchemaPanel hero={hero} variant='minimal' activeSchema={aiDefenseSchema} />
    </div>
  );

  return (
    <div className={clsx(abilityStyles.panel, abilityStyles.panelFlip)}>
      <div className={abilityStyles.flipHeader}>
        <span className={abilityStyles.flipLabel}>
          {showingDefense ? "Defense Mode" : "Offense Mode"}
        </span>
        <button
          type='button'
          className={abilityStyles.flipToggle}
          onClick={togglePanelSide}
          aria-pressed={showingDefense}
          aria-label={
            showingDefense
              ? "Show opponent offensive abilities"
              : "Show opponent defense schema"
          }>
          <span>{showingDefense ? "OFF" : "DEF"}</span>
          {"\u21c4"}
        </button>
      </div>
      <div
        className={clsx(
          abilityStyles.panelFlipInner,
          showingDefense && abilityStyles.panelFlipInnerDefense
        )}>
        <div
          className={clsx(
            abilityStyles.panelFace,
            abilityStyles.panelFaceFront
          )}>
          {offenseContent}
        </div>
        <div
          className={clsx(
            abilityStyles.panelFace,
            abilityStyles.panelFaceBack
          )}>
          {defenseContent}
        </div>
      </div>
    </div>
  );
}
