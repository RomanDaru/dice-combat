import React from "react";
import Section from "./Section";

export function TipsPanel() {
  return (
    <Section title='Tips'>
      <ul
        style={{
          paddingLeft: 18,
          fontSize: 14,
          color: "#d4d4d8",
          display: "grid",
          gap: 4,
        }}>
        <li>Click a die to hold it. Held dice stay locked through rolls.</li>
        <li>Confirm Attack becomes available after your first roll this turn.</li>
        <li>Pyromancer defense: roll 5-6 to block 2 dmg, 3-4 to block 1 dmg.</li>
        <li>Burn ticks in upkeep; roll 5-6 afterwards to clear it, otherwise it persists.</li>
        <li>Evasive is consumed when used; a 5+ completely dodges the attack.</li>
      </ul>
    </Section>
  );
}

