import React from "react";
import Section from "./Section";
import type { GameState } from "../game/state";

type CombatLogPanelProps = {
  entries: GameState["log"];
};

export function CombatLogPanel({ entries }: CombatLogPanelProps) {
  return (
    <Section title='Combat Log'>
      <div
        style={{
          display: "grid",
          gap: 8,
          maxHeight: 360,
          overflow: "auto",
          paddingRight: 4,
        }}>
        {entries.map((entry, idx) => (
          <div
            key={idx}
            style={{
              fontSize: 14,
              color: "#e5e7eb",
              whiteSpace: "pre-wrap",
            }}>
            {entry.t}
          </div>
        ))}
      </div>
    </Section>
  );
}

