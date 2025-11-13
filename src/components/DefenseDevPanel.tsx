import React, { useMemo, useState } from "react";
import clsx from "clsx";
import { useGame } from "../context/GameContext";
import { useGameController, useGameData } from "../context/GameController";
import { useStatsTracker } from "../context/StatsContext";
import styles from "./DefenseDevPanel.module.css";

const VERSION_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "Force v1", value: "v1" },
  { label: "Force v2", value: "v2" },
];

export const DefenseDevPanel = () => {
  if (!import.meta.env.DEV) {
    return null;
  }

  const { state } = useGame();
  const { defenseRoll } = useGameData();
  const stats = useStatsTracker();
  const {
    devDefenseOverrides,
    setDefenseVersionOverride,
  } = useGameController();
  const [collapsed, setCollapsed] = useState(false);

  const totals = stats.getSnapshot()?.gameStats?.defenseMeta?.totals;
  const playerHero = state.players.you.hero;
  const aiHero = state.players.ai.hero;

  const schemaRules = useMemo(() => {
    return defenseRoll?.schema?.rules ?? [];
  }, [defenseRoll]);

  const renderVersionSelect = (label: string, heroId: string) => {
    const value = devDefenseOverrides[heroId] ?? "auto";
    return (
      <label className={styles.selectRow} key={heroId}>
        <span>{label}</span>
        <select
          value={value}
          onChange={(event) => {
            const next = event.target.value as "auto" | "v1" | "v2";
            setDefenseVersionOverride(
              heroId,
              next === "auto" ? null : (next as "v1" | "v2")
            );
          }}
        >
          {VERSION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div
      className={clsx(
        styles.devPanel,
        collapsed ? styles.devPanelCollapsed : undefined
      )}
    >
      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setCollapsed((prev) => !prev)}
      >
        {collapsed ? "Show Defense HUD" : "Hide Defense HUD"}
      </button>
      {!collapsed && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>A/B Defense Version</div>
            {renderVersionSelect(
              `You (${playerHero.name})`,
              playerHero.id
            )}
            {renderVersionSelect(
              `AI (${aiHero.name})`,
              aiHero.id
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Rule Diagnostics</div>
            {schemaRules.length === 0 ? (
              <div className={styles.placeholder}>
                Roll defense to populate schema diagnostics.
              </div>
            ) : (
              <ul className={styles.ruleList}>
                {schemaRules.map((rule) => (
                  <li key={rule.id}>
                    <span>{rule.label ?? rule.id}</span>
                    <span>
                      {rule.matched
                        ? `Matched (${rule.matcher.matchCount})`
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Telemetry Totals</div>
            {totals ? (
              <ul className={styles.telemetryList}>
                <li>
                  Defense Roll Block: {totals.blockFromDefenseRoll.toFixed(2)}
                </li>
                <li>
                  Status Block: {totals.blockFromStatuses.toFixed(2)}
                </li>
                <li>Prevent Half Events: {totals.preventHalfEvents}</li>
                <li>Prevent All Events: {totals.preventAllEvents}</li>
                <li>Reflect Sum: {totals.reflectSum.toFixed(2)}</li>
                <li>Wasted Block: {totals.wastedBlockSum.toFixed(2)}</li>
              </ul>
            ) : (
              <div className={styles.placeholder}>No telemetry yet.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DefenseDevPanel;
