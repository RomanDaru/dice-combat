import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AbilityVerdict } from "./abilityTieringTypes";

export type AbilityHistoryEntry = {
  abilityId: string;
  verdict: AbilityVerdict;
  evEff: number;
  score: number;
  timestamp: number;
  reportPath: string;
};

export type AbilityHistoryMap = Record<string, AbilityHistoryEntry[]>;

export type ReportIndexEntry = {
  path: string;
  timestamp: number;
  youHeroId: string;
  aiHeroId: string;
  policyId: string;
  games: number;
  abilityVerdicts: Record<
    string,
    { verdict: AbilityVerdict; evEff: number; score: number }
  >;
};

export type ReportIndex = {
  reports: ReportIndexEntry[];
};

const ensureDir = (path: string) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
};

export const readReportIndex = (path: string): ReportIndex => {
  try {
    if (!existsSync(path)) {
      return { reports: [] };
    }
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as ReportIndex;
    if (!parsed.reports) {
      return { reports: [] };
    }
    return parsed;
  } catch {
    return { reports: [] };
  }
};

export const writeReportIndex = (
  path: string,
  index: ReportIndex
): void => {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(index, null, 2), "utf-8");
};

export const appendReportIndex = (
  index: ReportIndex,
  entry: ReportIndexEntry,
  maxEntries = 200
): ReportIndex => {
  const next = [...index.reports, entry].sort(
    (a, b) => a.timestamp - b.timestamp
  );
  while (next.length > maxEntries) {
    next.shift();
  }
  return { reports: next };
};

export const buildAbilityHistoryMap = (
  index: ReportIndex,
  filters: {
    youHeroId: string;
    aiHeroId: string;
    policyId: string;
    limit?: number;
  }
): AbilityHistoryMap => {
  const relevant = index.reports
    .filter(
      (entry) =>
        entry.youHeroId === filters.youHeroId &&
        entry.aiHeroId === filters.aiHeroId &&
        entry.policyId === filters.policyId
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  const limited =
    typeof filters.limit === "number" && filters.limit > 0
      ? relevant.slice(-filters.limit)
      : relevant;
  const historyMap: AbilityHistoryMap = {};
  limited.forEach((entry) => {
    Object.entries(entry.abilityVerdicts).forEach(
      ([abilityId, verdictSummary]) => {
        if (!historyMap[abilityId]) {
          historyMap[abilityId] = [];
        }
        historyMap[abilityId].push({
          abilityId,
          verdict: verdictSummary.verdict,
          evEff: verdictSummary.evEff,
          score: verdictSummary.score,
          timestamp: entry.timestamp,
          reportPath: entry.path,
        });
      }
    );
  });
  return historyMap;
};
