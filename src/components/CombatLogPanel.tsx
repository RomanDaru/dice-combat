import React from "react";
import Section from "./Section";
import { useGame } from "../context/GameContext";

export function CombatLogPanel() {
  const { state } = useGame();
  const { log } = state;

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
        {log.map((entry, idx) => (
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
