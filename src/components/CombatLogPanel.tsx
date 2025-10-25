import React from "react";
import Section from "./Section";
import { useGame } from "../context/GameContext";
import styles from "./CombatLogPanel.module.css";

const getTokenClass = (type: string, value?: string) => {
  switch (type) {
    case "ability":
      return styles.tokenAbility;
    case "status":
      return styles.tokenStatus;
    case "resource":
      switch ((value ?? "").trim().toLowerCase()) {
        case "chi":
          return styles.tokenResourceChi;
        case "evasive":
          return styles.tokenResourceEvasive;
        default:
          return styles.tokenResource;
      }
    default:
      return styles.tokenDefault;
  }
};

const renderSegments = (line: string, keyPrefix: string) => {
  const segments: React.ReactNode[] = [];
  const regex = /<<(\w+):([^>]+)>>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push(line.slice(lastIndex, match.index));
    }

    const [, type, value] = match;
    segments.push(
      <span
        key={`${keyPrefix}-${match.index}`}
        className={getTokenClass(type, value)}>
        {value}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    segments.push(line.slice(lastIndex));
  }

  if (segments.length === 0) {
    segments.push(line);
  }

  return segments;
};

const isRoundHeader = (text: string) => /^--- Kolo \d+ ---$/.test(text.trim());

export function CombatLogPanel() {
  const { state } = useGame();
  const { log } = state;

  return (
    <Section title='Combat Log'>
      <div className={styles.logScroll}>
        {log.map((entry, idx) => {
          const text = entry.t ?? "";
          const trimmed = text.trim();

          if (!trimmed) {
            return <div key={`sep-${idx}`} className={styles.separator} />;
          }

          const lines = text.split("\n");
          const header = isRoundHeader(trimmed);
          const entryClass = header
            ? `${styles.entry} ${styles.roundHeader}`
            : styles.entry;

          return (
            <div key={idx} className={entryClass}>
              {lines.map((line, lineIdx) => {
                const keyPrefix = `${idx}-${lineIdx}`;
                const lineClasses = [styles.line];
                if (line.startsWith(" > ")) {
                  lineClasses.push(styles.lineIndented);
                }
                const segments = renderSegments(line, keyPrefix);
                return (
                  <span key={keyPrefix} className={lineClasses.join(" ")}>
                    {segments}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
