import React, { useMemo } from "react";
import type { Hero } from "../game/types";
import type { DefenseSchemaResolution } from "../defense/resolver";
import styles from "./DefenseSchemaPanel.module.css";

type DefenseSchemaPanelProps = {
  hero: Hero;
  activeSchema?: DefenseSchemaResolution | null;
};

const formatRuleLabel = (rule: { id: string; label?: string }) =>
  rule.label ?? rule.id;

export const DefenseSchemaPanel = ({
  hero,
  activeSchema,
}: DefenseSchemaPanelProps) => {
  const baseSchema = hero.defenseSchema;
  const ruleHits = useMemo(() => {
    if (!activeSchema) return null;
    return new Map(activeSchema.rules.map((rule) => [rule.id, rule]));
  }, [activeSchema]);

  if (!baseSchema) {
    return null;
  }

  return (
    <div className={styles.schemaPanel}>
      <div className={styles.schemaHeader}>
        Defense Schema
        {hero.defenseVersion ? (
          <span className={styles.versionTag}>{hero.defenseVersion}</span>
        ) : null}
      </div>
      {activeSchema ? (
        <div className={styles.diceRow}>
          Dice:{" "}
          {activeSchema.dice.map((die, index) => (
            <span key={`die-${index}`} className={styles.die}>
              {die}
            </span>
          ))}
        </div>
      ) : (
        <div className={styles.placeholder}>Roll to preview rule hits.</div>
      )}
      <ul className={styles.ruleList}>
        {baseSchema.rules.map((rule) => {
          const hit = ruleHits?.get(rule.id);
          const matched = hit?.matched;
          return (
            <li
              key={rule.id}
              className={matched ? styles.ruleMatched : styles.ruleIdle}
            >
              <div className={styles.ruleTitle}>{formatRuleLabel(rule)}</div>
              <div className={styles.ruleMeta}>
                {matched
                  ? `Matched (count ${hit?.matcher.matchCount ?? 0})`
                  : "Awaiting match"}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DefenseSchemaPanel;
