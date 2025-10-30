import React, { useMemo } from "react";
import { useGame } from "../context/GameContext";
import { useGameData } from "../context/GameController";
import { getOffensiveAbilities } from "../game/abilityBoards";
import { getEffectDefinition } from "../game/effects";
import type { OffensiveAbility } from "../game/types";
import { OffenseRow } from "./AbilityRows";

const formatEffects = (ability: OffensiveAbility) => {
  if (!ability.apply) return "";
  const defs = [
    { key: "burn" as const, fallbackName: "Burn", fallbackIcon: "B" },
    { key: "chi" as const, fallbackName: "Chi", fallbackIcon: "C" },
    { key: "evasive" as const, fallbackName: "Evasive", fallbackIcon: "E" },
  ];
  return defs
    .map((entry) => {
      const val = ability.apply?.[entry.key];
      if (!val) return null;
      const def = getEffectDefinition(entry.key);
      return `${def?.icon ?? entry.fallbackIcon} ${
        def?.name ?? entry.fallbackName
      } +${val}`;
    })
    .filter(Boolean)
    .join(" | ");
};

export function OpponentAbilityList() {
  const { state } = useGame();
  const { readyForAI } = useGameData();

  const opponent = state.players.ai;
  const hero = opponent.hero;
  const abilities = useMemo(() => getOffensiveAbilities(hero), [hero]);

  return (
    <div className='card'>
      <div className='label'>{`Opponent Abilities (${hero.name})`}</div>

      <div style={{ display: "grid", gap: 6 }}>
        {abilities.map((ability) => {
          const ready = !!readyForAI?.[ability.combo];
          const effectsText = formatEffects(ability);
          return (
            <OffenseRow
              key={ability.combo}
              ability={ability}
              ready={ready}
              selected={false}
              canSelect={false}
              effectsText={effectsText}
              onSelect={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}
