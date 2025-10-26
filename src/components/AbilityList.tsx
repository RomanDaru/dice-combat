import { useGame } from "../context/GameContext";
import { useGameData } from "../context/GameController";
import { getEffectDefinition } from "../game/effects";
import type { Combo } from "../game/types";

type AbilityListProps = {
  side: "you" | "ai";
};

const formatEffects = (effects: string[]) =>
  effects.length ? effects.join(" · ") : null;

export default function AbilityList({ side }: AbilityListProps) {
  const { state } = useGame();
  const { readyForActing, readyForAI } = useGameData();
  const hero = state.players[side].hero;
  const readyCombos =
    (side === "you" ? readyForActing : readyForAI) as Record<Combo, boolean>;
  const title =
    side === "you"
      ? `Tvoje schopnosti (${hero.name})`
      : `Opponent Abilities (${hero.name})`;

  return (
    <div className='card'>
      <div className='label'>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {hero.abilities.map((ability) => {
          const ready = readyCombos ? readyCombos[ability.combo] : false;
          const effects: string[] = [];
          if (ability.apply?.burn) {
            const effect = getEffectDefinition("burn");
            effects.push(
              `${effect?.icon ?? "??"} ${effect?.name ?? "Burn"} +${
                ability.apply.burn
              }`
            );
          }
          if (ability.apply?.chi) {
            const effect = getEffectDefinition("chi");
            effects.push(
              `${effect?.icon ?? "?"} ${effect?.name ?? "Chi"} +${
                ability.apply.chi
              }`
            );
          }
          if (ability.apply?.evasive) {
            const effect = getEffectDefinition("evasive");
            effects.push(
              `${effect?.icon ?? "?"} ${effect?.name ?? "Evasive"} +${
                ability.apply.evasive
              }`
            );
          }

          return (
            <div
              key={ability.combo}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${ready ? "#6366f1" : "#27272a"}`,
                background: ready ? "rgba(30,27,75,.3)" : "rgba(24,24,27,.4)",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className='badge'
                  style={{ background: ability.ultimate ? "#6d28d9" : "#52525b" }}>
                  {ability.ultimate ? "ULT" : "SK"}
                </span>
                <span>{ability.label ?? ability.combo}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className='num' style={{ color: "#e4e4e7" }}>
                  {ability.damage} dmg
                </span>
                {formatEffects(effects) && (
                  <span style={{ color: "#a1a1aa", fontSize: 12 }}>
                    {formatEffects(effects)}
                  </span>
                )}
                {ready && <span className='badge indigo'>READY</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}