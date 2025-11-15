import React, { useMemo } from "react";
import clsx from "clsx";
import type { Hero } from "../game/types";
import type { DefenseSchemaResolution } from "../defense/resolver";
import type {
  DefenseEffectConfig,
  DefenseField,
  DefenseMatcherConfig,
} from "../defense/types";
import styles from "./DefenseSchemaPanel.module.css";

type DefenseSchemaPanelProps = {
  hero: Hero;
  activeSchema?: DefenseSchemaResolution | null;
  variant?: "default" | "minimal";
};

const formatRuleLabel = (rule: { id: string; label?: string }) =>
  rule.label ?? rule.id;

export const DefenseSchemaPanel = ({
  hero,
  activeSchema,
  variant = "default",
}: DefenseSchemaPanelProps) => {
  const baseSchema = hero.defenseSchema;
  const isMinimal = variant === "minimal";
  const ruleHits = useMemo(() => {
    if (!activeSchema) return null;
    return new Map(activeSchema.rules.map((rule) => [rule.id, rule]));
  }, [activeSchema]);

  if (!baseSchema) {
    return null;
  }

  const fieldLabel = (fieldId: string): string => {
    const field = (baseSchema.fields as DefenseField[]).find((f) => f.id === fieldId);
    return field?.label ?? field?.id ?? fieldId;
  };

  const triggerLabel = (matcher: DefenseMatcherConfig): string => {
    switch (matcher.type) {
      case "countField":
        return fieldLabel(matcher.fieldId);
      case "pairsField":
        return `pair in ${fieldLabel(matcher.fieldId)}`;
      case "exactFace":
        return `face ${matcher.face}`;
      case "combo": {
        const parts = matcher.fields.map((f) => `${fieldLabel(f.id)}≥${f.min}`);
        return parts.length ? parts.join(" + ") : "combo";
      }
      default:
        return "";
    }
  };

  const isForEach = (effect: DefenseEffectConfig): boolean => {
    switch (effect.type) {
      case "blockPer":
      case "dealPer":
      case "reflect":
        return true;
      default:
        return false;
    }
  };

  const effectText = (
    effect: DefenseEffectConfig,
    matcher: DefenseMatcherConfig
  ): string => {
    const trg = triggerLabel(matcher);
    const prefix = isForEach(effect) ? "For each" : "On";
    switch (effect.type) {
      case "flatBlock":
        return `${prefix} ${trg}: Block ${effect.amount}${effect.cap ? ` (up to ${effect.cap})` : ""}`;
      case "blockPer":
        return `${prefix} ${trg}: Block ${effect.amount}${effect.cap ? ` (cap ${effect.cap})` : ""}`;
      case "dealPer":
        return `${prefix} ${trg}: Deal ${effect.amount}${effect.cap ? ` (cap ${effect.cap})` : ""}`;
      case "reflect":
        return `${prefix} ${trg}: Reflect ${effect.amount}${effect.cap ? ` (cap ${effect.cap})` : ""}`;
      case "gainStatus":
        return `${prefix} ${trg}: Gain ${effect.status}${effect.stacks ? ` x${effect.stacks}` : ""}`;
      case "applyStatusToOpponent":
        return `${prefix} ${trg}: Inflict ${effect.status}${effect.stacks ? ` x${effect.stacks}` : ""}`;
      case "preventHalf":
        return `${prefix} ${trg}: Prevent Half${effect.stacks ? ` x${effect.stacks}` : ""}`;
      case "heal":
        return `${prefix} ${trg}: Heal ${effect.amount}`;
      case "cleanse":
        return `${prefix} ${trg}: Cleanse${effect.amount ? ` ${effect.amount}` : ""}`;
      case "transferStatus":
        return `${prefix} ${trg}: Transfer ${effect.status}${effect.amount ? ` x${effect.amount}` : ""} (${effect.from}→${effect.to})`;
      case "rerollDice": {
        const fields = effect.fields?.length ? ` in ${effect.fields.join(", ")}` : "";
        return `${prefix} ${trg}: Reroll ${effect.count} dice${fields}`;
      }
      default:
        return `${prefix} ${trg}: ${effect.type}`;
    }
  };

  return (
    <div className={styles.schemaPanel}>
      {!isMinimal && (
        <div className={styles.schemaHeader}>
          Defense Schema
          {hero.defenseVersion ? (
            <span className={styles.versionTag}>{hero.defenseVersion}</span>
          ) : null}
        </div>
      )}
      {!activeSchema && !isMinimal && (
        <div className={styles.placeholder}>Roll to preview rule hits.</div>
      )}
      <ul className={styles.ruleList}>
        {baseSchema.rules.map((rule) => {
          const hit = ruleHits?.get(rule.id);
          const matched = hit?.matched;
          const applied = Boolean(
            hit?.effects?.some((e) => e.outcome === "applied")
          );
          const itemClass = clsx(
            matched ? styles.ruleMatched : styles.ruleIdle,
            applied && styles.ruleApplied
          );
          return (
            <li key={rule.id} className={itemClass}>
              <div className={styles.ruleTitle}>{formatRuleLabel(rule)}</div>
              <div className={styles.ruleMeta}>
                {matched
                  ? `Matched (count ${hit?.matcher.matchCount ?? 0})`
                  : "Awaiting match"}
              </div>
              {Array.isArray(rule.effects) && rule.effects.length > 0 && (
                <div className={styles.ruleMeta}>
                  {rule.effects.map((eff, idx) => (
                    <div key={`${rule.id}-eff-${idx}`}>{effectText(eff as DefenseEffectConfig, rule.matcher as DefenseMatcherConfig)}</div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DefenseSchemaPanel;
