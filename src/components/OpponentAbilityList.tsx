import React, { useMemo } from "react";
import clsx from "clsx";
import { useGame } from "../context/GameContext";
import { useGameData } from "../context/GameController";
import { getOffensiveAbilities } from "../game/abilityBoards";
import type { OffensiveAbility } from "../game/types";
import abilityStyles from "./AbilityIcons.module.css";

const iconLabelFor = (ability: OffensiveAbility) => {
  const base = ability.displayName ?? ability.label ?? ability.combo;
  return base
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

export function OpponentAbilityList() {
  const { state } = useGame();
  const { readyForAI } = useGameData();

  const opponent = state.players.ai;
  const hero = opponent.hero;
  const abilities = useMemo(() => getOffensiveAbilities(hero), [hero]);

  return (
    <div className={abilityStyles.panel}>
      <div className={abilityStyles.title}>{`Opponent Abilities (${hero.name})`}</div>
      <div className={abilityStyles.grid}>
        {abilities.map((ability) => {
          const ready = !!readyForAI?.[ability.combo];
          const className = clsx(
            abilityStyles.iconButton,
            ready && abilityStyles.ready,
            ability.ultimate && abilityStyles.ultimate
          );
          return (
            <button
              key={ability.combo}
              type='button'
              className={className}
              title={ability.displayName ?? ability.label ?? ability.combo}
              disabled>
              <span className={abilityStyles.iconLabel}>
                {iconLabelFor(ability)}
              </span>
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
