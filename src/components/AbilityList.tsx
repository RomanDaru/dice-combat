import { useGame } from "../context/GameContext";
import { useGameData, useGameController } from "../context/GameController";
import {
  getOffensiveAbilities,
  getDefensiveAbilities,
} from "../game/abilityBoards";
import { getEffectDefinition } from "../game/effects";
import type { Combo } from "../game/types";

type AbilityListProps = {
  side: "you" | "ai";
};

const formatEffects = (effects: string[]) =>
  effects.length ? effects.join(" | ") : null;

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

  const hero = state.players[side].hero;
  const showingDefenseBoard = side === "you" && isDefenseTurn;
  const abilities = showingDefenseBoard
    ? getDefensiveAbilities(hero)
    : getOffensiveAbilities(hero);

  const readyCombos: Record<Combo, boolean> = {};
  if (showingDefenseBoard) {
    defenseRoll?.options.forEach((option) => {
      readyCombos[option.combo] = true;
    });
  } else {
    const source = (side === "you" ? readyForActing : readyForAI) as Record<
      Combo,
      boolean
    >;
    if (source) {
      Object.keys(source).forEach((combo) => {
        readyCombos[combo as Combo] = source[combo as Combo];
      });
    }
  }

  const title =
    side === "you"
      ? showingDefenseBoard
        ? `Defensive abilities (${hero.name})`
        : `Tvoje schopnosti (${hero.name})`
      : `Opponent Abilities (${hero.name})`;

  return (
    <div className='card'>
      <div className='label'>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {abilities.map((ability) => {
          const ready = readyCombos ? readyCombos[ability.combo] : false;
          const effects: string[] = [];
          if (ability.apply?.burn) {
            const effect = getEffectDefinition("burn");
            effects.push(
              `${effect?.icon ?? "B"} ${effect?.name ?? "Burn"} +${
                ability.apply.burn
              }`
            );
          }
          if (ability.apply?.chi) {
            const effect = getEffectDefinition("chi");
            effects.push(
              `${effect?.icon ?? "C"} ${effect?.name ?? "Chi"} +${
                ability.apply.chi
              }`
            );
          }
          if (ability.apply?.evasive) {
            const effect = getEffectDefinition("evasive");
            effects.push(
              `${effect?.icon ?? "E"} ${effect?.name ?? "Evasive"} +${
                ability.apply.evasive
              }`
            );
          }

          const defenseStats: string[] = [];
          if (showingDefenseBoard) {
            if (ability.block !== undefined)
              defenseStats.push(`Block ${ability.block}`);
            if (ability.reflect)
              defenseStats.push(`Reflect ${ability.reflect}`);
            if (ability.heal) defenseStats.push(`Heal ${ability.heal}`);
            if (ability.retaliatePercent)
              defenseStats.push(
                `Retaliate ${Math.round(ability.retaliatePercent * 100)}%`
              );
          }

          const selected =
            showingDefenseBoard && defenseSelection === ability.combo;
          const canSelect =
            showingDefenseBoard && awaitingDefenseSelection && ready;

          return (
            <div
              key={ability.combo}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${
                  selected ? "#facc15" : ready ? "#6366f1" : "#27272a"
                }`,
                background: selected
                  ? "rgba(234,179,8,.25)"
                  : ready
                  ? "rgba(30,27,75,.3)"
                  : "rgba(24,24,27,.4)",
                cursor: canSelect ? "pointer" : "default",
              }}
              onClick={() => {
                if (canSelect) onChooseDefenseOption(ability.combo);
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className='badge'
                  style={{
                    background: ability.ultimate ? "#6d28d9" : "#52525b",
                  }}>
                  {ability.combo}
                </span>
                <span>
                  {ability.displayName ?? ability.label ?? ability.combo}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {showingDefenseBoard ? (
                  defenseStats.length > 0 && (
                    <span className='num' style={{ color: "#e4e4e7" }}>
                      {defenseStats.join(" | ")}
                    </span>
                  )
                ) : (
                  <span className='num' style={{ color: "#e4e4e7" }}>
                    {ability.damage} dmg
                  </span>
                )}
                {formatEffects(effects) && (
                  <span style={{ color: "#a1a1aa", fontSize: 12 }}>
                    {formatEffects(effects)}
                  </span>
                )}
                {ready && (
                  <span className='badge indigo'>
                    {showingDefenseBoard ? "ROLLED" : "READY"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
