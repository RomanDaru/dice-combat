import type { SimulationResult } from "./simulator";
import type { Side } from "../game/types";
import { HEROES } from "../game/heroes";
import {
  ATTACKER_HP_BINS,
  INITIATIVE_BUCKETS,
  SCORE_THRESHOLDS,
  TIERING_CONSTANTS,
  deriveBucketUseThreshold,
  type HpBin,
  type InitiativeBucketId,
} from "./tieringConfig";
import type { AbilityVerdict } from "./abilityTieringTypes";
import type { AbilityHistoryEntry, AbilityHistoryMap } from "./history";

type InitiativeBucket = {
  heroId: string;
  heroName: string;
  games: number;
  wins: number;
};

type DprSummary = {
  attackOnly: number;
  actual: number;
};

type StatusSummary = {
  applied: number;
  damage: number;
  mitigation: number;
  avgLifetime: number | null;
};

type AbilityBucketAggregate = {
  key: string;
  initiative: InitiativeBucketId;
  hpBin: HpBin;
  uses: number;
  opportunities: number;
  expectedRawBySide: Record<Side, number>;
  expectedRawSqBySide: Record<Side, number>;
  actualBySide: Record<Side, number>;
  actualSq: number;
  actualExpectedRawBySide: Record<Side, number>;
  wins: number;
};

type AbilityAggregate = {
  heroId: string;
  heroName: string;
  combo: string;
  uses: number;
  opportunities: number;
  expectedRawBySide: Record<Side, number>;
  expectedRawSqBySide: Record<Side, number>;
  actualBySide: Record<Side, number>;
  actualSq: number;
  actualExpectedRawBySide: Record<Side, number>;
  actual: number;
  wins: number;
  sideUses: Record<Side, number>;
  sideWins: Record<Side, number>;
  buckets: Record<string, AbilityBucketAggregate>;
};

type Role = InitiativeBucketId;

type RoleAccumulator = {
  damageBase: number;
  damageActual: number;
  turns: number;
  blocked: number;
  prevented: number;
  incoming: number;
  statusApplied: Record<string, number>;
  statusDamage: Record<string, number>;
  statusMitigation: Record<string, number>;
};

type InitiativeMetrics = {
  dpr: DprSummary;
  mitigation: {
    blockedPercent: number;
    preventedPercent: number;
  };
  statuses: Record<string, StatusSummary>;
};

export type AbilityBucketSummary = {
  key: string;
  initiative: InitiativeBucketId;
  hpBinId: string;
  hpLabel: string;
  uses: number;
  opportunities: number;
  pickRate: number;
  opportunityRate: number;
  evEff: number | null;
  evEffCi: [number, number] | null;
  passesFilter: boolean;
};

export type AbilitySummary = {
  abilityId: string;
  heroId: string;
  heroName: string;
  combo: string;
  label: string;
  uses: number;
  opportunities: number;
  pickRate: number;
  opportunityRate: number;
  expected: number;
  actual: number;
  evEff: number;
  evEffCi: [number, number] | null;
  evEffPValue: number | null;
  evEffFdr: number | null;
  winRateAfterUse: number | null;
  uplift: number | null;
  upliftCi: [number, number] | null;
  buckets: AbilityBucketSummary[];
  consistency: number | null;
  score: number;
  variancePenalty: number;
  nichePenalty: number;
  verdict: AbilityVerdict;
  hysteresisLocked: boolean;
  notes: string | null;
};

export type SimulationAnalytics = {
  initiative: InitiativeBucket[];
  ttk: {
    average: number;
    median: number;
    iqr: number;
    histogram: Array<{ round: number; games: number }>;
  };
  dpr: Record<Side, DprSummary>;
  damageSwing: {
    averageSwing: number;
    averageMaxSwing: number;
    lethalFromHp: Record<number, number>;
  };
  mitigation: {
    blockedPercent: Record<Side, number>;
    preventedPercent: Record<Side, number>;
    defenseVsTopAbilities: Array<{
      abilityId: string;
      label: string;
      successRate: number | null;
    }>;
  };
  statuses: Record<string, StatusSummary>;
  abilityTiering: {
    abilities: AbilitySummary[];
    trap: AbilitySummary[];
    overtuned: AbilitySummary[];
    watchlist: AbilitySummary[];
    niche: AbilitySummary[];
  };
  initiativeBreakdown: Record<Role, InitiativeMetrics>;
  winRateCi: { lower: number; upper: number };
  convergence: Array<{ games: number; winRate: number }>;
};

const LETHAL_THRESHOLDS = [5, 10, 15];

export type AnalyzeOptions = {
  abilityHistory?: AbilityHistoryMap;
};

export function analyzeSimulations(
  results: SimulationResult[],
  options?: AnalyzeOptions
): SimulationAnalytics {
  const initiativeMap = new Map<string, InitiativeBucket>();
  let youWins = 0;
  const ttkValues: number[] = [];
  const hist = new Map<number, number>();
  const sideDamageBase: Record<Side, number> = { you: 0, ai: 0 };
  const sideDamageActual: Record<Side, number> = { you: 0, ai: 0 };
  const sideTurns: Record<Side, number> = { you: 0, ai: 0 };
  const sideBlocked: Record<Side, number> = { you: 0, ai: 0 };
  const sidePrevented: Record<Side, number> = { you: 0, ai: 0 };
  const abilityStats = new Map<string, AbilityAggregate>();
  const abilityUseCounts = new Map<string, number>();
  const abilityDefenseSamples = new Map<
    string,
    { successes: number; total: number }
  >();
  const heroAttackTurns = new Map<string, number>();
  const bucketTurnCounts = new Map<string, number>();
  const statusAggregate = new Map<
    string,
    { applied: number; damage: number; mitigation: number; lifetimes: number[] }
  >();
  const roundSwingValues: number[] = [];
  const maxSwingValues: number[] = [];
  const lethalCounts = new Map<number, { hits: number; total: number }>();
  const attackerWinCounts: Record<Side, { games: number; wins: number }> = {
    you: { games: 0, wins: 0 },
    ai: { games: 0, wins: 0 },
  };
  const roleAcc: Record<Role, RoleAccumulator> = {
    first: createRoleAccumulator(),
    second: createRoleAccumulator(),
  };
  const incomingDamagePerSide: Record<Side, number> = { you: 0, ai: 0 };

  results.forEach((result) => {
    const firstHeroId = result.meta.heroBySide[result.meta.firstPlayer];
    const heroName = HEROES[firstHeroId]?.name ?? firstHeroId;
    const bucket =
      initiativeMap.get(firstHeroId) ??
      initiativeMap
        .set(firstHeroId, {
          heroId: firstHeroId,
          heroName,
          games: 0,
          wins: 0,
        })
        .get(firstHeroId)!;
    bucket.games += 1;
    if (result.winner !== "draw") {
      bucket.wins += result.winner === result.meta.firstPlayer ? 1 : 0;
    }

    ttkValues.push(result.rounds);
    hist.set(result.rounds, (hist.get(result.rounds) ?? 0) + 1);

    attackerWinCounts.you.games += 1;
    attackerWinCounts.ai.games += 1;
    if (result.winner === "you") {
      attackerWinCounts.you.wins += 1;
      youWins += 1;
    } else if (result.winner === "ai") {
      attackerWinCounts.ai.wins += 1;
    }

    const firstSide = result.meta.firstPlayer;
    const secondSide: Side = firstSide === "you" ? "ai" : "you";
    const roleMap: Record<Side, Role> = {
      [firstSide]: "first",
      [secondSide]: "second",
    };

    result.history.forEach((turn) => {
      const attackerRole = roleMap[turn.side];
      const defenderSide: Side = turn.side === "you" ? "ai" : "you";
      const defenderRole = roleMap[defenderSide];
      heroAttackTurns.set(
        turn.attackerHeroId,
        (heroAttackTurns.get(turn.attackerHeroId) ?? 0) + 1
      );
      const hpBin = pickHpBin(turn.attackerHpBefore);
      const bucketKey = `${attackerRole}:${hpBin.id}`;
      const heroBucketKey = `${turn.attackerHeroId}:${bucketKey}`;
      bucketTurnCounts.set(
        heroBucketKey,
        (bucketTurnCounts.get(heroBucketKey) ?? 0) + 1
      );
      if (turn.modifiedDamage != null) {
        sideDamageBase[turn.side] += turn.modifiedDamage;
        sideTurns[turn.side] += 1;
        roleAcc[attackerRole].damageBase += turn.modifiedDamage;
        roleAcc[attackerRole].turns += 1;
      }
      sideDamageActual[turn.side] += turn.damageDealt;
      roleAcc[attackerRole].damageActual += turn.damageDealt;
      sideBlocked[defenderSide] += turn.damageBlocked;
      sidePrevented[defenderSide] += turn.damagePrevented;
      roleAcc[defenderRole].blocked += turn.damageBlocked;
      roleAcc[defenderRole].prevented += turn.damagePrevented;
      roleAcc[defenderRole].incoming +=
        turn.damageDealt + turn.damageBlocked + turn.damagePrevented;
      incomingDamagePerSide[defenderSide] +=
        turn.damageDealt + turn.damageBlocked + turn.damagePrevented;

      if (turn.defenseAbilityId) {
        const defenseSample =
          abilityDefenseSamples.get(turn.defenseAbilityId) ??
          abilityDefenseSamples
            .set(turn.defenseAbilityId, { successes: 0, total: 0 })
            .get(turn.defenseAbilityId)!;
        defenseSample.total += 1;
        if (turn.damageBlocked >= (turn.baseDamage ?? 0) * 0.5) {
          defenseSample.successes += 1;
        }
      }

      if (turn.abilityId && turn.modifiedDamage != null) {
        const ability = getOrCreateAbilityStat(
          abilityStats,
          turn.abilityId,
          turn.attackerHeroId,
          turn.combo ?? "UNKNOWN"
        );
        ability.uses += 1;
        ability.expectedRawBySide[defenderSide] += turn.modifiedDamage;
        ability.expectedRawSqBySide[defenderSide] +=
          turn.modifiedDamage * turn.modifiedDamage;
        ability.actual += turn.damageDealt;
        ability.actualBySide[defenderSide] += turn.damageDealt;
        ability.actualSq += turn.damageDealt * turn.damageDealt;
        ability.actualExpectedRawBySide[defenderSide] +=
          turn.damageDealt * turn.modifiedDamage;
        abilityUseCounts.set(
          turn.abilityId,
          (abilityUseCounts.get(turn.abilityId) ?? 0) + 1
        );
        if (result.winner === turn.side) {
          ability.wins += 1;
          ability.sideWins[turn.side] += 1;
        }
        ability.sideUses[turn.side] += 1;
        const bucketStat = getOrCreateBucketStat(
          ability,
          bucketKey,
          attackerRole,
          hpBin
        );
        bucketStat.uses += 1;
        bucketStat.expectedRawBySide[defenderSide] += turn.modifiedDamage;
        bucketStat.expectedRawSqBySide[defenderSide] +=
          turn.modifiedDamage * turn.modifiedDamage;
        bucketStat.actualBySide[defenderSide] += turn.damageDealt;
        bucketStat.actualSq += turn.damageDealt * turn.damageDealt;
        bucketStat.actualExpectedRawBySide[defenderSide] +=
          turn.damageDealt * turn.modifiedDamage;
        if (result.winner === turn.side) {
          bucketStat.wins += 1;
        }
      }

      applyRoleStatusDiff(roleAcc[attackerRole], turn.attackerStatusDiff);
      applyRoleStatusDiff(roleAcc[defenderRole], turn.defenderStatusDiff);
      if (turn.chiBlock > 0) {
        addToRoleMap(
          roleAcc[defenderRole].statusMitigation,
          "chi",
          turn.chiBlock
        );
      }
      if (turn.evasiveSuccess && turn.damagePrevented > 0) {
        addToRoleMap(
          roleAcc[defenderRole].statusMitigation,
          "evasive",
          turn.damagePrevented
        );
      }

      turn.opportunities.forEach((combo) => {
        const id = `${turn.attackerHeroId}:${combo}`;
        const oppStat = getOrCreateAbilityStat(
          abilityStats,
          id,
          turn.attackerHeroId,
          combo
        );
        oppStat.opportunities += 1;
        const bucketStat = getOrCreateBucketStat(
          oppStat,
          bucketKey,
          attackerRole,
          hpBin
        );
        bucketStat.opportunities += 1;
      });
    });

    Object.entries(result.statusStats.applied).forEach(([id, count]) => {
      accumulateStatusField(statusAggregate, id, "applied", count);
    });
    Object.entries(result.statusStats.damage).forEach(([id, dmg]) => {
      accumulateStatusField(statusAggregate, id, "damage", dmg);
    });
    Object.entries(result.statusStats.mitigation).forEach(([id, value]) => {
      accumulateStatusField(statusAggregate, id, "mitigation", value);
    });
    Object.entries(result.statusStats.lifetimes).forEach(([id, samples]) => {
      const agg =
        statusAggregate.get(id) ??
        statusAggregate.set(id, {
          applied: 0,
          damage: 0,
          mitigation: 0,
          lifetimes: [],
        }).get(id)!;
      agg.lifetimes.push(...samples);
    });

    let gameMaxSwing = 0;
    Object.values(result.roundDamage).forEach((roundEntry) => {
      const diff = Math.abs(
        (roundEntry.you ?? 0) - (roundEntry.ai ?? 0)
      );
      roundSwingValues.push(diff);
      if (diff > gameMaxSwing) {
        gameMaxSwing = diff;
      }
    });
    maxSwingValues.push(gameMaxSwing);

    result.lethalShots.forEach((shot) => {
      LETHAL_THRESHOLDS.forEach((threshold) => {
        const bucket =
          lethalCounts.get(threshold) ??
          lethalCounts.set(threshold, { hits: 0, total: 0 }).get(threshold)!;
        bucket.total += 1;
        if (shot.defenderHpBefore >= threshold) {
          bucket.hits += 1;
        }
      });
    });

    result.statusDamageEvents.forEach((event) => {
      sideDamageActual[event.source] += event.amount;
      const role = roleMap[event.source];
      if (role) {
        addToRoleMap(roleAcc[role].statusDamage, event.statusId, event.amount);
      }
    });
  });

  const sideWinRate: Record<Side, number> = {
    you:
      attackerWinCounts.you.games > 0
        ? attackerWinCounts.you.wins / attackerWinCounts.you.games
        : 0,
    ai:
      attackerWinCounts.ai.games > 0
        ? attackerWinCounts.ai.wins / attackerWinCounts.ai.games
        : 0,
  };

  const netFactors: Record<Side, number> = {
    you: ratio(
      incomingDamagePerSide.you -
        sideBlocked.you -
        sidePrevented.you,
      incomingDamagePerSide.you
    ),
    ai: ratio(
      incomingDamagePerSide.ai -
        sideBlocked.ai -
        sidePrevented.ai,
      incomingDamagePerSide.ai
    ),
  };

  const initiative = Array.from(initiativeMap.values()).map((bucket) => {
    const ci = wilson(bucket.wins, bucket.games);
    return { ...bucket, ci };
  });

  const ttkStats = summarizeTtk(ttkValues, hist);

  const dpr: Record<Side, DprSummary> = {
    you: {
      attackOnly:
        sideTurns.you > 0 ? sideDamageBase.you / sideTurns.you : 0,
      actual:
        sideTurns.you > 0 ? sideDamageActual.you / sideTurns.you : 0,
    },
    ai: {
      attackOnly:
        sideTurns.ai > 0 ? sideDamageBase.ai / sideTurns.ai : 0,
      actual:
        sideTurns.ai > 0 ? sideDamageActual.ai / sideTurns.ai : 0,
    },
  };

  const damageSwing = {
    averageSwing: mean(roundSwingValues),
    averageMaxSwing: mean(maxSwingValues),
    lethalFromHp: Object.fromEntries(
      LETHAL_THRESHOLDS.map((threshold) => {
        const bucket = lethalCounts.get(threshold);
        return [
          threshold,
          bucket && bucket.total > 0 ? bucket.hits / bucket.total : 0,
        ];
      })
    ),
  };

  const mitigation = {
    blockedPercent: {
      you: ratio(sideBlocked.you, sideBlocked.you + sideDamageActual.ai),
      ai: ratio(sideBlocked.ai, sideBlocked.ai + sideDamageActual.you),
    },
    preventedPercent: {
      you: ratio(
        sidePrevented.you,
        sidePrevented.you + sideDamageActual.ai
      ),
      ai: ratio(
        sidePrevented.ai,
        sidePrevented.ai + sideDamageActual.you
      ),
    },
    defenseVsTopAbilities: topDefenseStats(
      abilityUseCounts,
      abilityDefenseSamples,
      abilityStats
    ),
  };

  const statuses: Record<string, StatusSummary> = {};
  statusAggregate.forEach((value, key) => {
    statuses[key] = {
      applied: value.applied,
      damage: value.damage,
      mitigation: value.mitigation,
      avgLifetime:
        value.lifetimes.length > 0 ? mean(value.lifetimes) : null,
    };
  });

  const abilitySummaries = buildAbilitySummaries({
    abilityStats,
    heroAttackTurns,
    bucketTurnCounts,
    netFactors,
    sideWinRate,
    totalGames: results.length,
    abilityHistory: options?.abilityHistory,
  });

  const trap = abilitySummaries.filter((entry) => entry.verdict === "trap");
  const overtuned = abilitySummaries.filter(
    (entry) => entry.verdict === "overtuned"
  );
  const watchlist = abilitySummaries.filter(
    (entry) => entry.verdict === "watchlist"
  );
  const niche = abilitySummaries.filter(
    (entry) => entry.verdict === "niche"
  );

  const initiativeBreakdown: Record<Role, InitiativeMetrics> = {
    first: buildInitiativeMetrics(roleAcc.first),
    second: buildInitiativeMetrics(roleAcc.second),
  };

  const winRateCi = wilson(youWins, results.length);
  const convergence = computeConvergence(results);

  return {
    initiative,
    ttk: ttkStats,
    dpr,
    damageSwing,
    mitigation,
    statuses,
    abilityTiering: {
      abilities: abilitySummaries,
      trap,
      overtuned,
      watchlist,
      niche,
    },
    initiativeBreakdown,
    winRateCi,
    convergence,
  };
}

type AbilitySummaryContext = {
  abilityStats: Map<string, AbilityAggregate>;
  heroAttackTurns: Map<string, number>;
  bucketTurnCounts: Map<string, number>;
  netFactors: Record<Side, number>;
  sideWinRate: Record<Side, number>;
  totalGames: number;
  abilityHistory?: AbilityHistoryMap;
};

type DeltaStats = {
  count: number;
  deltaSum: number;
  deltaSq: number;
  expectedNet: number;
};

const buildAbilitySummaries = (
  context: AbilitySummaryContext
): AbilitySummary[] => {
  const bucketUseThreshold = deriveBucketUseThreshold(context.totalGames);
  const abilityEntries = Array.from(context.abilityStats.entries()).map(
    ([abilityId, stats]) => {
      const opportunities = Math.max(stats.opportunities, stats.uses);
      const pickRate = opportunities > 0 ? stats.uses / opportunities : 0;
      const heroTurns = context.heroAttackTurns.get(stats.heroId) ?? 0;
      const opportunityRate =
        heroTurns > 0 ? stats.opportunities / heroTurns : 0;
      const deltaStats = computeDeltaStats(
        stats,
        context.netFactors,
        stats.uses
      );
      const evEff =
        deltaStats.count > 0 ? deltaStats.deltaSum / deltaStats.count : 0;
      const evEffCi =
        deltaStats.count > 1
          ? computeDeltaConfidence(deltaStats)
          : null;
      const evEffPValue =
        deltaStats.count > 1
          ? computeDeltaPValue(deltaStats)
          : null;
      const winRateAfterUse =
        stats.uses > 0 ? stats.wins / stats.uses : null;
      const baseline =
        stats.uses > 0
          ? (context.sideWinRate.you * stats.sideUses.you +
              context.sideWinRate.ai * stats.sideUses.ai) /
            stats.uses
          : null;
      const uplift =
        winRateAfterUse != null && baseline != null
          ? winRateAfterUse - baseline
          : null;
      const winCi =
        stats.uses > 0 ? wilson(stats.wins, stats.uses) : null;
      const upliftCi =
        winCi && baseline != null
          ? [winCi.lower - baseline, winCi.upper - baseline]
          : null;
      const buckets = buildBucketSummaries(
        stats,
        context,
        bucketUseThreshold
      );
      const consistency = computeConsistency(buckets, evEff);
      const variancePenalty =
        stats.uses > 0 ? 1 / Math.sqrt(stats.uses) : 1;
      const nichePenalty =
        opportunityRate <
        TIERING_CONSTANTS.filters.ability.nichePenaltyThreshold
          ? 1
          : 0;
      const label = formatAbilityLabel(abilityId, stats);
      return {
        abilityId,
        heroId: stats.heroId,
        heroName: stats.heroName,
        combo: stats.combo,
        label,
        uses: stats.uses,
        opportunities,
        pickRate,
        opportunityRate,
        expected: deltaStats.expectedNet,
        actual: stats.actual,
        evEff,
        evEffCi,
        evEffPValue,
        evEffFdr: null,
        winRateAfterUse,
        uplift,
        upliftCi,
        buckets,
        consistency,
        score: 0,
        variancePenalty,
        nichePenalty,
        verdict: "neutral",
        hysteresisLocked: false,
        notes: null,
      } satisfies AbilitySummary;
    }
  );

  const evStats = computeMeanAndStd(abilityEntries.map((e) => e.evEff));
  const upliftStats = computeMeanAndStd(
    abilityEntries.map((e) => e.uplift ?? 0)
  );
  const pickStats = computeMeanAndStd(
    abilityEntries.map((e) => e.pickRate)
  );
  abilityEntries.forEach((entry) => {
    const weights = TIERING_CONSTANTS.scoreWeights;
    const evZ = toZScore(entry.evEff, evStats);
    const upliftZ = toZScore(entry.uplift ?? 0, upliftStats);
    const pickZ = toZScore(entry.pickRate, pickStats);
    const consistencyValue = entry.consistency ?? 0;
    entry.score =
      weights.ev * evZ +
      weights.uplift * upliftZ +
      weights.pickRate * pickZ +
      weights.consistency * consistencyValue -
      weights.variancePenalty * entry.variancePenalty -
      weights.nichePenalty * entry.nichePenalty;
  });

  applyBenjaminiHochberg(abilityEntries);

  abilityEntries.forEach((entry) => {
    const history = context.abilityHistory?.[entry.abilityId] ?? [];
    const verdictInfo = resolveVerdict(entry, history);
    entry.verdict = verdictInfo.verdict;
    entry.hysteresisLocked = verdictInfo.locked;
    entry.notes = verdictInfo.notes;
  });

  return abilityEntries.sort((a, b) => b.score - a.score);
};

const buildBucketSummaries = (
  ability: AbilityAggregate,
  context: AbilitySummaryContext,
  bucketUseThreshold: number
): AbilityBucketSummary[] => {
  return Object.values(ability.buckets).map((bucket) => {
    const opportunities = Math.max(bucket.opportunities, bucket.uses);
    const pickRate =
      opportunities > 0 ? bucket.uses / opportunities : 0;
    const bucketKey = `${ability.heroId}:${bucket.key}`;
    const bucketTurns =
      context.bucketTurnCounts.get(bucketKey) ?? 0;
    const opportunityRate =
      bucketTurns > 0 ? bucket.opportunities / bucketTurns : 0;
    const deltaStats = computeDeltaStats(
      bucket,
      context.netFactors,
      bucket.uses
    );
    const evEff =
      deltaStats.count > 0 ? deltaStats.deltaSum / deltaStats.count : null;
    const evEffCi =
      deltaStats.count > 1 && evEff != null
        ? computeDeltaConfidence(deltaStats)
        : null;
    const passesFilter =
      bucket.uses >= bucketUseThreshold &&
      opportunityRate >=
        TIERING_CONSTANTS.filters.bucket.minOpportunityRate &&
      evEff != null;
    return {
      key: bucket.key,
      initiative: bucket.initiative,
      hpBinId: bucket.hpBin.id,
      hpLabel: bucket.hpBin.label,
      uses: bucket.uses,
      opportunities,
      pickRate,
      opportunityRate,
      evEff,
      evEffCi,
      passesFilter,
    };
  });
};

const computeConsistency = (
  buckets: AbilityBucketSummary[],
  overallEv: number
): number | null => {
  const eligible = buckets.filter(
    (bucket) => bucket.passesFilter && bucket.evEff != null
  );
  if (eligible.length < 2) return null;
  const sign = Math.sign(overallEv);
  if (sign === 0) return null;
  const matching = eligible.filter(
    (bucket) => Math.sign(bucket.evEff ?? 0) === sign
  ).length;
  return matching / eligible.length;
};

const computeDeltaStats = (
  aggregate: {
    expectedRawBySide: Record<Side, number>;
    expectedRawSqBySide: Record<Side, number>;
    actualBySide: Record<Side, number>;
    actualSq: number;
    actualExpectedRawBySide: Record<Side, number>;
  },
  netFactors: Record<Side, number>,
  count: number
): DeltaStats => {
  const expectedNet =
    (aggregate.expectedRawBySide.you ?? 0) * netFactors.you +
    (aggregate.expectedRawBySide.ai ?? 0) * netFactors.ai;
  const deltaSum =
    (aggregate.actualBySide.you ?? 0) -
    (aggregate.expectedRawBySide.you ?? 0) * netFactors.you +
    (aggregate.actualBySide.ai ?? 0) -
    (aggregate.expectedRawBySide.ai ?? 0) * netFactors.ai;
  const deltaSq =
    aggregate.actualSq -
    2 *
      netFactors.you *
      (aggregate.actualExpectedRawBySide.you ?? 0) +
    (netFactors.you ** 2) *
      (aggregate.expectedRawSqBySide.you ?? 0) -
    2 *
      netFactors.ai *
      (aggregate.actualExpectedRawBySide.ai ?? 0) +
    (netFactors.ai ** 2) *
      (aggregate.expectedRawSqBySide.ai ?? 0);
  return { count, deltaSum, deltaSq, expectedNet };
};

const computeDeltaConfidence = (delta: DeltaStats): [number, number] => {
  const meanValue =
    delta.count > 0 ? delta.deltaSum / delta.count : 0;
  if (delta.count <= 1) {
    return [meanValue, meanValue];
  }
  const variance =
    (delta.deltaSq - (delta.deltaSum ** 2) / delta.count) /
    (delta.count - 1);
  const safeVariance = Math.max(0, variance);
  const stdError =
    delta.count > 0 ? Math.sqrt(safeVariance / delta.count) : 0;
  const margin = TIERING_CONSTANTS.ci.zValue * stdError;
  return [meanValue - margin, meanValue + margin];
};

const computeDeltaPValue = (delta: DeltaStats): number | null => {
  if (delta.count <= 1) return null;
  const variance =
    (delta.deltaSq - (delta.deltaSum ** 2) / delta.count) /
    (delta.count - 1);
  if (variance <= 0) return null;
  const stdError = Math.sqrt(variance / delta.count);
  if (!Number.isFinite(stdError) || stdError === 0) return null;
  const meanValue = delta.deltaSum / delta.count;
  const zScore = meanValue / stdError;
  return 2 * (1 - normalCdf(Math.abs(zScore)));
};

const normalCdf = (value: number): number => {
  return 0.5 * (1 + erfApprox(value / Math.SQRT2));
};

const erfApprox = (x: number): number => {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * abs);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
      Math.exp(-abs * abs);
  return sign * y;
};

const computeMeanAndStd = (values: number[]): {
  mean: number;
  std: number;
} => {
  if (!values.length) return { mean: 0, std: 0 };
  const meanValue = values.reduce((acc, val) => acc + val, 0) / values.length;
  const variance =
    values.reduce(
      (acc, val) => acc + (val - meanValue) ** 2,
      0
    ) / values.length;
  return { mean: meanValue, std: Math.sqrt(Math.max(variance, 0)) };
};

const toZScore = (
  value: number,
  stats: { mean: number; std: number }
): number => {
  if (stats.std === 0) return 0;
  return (value - stats.mean) / stats.std;
};

const applyBenjaminiHochberg = (
  abilities: AbilitySummary[]
): void => {
  const entries = abilities
    .map((ability) => ({
      ability,
      p: ability.evEffPValue,
    }))
    .filter((entry) => entry.p != null)
    .sort((a, b) => (a.p ?? 0) - (b.p ?? 0));
  const n = entries.length;
  if (!n) return;
  let prev = 1;
  for (let i = n - 1; i >= 0; i -= 1) {
    const rank = i + 1;
    const adjusted = Math.min(
      prev,
      (((entries[i].p ?? 0) * n) / rank) || 0
    );
    entries[i].ability.evEffFdr = Math.min(1, adjusted);
    prev = Math.min(prev, adjusted);
  }
};

const resolveVerdict = (
  ability: AbilitySummary,
  history: AbilityHistoryEntry[]
): { verdict: AbilityVerdict; locked: boolean; notes: string | null } => {
  const filters = TIERING_CONSTANTS.filters.ability;
  if (
    ability.opportunityRate <
    filters.watchlistOpportunityRate
  ) {
    return {
      verdict: "watchlist",
      locked: false,
      notes: buildNotes("watchlist", ability, false),
    };
  }
  if (ability.opportunityRate < filters.minOpportunityRate) {
    return {
      verdict: "niche",
      locked: false,
      notes: buildNotes("niche", ability, false),
    };
  }
  const volumeOk =
    ability.uses >= filters.minUsesHard ||
    (ability.uses >= filters.minUsesSoft &&
      ability.pickRate >= filters.minPickRateForSoft);
  if (!volumeOk) {
    return {
      verdict: "insufficient",
      locked: false,
      notes: buildNotes("insufficient", ability, false),
    };
  }

  const consistencyOk =
    ability.consistency != null &&
    ability.consistency >=
      TIERING_CONSTANTS.thresholds.consistencyRequired;
  const fdrOk =
    ability.evEffFdr != null &&
    ability.evEffFdr <= TIERING_CONSTANTS.fdr.q;
  const evCi = ability.evEffCi;
  const upliftCi = ability.upliftCi;
  const trapThreshold = TIERING_CONSTANTS.thresholds.trap;
  const overtunedThreshold =
    TIERING_CONSTANTS.thresholds.overtuned;

  const trapEligible =
    ability.pickRate >= trapThreshold.minPickRate &&
    evCi != null &&
    evCi[1] <= trapThreshold.ev &&
    upliftCi != null &&
    upliftCi[1] <= trapThreshold.uplift &&
    consistencyOk &&
    fdrOk &&
    ability.score <= SCORE_THRESHOLDS.trap;

  const overtunedEligible =
    ability.pickRate >= overtunedThreshold.minPickRate &&
    evCi != null &&
    evCi[0] >= overtunedThreshold.ev &&
    upliftCi != null &&
    upliftCi[0] >= overtunedThreshold.uplift &&
    consistencyOk &&
    fdrOk &&
    ability.score >= SCORE_THRESHOLDS.overtuned;

  let baseVerdict: AbilityVerdict = "neutral";
  if (trapEligible) {
    baseVerdict = "trap";
  } else if (overtunedEligible) {
    baseVerdict = "overtuned";
  }

  const hysteresis = applyHysteresis(
    baseVerdict,
    ability,
    history ?? []
  );
  return {
    verdict: hysteresis.verdict,
    locked: hysteresis.locked,
    notes: buildNotes(
      hysteresis.verdict,
      ability,
      hysteresis.locked
    ),
  };
};

const buildNotes = (
  verdict: AbilityVerdict,
  ability: AbilitySummary,
  locked: boolean
): string | null => {
  switch (verdict) {
    case "trap":
      return locked
        ? "Hysteréza: zostáva trap, kým EV_eff nepresiahne -0.3 v dvoch buildoch."
        : "Vysoký PR, negatívny EV_eff a uplift naprieč bucketmi.";
    case "overtuned":
      return locked
        ? "Hysteréza: stále overtuned, čakáme na dva buildy pod +0.3."
        : "Vysoký PR, pozitívny EV_eff a uplift v konzistentných bucketoch.";
    case "watchlist":
      return "Ultimátka s nízkym výskytom – sledovať.";
    case "niche":
      return "Nízka opportunity rate, verdikt len informačný.";
    case "insufficient":
      return "Nedostatok použití pre spoľahlivý verdikt.";
    default:
      return null;
  }
};

const applyHysteresis = (
  baseVerdict: AbilityVerdict,
  ability: AbilitySummary,
  history: AbilityHistoryEntry[]
): { verdict: AbilityVerdict; locked: boolean } => {
  if (!history?.length) {
    return { verdict: baseVerdict, locked: false };
  }
  if (baseVerdict === "trap" || baseVerdict === "overtuned") {
    return { verdict: baseVerdict, locked: false };
  }
  if (
    shouldRemainFlagged(
      "trap",
      ability.evEff,
      history,
      (value, threshold) => value > threshold
    )
  ) {
    return { verdict: "trap", locked: true };
  }
  if (
    shouldRemainFlagged(
      "overtuned",
      ability.evEff,
      history,
      (value, threshold) => value < threshold
    )
  ) {
    return { verdict: "overtuned", locked: true };
  }
  return { verdict: baseVerdict, locked: false };
};

const shouldRemainFlagged = (
  target: AbilityVerdict,
  currentEv: number,
  history: AbilityHistoryEntry[],
  comparator: (value: number, threshold: number) => boolean
): boolean => {
  const required = 2;
  const releaseThreshold =
    target === "trap"
      ? TIERING_CONSTANTS.thresholds.trap.releaseEv
      : TIERING_CONSTANTS.thresholds.overtuned.releaseEv;
  const lastIndex = findLastIndex(
    history,
    (entry) => entry.verdict === target
  );
  if (lastIndex === -1) {
    return false;
  }
  let consecutive = 0;
  for (let i = history.length - 1; i > lastIndex; i -= 1) {
    if (comparator(history[i].evEff, releaseThreshold)) {
      consecutive += 1;
    } else {
      break;
    }
  }
  if (consecutive >= required) {
    return false;
  }
  if (!comparator(currentEv, releaseThreshold)) {
    return true;
  }
  return consecutive + 1 < required;
};

const findLastIndex = <T>(
  list: T[],
  predicate: (value: T) => boolean
): number => {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (predicate(list[i])) {
      return i;
    }
  }
  return -1;
};

const mean = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const ratio = (value: number, total: number): number => {
  if (total <= 0) return 0;
  return value / total;
};

const summarizeTtk = (
  values: number[],
  histogram: Map<number, number>
): {
  average: number;
  median: number;
  iqr: number;
  histogram: Array<{ round: number; games: number }>;
} => {
  if (!values.length) {
    return { average: 0, median: 0, iqr: 0, histogram: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return {
    average: mean(values),
    median,
    iqr: q3 - q1,
    histogram: Array.from(histogram.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, games]) => ({ round, games })),
  };
};

const quantile = (sorted: number[], percentile: number): number => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * percentile;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
};

const wilson = (wins: number, total: number, z = 1.96) => {
  if (total === 0) return { lower: 0, upper: 0 };
  const phat = wins / total;
  const denominator = 1 + (z ** 2) / total;
  const centre =
    phat + (z ** 2) / (2 * total);
  const margin = z * Math.sqrt(
    (phat * (1 - phat) + (z ** 2) / (4 * total)) / total
  );
  const lower = (centre - margin) / denominator;
  const upper = (centre + margin) / denominator;
  return { lower, upper };
};

const accumulateStatusField = (
  map: Map<string, { applied: number; damage: number; mitigation: number; lifetimes: number[] }>,
  id: string,
  field: "applied" | "damage" | "mitigation",
  value: number
) => {
  const entry =
    map.get(id) ??
    map
      .set(id, { applied: 0, damage: 0, mitigation: 0, lifetimes: [] })
      .get(id)!;
  entry[field] += value;
};

const topDefenseStats = (
  abilityUseCounts: Map<string, number>,
  samples: Map<string, { successes: number; total: number }>,
  abilityStats: Map<string, AbilityAggregate>
) => {
  const top = Array.from(abilityUseCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([abilityId]) => {
      const sample = samples.get(abilityId);
      const successRate =
        sample && sample.total > 0 ? sample.successes / sample.total : null;
      return {
        abilityId,
        label: formatAbilityLabel(abilityId, abilityStats.get(abilityId)),
        successRate,
      };
    });
  return top;
};

const addToRoleMap = (
  target: Record<string, number>,
  key: string,
  amount: number
) => {
  if (amount === 0) return;
  target[key] = (target[key] ?? 0) + amount;
};

const applyRoleStatusDiff = (
  acc: RoleAccumulator,
  diff: Record<string, number>
) => {
  Object.entries(diff).forEach(([id, delta]) => {
    if (delta > 0) {
      addToRoleMap(acc.statusApplied, id, delta);
    }
  });
};

const splitAbilityKey = (
  abilityId: string
): { heroId: string; combo: string } => {
  const [heroId = "Unknown", combo = "Ability"] = abilityId.split(":");
  return { heroId, combo };
};

const getAbilityLabel = (heroId: string, combo: string): string => {
  const hero = HEROES[heroId as keyof typeof HEROES];
  const offensiveBoard = hero?.offensiveBoard;
  if (offensiveBoard) {
    const offensive = offensiveBoard[
      combo as keyof typeof offensiveBoard
    ];
    if (offensive?.label) {
      return offensive.label;
    }
  }
  const defensiveBoard = hero?.defensiveBoard;
  if (defensiveBoard) {
    const defensive = defensiveBoard[
      combo as keyof typeof defensiveBoard
    ];
    if (defensive?.label) {
      return defensive.label;
    }
  }
  return combo;
};

const formatAbilityLabel = (
  abilityId: string,
  stats?: AbilityAggregate
): string => {
  const { heroId: fallbackHeroId, combo: fallbackCombo } =
    splitAbilityKey(abilityId);
  const heroId = stats?.heroId ?? fallbackHeroId;
  const combo = stats?.combo ?? fallbackCombo;
  const heroName =
    stats?.heroName ?? HEROES[heroId as keyof typeof HEROES]?.name ?? heroId;
  const comboLabel = getAbilityLabel(heroId, combo);
  return `${heroName} ${comboLabel}`;
};

const getOrCreateAbilityStat = (
  map: Map<string, AbilityAggregate>,
  abilityId: string,
  heroId: string,
  combo: string
) => {
  let entry = map.get(abilityId);
  if (!entry) {
    const heroName = HEROES[heroId as keyof typeof HEROES]?.name ?? heroId;
    entry = {
      heroId,
      heroName,
      combo,
      uses: 0,
      opportunities: 0,
      expectedRawBySide: { you: 0, ai: 0 },
      expectedRawSqBySide: { you: 0, ai: 0 },
      actualBySide: { you: 0, ai: 0 },
      actualSq: 0,
      actualExpectedRawBySide: { you: 0, ai: 0 },
      actual: 0,
      wins: 0,
      sideUses: { you: 0, ai: 0 },
      sideWins: { you: 0, ai: 0 },
      buckets: {},
    };
    map.set(abilityId, entry);
  }
  return entry;
};

const getOrCreateBucketStat = (
  ability: AbilityAggregate,
  key: string,
  initiative: InitiativeBucketId,
  hpBin: HpBin
): AbilityBucketAggregate => {
  let bucket = ability.buckets[key];
  if (!bucket) {
    bucket = {
      key,
      initiative,
      hpBin,
      uses: 0,
      opportunities: 0,
      expectedRawBySide: { you: 0, ai: 0 },
      expectedRawSqBySide: { you: 0, ai: 0 },
      actualBySide: { you: 0, ai: 0 },
      actualSq: 0,
      actualExpectedRawBySide: { you: 0, ai: 0 },
      wins: 0,
    };
    ability.buckets[key] = bucket;
  }
  return bucket;
};

const pickHpBin = (hp: number): HpBin => {
  for (const bin of ATTACKER_HP_BINS) {
    if (hp >= bin.min && hp <= bin.max) {
      return bin;
    }
  }
  return ATTACKER_HP_BINS[ATTACKER_HP_BINS.length - 1];
};

const buildInitiativeMetrics = (
  acc: RoleAccumulator
): InitiativeMetrics => {
  const dpr: DprSummary = {
    attackOnly: acc.turns > 0 ? acc.damageBase / acc.turns : 0,
    actual: acc.turns > 0 ? acc.damageActual / acc.turns : 0,
  };
  const mitigation = {
    blockedPercent: ratio(acc.blocked, acc.incoming),
    preventedPercent: ratio(acc.prevented, acc.incoming),
  };
  const statuses = buildStatusSummaryForRole(acc);
  return { dpr, mitigation, statuses };
};

const buildStatusSummaryForRole = (
  acc: RoleAccumulator
): Record<string, StatusSummary> => {
  const keys = new Set([
    ...Object.keys(acc.statusApplied),
    ...Object.keys(acc.statusDamage),
    ...Object.keys(acc.statusMitigation),
  ]);
  const summary: Record<string, StatusSummary> = {};
  keys.forEach((id) => {
    summary[id] = {
      applied: acc.statusApplied[id] ?? 0,
      damage: acc.statusDamage[id] ?? 0,
      mitigation: acc.statusMitigation[id] ?? 0,
      avgLifetime: null,
    };
  });
  return summary;
};

const computeConvergence = (
  results: SimulationResult[]
): Array<{ games: number; winRate: number }> => {
  const entries: Array<{ games: number; winRate: number }> = [];
  let wins = 0;
  const step = Math.max(1, Math.floor(results.length / 20));
  results.forEach((game, index) => {
    if (game.winner === "you") {
      wins += 1;
    }
    const games = index + 1;
    if (games === results.length || games % step === 0) {
      entries.push({ games, winRate: wins / games });
    }
  });
  return entries;
};
const createRoleAccumulator = (): RoleAccumulator => ({
  damageBase: 0,
  damageActual: 0,
  turns: 0,
  blocked: 0,
  prevented: 0,
  incoming: 0,
  statusApplied: {},
  statusDamage: {},
  statusMitigation: {},
});
