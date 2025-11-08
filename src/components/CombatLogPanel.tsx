import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import Section from "./Section";
import { useGame } from "../context/GameContext";
import { scheduleAnimationFrame, scheduleTimeout } from "../utils/timers";
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
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const highlightTimerRef = useRef<(() => void) | null>(null);
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!log.length) return;
    const latestIdx = log.length - 1;
    const latestText = log[latestIdx]?.t?.trim();
    if (!latestText) return;
    setHighlightIndex(latestIdx);
    if (highlightTimerRef.current) {
      highlightTimerRef.current();
      highlightTimerRef.current = null;
    }
    highlightTimerRef.current = scheduleTimeout(() => {
      setHighlightIndex(null);
    }, 1100);
  }, [log]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        highlightTimerRef.current();
        highlightTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const element = logScrollRef.current;
    if (!element) return;
    const cancelFrame = scheduleAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => {
      cancelFrame();
    };
  }, [log.length]);

  return (
    <Section title='Combat Log'>
      <div ref={logScrollRef} className={styles.logScroll}>
        {log.map((entry, idx) => {
          const text = entry.t ?? "";
          const trimmed = text.trim();

          if (!trimmed) {
            return <div key={`sep-${idx}`} className={styles.separator} />;
          }

          const lines = text.split("\n");
          const header = isRoundHeader(trimmed);
          const highlight = !header && idx === highlightIndex;
          const entryClass = clsx(
            styles.entry,
            header && styles.roundHeader,
            highlight && styles.entryHighlight
          );

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
