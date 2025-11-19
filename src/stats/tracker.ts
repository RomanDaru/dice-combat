import type { Side, Tokens } from "../game/types";
import type { DefenseVersion } from "../defense/types";
import { HEROES } from "../game/heroes";
import { STATS_SCHEMA_VERSION, type DefenseBuffSnapshotSet, type DefenseTelemetryTotals, type GameStat, type RollStat, type StatsFinalizeInput, type StatsGameInit, type StatsSnapshot, type StatsTurnInput, type TurnStat, type StatsRollInput, type StatusRemovalReason, type StatsIntegrity } from "./types";

const createId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const cloneRoll = (roll: RollStat): RollStat => ({
  ...roll,
  diceBeforeHold: [...roll.diceBeforeHold],
  diceAfterHold: roll.diceAfterHold ? [...roll.diceAfterHold] : undefined,
  combosAvailable: roll.combosAvailable ? [...roll.combosAvailable] : undefined,
});

const cloneTurn = (turn: TurnStat): TurnStat => ({
  ...turn,
  attackDice: turn.attackDice ? [...turn.attackDice] : undefined,
  defenseDice: turn.defenseDice ? [...turn.defenseDice] : undefined,
  combosTriggered: turn.combosTriggered ? { ...turn.combosTriggered } : undefined,
  phaseDamage: turn.phaseDamage ? { ...turn.phaseDamage } : undefined,
  statusApplied: turn.statusApplied ? { ...turn.statusApplied } : undefined,
  statusExpired: turn.statusExpired ? { ...turn.statusExpired } : undefined,
  statusLifetimeTurns: turn.statusLifetimeTurns
    ? Object.fromEntries(
        Object.entries(turn.statusLifetimeTurns).map(([key, value]) => [
          key,
          [...value],
        ])
      )
    : undefined,
  statusRemovalReasons: turn.statusRemovalReasons
    ? Object.fromEntries(
        Object.entries(turn.statusRemovalReasons).map(([key, value]) => [
          key,
          { ...value },
        ])
      )
    : undefined,
  defenseEfficacy: turn.defenseEfficacy
    ? { ...turn.defenseEfficacy }
    : undefined,
  defenseSchema: turn.defenseSchema
    ? {
        schemaHash: turn.defenseSchema.schemaHash,
        dice: [...turn.defenseSchema.dice],
        checkpoints: { ...turn.defenseSchema.checkpoints },
        rulesHit: turn.defenseSchema.rulesHit.map((rule) => ({
          ...rule,
          effects: rule.effects.map((effect) => ({ ...effect })),
        })),
      }
    : undefined,
});

const cloneDefenseBuff = (
  buff: DefenseBuffSnapshotSet["pending"][number]
): DefenseBuffSnapshotSet["pending"][number] => ({
  ...buff,
  carryOverOnKO: buff.carryOverOnKO ? { ...buff.carryOverOnKO } : undefined,
  expires: buff.expires ? { ...buff.expires } : undefined,
  createdAt: { ...buff.createdAt },
  source: buff.source ? { ...buff.source } : undefined,
});

const cloneDefenseBuffs = (
  set?: DefenseBuffSnapshotSet
): DefenseBuffSnapshotSet | undefined => {
  if (!set) return undefined;
  return {
    pending: set.pending.map(cloneDefenseBuff),
    expired: set.expired.map((entry) => ({
      ...cloneDefenseBuff(entry),
      reason: entry.reason,
      expiredAt: { ...entry.expiredAt },
    })),
  };
};

const createDefenseTelemetryTotals = (): DefenseTelemetryTotals => ({
  blockFromDefenseRoll: 0,
  blockFromStatuses: 0,
  preventHalfEvents: 0,
  preventAllEvents: 0,
  reflectSum: 0,
  wastedBlockSum: 0,
});

export class StatsTracker {
  private game: GameStat | null = null;
  private turns: TurnStat[] = [];
  private rolls: RollStat[] = [];
  private statusTimers: Record<Side, Record<string, number>> = {
    you: {},
    ai: {},
  };
  private defenseTurnCounts: Record<DefenseVersion, number> = { v2: 0 };

  beginGame(meta: StatsGameInit) {
    const gameId = createId("game");
    this.defenseTurnCounts = { v2: 0 };
    this.game = {
      id: gameId,
      schemaVersion: STATS_SCHEMA_VERSION,
      sessionId: meta.sessionId ?? createId("session"),
      heroId: meta.heroId,
      opponentHeroId: meta.opponentHeroId,
      heroVersion: meta.heroVersion,
      rulesVersion: meta.rulesVersion,
      buildHash: meta.buildHash,
      seed: meta.seed,
      startedAt: Date.now(),
      metadata: {},
      defenseMeta: meta.defenseMeta
        ? {
            ...meta.defenseMeta,
            turnsByVersion: { ...this.defenseTurnCounts },
            totals: meta.defenseMeta.totals ?? createDefenseTelemetryTotals(),
          }
        : undefined,
    };
    this.turns = [];
    this.rolls = [];
    this.statusTimers = { you: {}, ai: {} };
  }

  recordRoll(entry: StatsRollInput) {
    if (!this.game) return;
    const roll: RollStat = {
      id: createId("roll"),
      gameId: this.game.id,
      ...entry,
    };
    this.rolls = [...this.rolls, roll];
  }

  recordTurn(entry: StatsTurnInput) {
    if (!this.game) return;
    // Clamp blocked + prevented to raw (attack + collateral) before storing
    const attackBaseRaw =
      (entry.phaseDamage?.attack ?? entry.damageWithoutBlock ?? 0) +
      (entry.phaseDamage?.collateral ?? 0);
    const clampedBlocked = Math.max(
      0,
      Math.min(entry.damageBlocked ?? 0, attackBaseRaw)
    );
    const clampedPrevented = Math.max(
      0,
      Math.min(entry.damagePrevented ?? 0, Math.max(0, attackBaseRaw - clampedBlocked))
    );
    const turn: TurnStat = {
      id: entry.turnId,
      gameId: this.game.id,
      ...entry,
      damageBlocked: clampedBlocked,
      damagePrevented: clampedPrevented,
    };
    this.turns = [...this.turns, turn];
    if (entry.defenseVersion) {
      this.defenseTurnCounts[entry.defenseVersion] += 1;
      if (this.game.defenseMeta) {
        this.game = {
          ...this.game,
          defenseMeta: {
            ...this.game.defenseMeta,
            turnsByVersion: { ...this.defenseTurnCounts },
          },
        };
      }
    }
  }

  recordStatusSnapshot(
    side: Side,
    tokens: Tokens | undefined,
    round: number,
    reason: StatusRemovalReason = "natural"
  ): Record<string, { lifetime: number; reason: StatusRemovalReason }> {
    const timers = this.statusTimers[side];
    const expired: Record<string, { lifetime: number; reason: StatusRemovalReason }> = {};
    const snapshot = tokens ?? {};
    const currentIds = new Set(Object.keys(snapshot));

    currentIds.forEach((id) => {
      const stacks = snapshot[id] ?? 0;
      if (stacks > 0 && timers[id] == null) {
        timers[id] = round;
      } else if (stacks <= 0 && timers[id] != null) {
        const lifetime = Math.max(1, round - timers[id]);
        expired[id] = { lifetime, reason };
        delete timers[id];
      }
    });

    Object.keys(timers).forEach((id) => {
      if ((snapshot[id] ?? 0) <= 0 && !expired[id]) {
        const lifetime = Math.max(1, round - timers[id]);
        expired[id] = { lifetime, reason };
        delete timers[id];
      }
    });

    return expired;
  }

  updateGameMeta(partial: Partial<GameStat>) {
    if (!this.game) return;
    const { metadata, defenseMeta, ...rest } = partial;
    let next: GameStat = {
      ...this.game,
      ...rest,
    };
    if (metadata) {
      next = {
        ...next,
        metadata: { ...(this.game.metadata ?? {}), ...metadata },
      };
    }
    if (defenseMeta) {
      const existingMeta = next.defenseMeta ?? {};
      const mergedMeta = {
        ...existingMeta,
        ...defenseMeta,
      };
      if (defenseMeta.totals) {
        const currentTotals =
          existingMeta.totals ?? createDefenseTelemetryTotals();
        const delta = defenseMeta.totals;
        const totals = { ...currentTotals };
        (Object.keys(delta) as Array<keyof DefenseTelemetryTotals>).forEach(
          (key) => {
            const increment = delta[key] ?? 0;
            totals[key] = (totals[key] ?? 0) + increment;
          }
        );
        mergedMeta.totals = totals;
      }
      next = {
        ...next,
        defenseMeta: mergedMeta,
      };
    }
    this.game = next;
  }

  finalizeGame(input: StatsFinalizeInput): StatsSnapshot | null {
    if (!this.game) return null;
    if (this.game.endedAt) {
      return this.getSnapshot();
    }
    const endedAt = input.endedAt ?? Date.now();
    const winnerSide = input.winner;
    let hpRemainingWinner = input.hpRemainingWinner ?? null;
    let hpRemainingLoser = input.hpRemainingLoser ?? null;
    if (hpRemainingWinner === null || hpRemainingLoser === null) {
      if (winnerSide === "you") {
        hpRemainingWinner = input.hp.you;
        hpRemainingLoser = input.hp.ai;
      } else if (winnerSide === "ai") {
        hpRemainingWinner = input.hp.ai;
        hpRemainingLoser = input.hp.you;
      } else {
        hpRemainingWinner = null;
        hpRemainingLoser = null;
      }
    }
    this.game = {
      ...this.game,
      endedAt,
      winner: winnerSide,
      resultType: input.resultType,
      roundsPlayed: input.roundsPlayed,
      hpRemainingWinner,
      hpRemainingLoser,
      integrity: input.integrity ?? this.game.integrity,
    };
    this.applyAggregates(input.hp);
    return this.getSnapshot();
  }

  getSnapshot(): StatsSnapshot {
    const gameStats = this.game
      ? {
          ...this.game,
          metadata: this.game.metadata ? { ...this.game.metadata } : undefined,
          defenseMeta: this.game.defenseMeta
            ? {
                ...this.game.defenseMeta,
                turnsByVersion: { ...this.defenseTurnCounts },
              }
            : undefined,
          defenseBuffs: cloneDefenseBuffs(this.game.defenseBuffs),
        }
      : null;
    return {
      gameStats,
      turnStats: this.turns.map(cloneTurn),
      rollStats: this.rolls.map(cloneRoll),
    };
  }

  private applyAggregates(
    finalHp: { you: number; ai: number }
  ) {
    if (!this.game) return;
    const totalTurns = this.turns.length;
    let maxDamageSingleTurn = this.game.maxDamageSingleTurn ?? 0;
    const abilityStats: Record<
      string,
      {
        delta: number;
        count: number;
        picks: number;
        opps: number;
        owner: Side | null;
        damage: number;
        hits: number;
      }
    > = {};
    const comboTotals: Record<string, number> = {};
    const perSide: Record<
      Side,
      { turns: number; netDamage: number; atkDelta: number; atkCount: number }
    > = {
      you: { turns: 0, netDamage: 0, atkDelta: 0, atkCount: 0 },
      ai: { turns: 0, netDamage: 0, atkDelta: 0, atkCount: 0 },
    };
    const attackerTurnsCount: Record<Side, number> = {
      you: 0,
      ai: 0,
    };
    const defenseStats: Record<Side, { count: number; mitigation: number }> = {
      you: { count: 0, mitigation: 0 },
      ai: { count: 0, mitigation: 0 },
    };
    let netDamageTotal = 0;
    const roundCounts: Record<number, number> = {};
    const statusAppliedTotals: Record<string, number> = {};
    const statusExpiredTotals: Record<string, number> = {};
    const lifetimeTracking: Record<string, { total: number; count: number }> =
      {};
    const capHits: Record<string, number> = {};

    let schemaDamageDriftCount = 0;
    const driftIssueLines: string[] = [];
    this.turns.forEach((turn) => {
      const phase = turn.phaseDamage;
      if (typeof turn.round === "number") {
        roundCounts[turn.round] = (roundCounts[turn.round] ?? 0) + 1;
      }
      const attackBase =
        (phase?.attack ?? turn.damageWithoutBlock ?? 0) +
        (phase?.collateral ?? 0);
      const blocked = turn.damageBlocked ?? 0;
      const prevented = turn.damagePrevented ?? 0;
      const netAttackDamage = Math.max(0, attackBase - blocked - prevented);
      const attacker = turn.attackerSide;
      const defender = turn.defenderSide;
      perSide[attacker].turns += 1;
      attackerTurnsCount[attacker] += 1;
      perSide[attacker].netDamage += netAttackDamage;
      netDamageTotal += netAttackDamage;
      maxDamageSingleTurn = Math.max(
        maxDamageSingleTurn,
        turn.actualDamage ?? netAttackDamage
      );
      if (turn.abilityId) {
        const bucket =
          abilityStats[turn.abilityId] ?? {
            delta: 0,
            count: 0,
            picks: 0,
            opps: 0,
            owner: attacker ?? null,
            damage: 0,
            hits: 0,
          };
        bucket.owner = bucket.owner ?? attacker ?? null;
        if (
          typeof turn.actualDamage === "number" &&
          typeof turn.expectedDamage === "number"
        ) {
          bucket.delta += turn.actualDamage - turn.expectedDamage;
          bucket.count += 1;
          perSide[attacker].atkDelta += turn.actualDamage - turn.expectedDamage;
          perSide[attacker].atkCount += 1;
        }
        bucket.picks += turn.pickCount ?? 0;
        bucket.opps += turn.opportunityCount ?? 0;
        bucket.damage += turn.actualDamage ?? 0;
        bucket.hits += 1;
        abilityStats[turn.abilityId] = bucket;
      }
      const mitigation = blocked + prevented;
      defenseStats[defender].mitigation += mitigation;
      defenseStats[defender].count += 1;
      if (turn.combosTriggered) {
        Object.entries(turn.combosTriggered).forEach(([combo, count]) => {
          comboTotals[combo] = (comboTotals[combo] ?? 0) + count;
        });
      }
      if (turn.statusApplied) {
        Object.entries(turn.statusApplied).forEach(([id, value]) => {
          statusAppliedTotals[id] = (statusAppliedTotals[id] ?? 0) + value;
        });
      }
      if (turn.statusExpired) {
        Object.entries(turn.statusExpired).forEach(([id, value]) => {
          statusExpiredTotals[id] = (statusExpiredTotals[id] ?? 0) + value;
        });
      }
      if (turn.statusLifetimeTurns) {
        Object.entries(turn.statusLifetimeTurns).forEach(([id, samples]) => {
          if (!samples?.length) return;
          const payload =
            lifetimeTracking[id] ?? { total: 0, count: 0 };
          payload.total += samples.reduce((acc, value) => acc + value, 0);
          payload.count += samples.length;
          lifetimeTracking[id] = payload;
        });
      }
      if (turn.statusRemovalReasons) {
        Object.entries(turn.statusRemovalReasons).forEach(([id, reasons]) => {
          const hits = reasons.cap ?? 0;
          if (hits > 0) {
            capHits[id] = (capHits[id] ?? 0) + hits;
          }
        });
      }
      // Integrity guardrail: compare schema.finalDamage vs applied damage (prefer actualDamage, fall back to damageApplied)
      if (turn.defenseSchema?.checkpoints?.finalDamage != null) {
        const schemaFinal = turn.defenseSchema.checkpoints.finalDamage;
        const applied =
          typeof turn.actualDamage === "number"
            ? turn.actualDamage
            : turn.defenseSchema?.damageApplied;
        if (typeof applied === "number" && schemaFinal !== applied) {
          schemaDamageDriftCount += 1;
          driftIssueLines.push(
            `turn ${turn.id} schema.finalDamage=${schemaFinal} vs applied=${applied}`
          );
        }
      }
    });

    const tempoSeconds =
      this.game.endedAt && this.game.startedAt
        ? Math.max(0, (this.game.endedAt - this.game.startedAt) / 1000)
        : undefined;
    const avgTurnTimeSec =
      tempoSeconds && totalTurns > 0 ? tempoSeconds / totalTurns : undefined;
    const roundsPerMinute =
      tempoSeconds && tempoSeconds > 0 && this.game.roundsPlayed
        ? this.game.roundsPlayed / (tempoSeconds / 60)
        : undefined;
    const dprNet =
      totalTurns > 0 ? netDamageTotal / totalTurns : netDamageTotal;

    const abilityValue: Record<string, number> = {};
    const pickRate: Record<string, number> = {};
    const opportunityRate: Record<string, number> = {};
    const abilityDamage: Record<string, number> = {};
    const abilityHits: Record<string, number> = {};

    Object.entries(abilityStats).forEach(([id, stats]) => {
      if (stats.count > 0) {
        abilityValue[id] = stats.delta / stats.count;
      }
      if (stats.opps > 0) {
        pickRate[id] = stats.picks / stats.opps;
        const denom = stats.owner
          ? Math.max(1, attackerTurnsCount[stats.owner])
          : Math.max(1, totalTurns);
        opportunityRate[id] = stats.opps / denom;
      }
      if (stats.damage > 0) {
        abilityDamage[id] = stats.damage;
      }
      if (stats.hits > 0) {
        abilityHits[id] = stats.hits;
      }
    });

    const dprNetBySide: Partial<Record<Side, number>> = {};
    const atkEvBySide: Partial<Record<Side, number>> = {};
    const defEvBySide: Partial<Record<Side, number>> = {};

    (["you", "ai"] as Side[]).forEach((side) => {
      const sideData = perSide[side];
      if (sideData.turns > 0) {
        dprNetBySide[side] = sideData.netDamage / sideData.turns;
      }
      if (sideData.atkCount > 0) {
        atkEvBySide[side] = sideData.atkDelta / sideData.atkCount;
      }
      const defData = defenseStats[side];
      if (defData.count > 0) {
        defEvBySide[side] = defData.mitigation / defData.count;
      }
    });

    const avgLifetimeTurns: Record<string, number> = {};
    Object.entries(lifetimeTracking).forEach(([id, payload]) => {
      if (payload.count > 0) {
        avgLifetimeTurns[id] = payload.total / payload.count;
      }
    });

    const statusSummary = {
      applied:
        Object.keys(statusAppliedTotals).length > 0
          ? statusAppliedTotals
          : undefined,
      expired:
        Object.keys(statusExpiredTotals).length > 0
          ? statusExpiredTotals
          : undefined,
      avgLifetimeTurns:
        Object.keys(avgLifetimeTurns).length > 0
          ? avgLifetimeTurns
          : undefined,
      capHits: Object.keys(capHits).length > 0 ? capHits : undefined,
    };

    const roundIssues = Object.entries(roundCounts)
      .filter(([, count]) => count > 2)
      .map(
        ([round, count]) => `round ${round} has ${count} turns (expected <= 2)`
      );

    const integrityBase = this.computeIntegrity(finalHp, roundIssues);
    const mergedLog = [integrityBase.log, ...driftIssueLines].filter(Boolean).join("; ");
    const integrity: StatsIntegrity = {
      ...integrityBase,
      log: mergedLog.length ? mergedLog : undefined,
    };
    // Surface drift metric for dashboards
    if (this.game.defenseMeta) {
      const existingTotals = this.game.defenseMeta.totals ?? createDefenseTelemetryTotals();
      this.game = {
        ...this.game,
        defenseMeta: {
          ...this.game.defenseMeta,
          totals: {
            ...existingTotals,
            schemaDamageDriftCount: (existingTotals.schemaDamageDriftCount ?? 0) + schemaDamageDriftCount,
          },
        },
      };
    }

    this.game = {
      ...this.game,
      tempoSeconds,
      avgTurnTimeSec,
      roundsPerMinute,
      maxDamageSingleTurn,
      dprNet,
      dprNetBySide:
        Object.keys(dprNetBySide).length > 0 ? dprNetBySide : undefined,
      atkEvBySide:
        Object.keys(atkEvBySide).length > 0 ? atkEvBySide : undefined,
      defEvBySide:
        Object.keys(defEvBySide).length > 0 ? defEvBySide : undefined,
      abilityValue:
        Object.keys(abilityValue).length > 0 ? abilityValue : undefined,
      pickRate: Object.keys(pickRate).length > 0 ? pickRate : undefined,
      opportunityRate:
        Object.keys(opportunityRate).length > 0 ? opportunityRate : undefined,
      abilityDamage:
        Object.keys(abilityDamage).length > 0 ? abilityDamage : undefined,
      abilityHits:
        Object.keys(abilityHits).length > 0 ? abilityHits : undefined,
      combosTriggered:
        Object.keys(comboTotals).length > 0 ? comboTotals : undefined,
      statusSummary:
        statusSummary.applied ||
        statusSummary.expired ||
        statusSummary.avgLifetimeTurns ||
        statusSummary.capHits
          ? statusSummary
          : undefined,
      integrity,
    };
  }

  private computeIntegrity(
    finalHp: { you: number; ai: number },
    roundIssues: string[]
  ): StatsIntegrity {
    if (!this.game) {
      return {
        ok: false,
        recomputedHpYou: null,
        recomputedHpAi: null,
        hpDriftYou: null,
        hpDriftAi: null,
        log: "missing game metadata",
      };
    }
    const youHero = HEROES[this.game.heroId];
    const aiHero = HEROES[this.game.opponentHeroId];
    if (!youHero || !aiHero) {
      return {
        ok: false,
        recomputedHpYou: null,
        recomputedHpAi: null,
        hpDriftYou: null,
        hpDriftAi: null,
        log: "hero data unavailable",
      };
    }
    const hpTotals: Record<Side, number> = {
      you: youHero.maxHp,
      ai: aiHero.maxHp,
    };
    this.turns.forEach((turn) => {
      const phase = turn.phaseDamage;
      const attackComponent =
        (phase?.attack ?? turn.damageWithoutBlock ?? 0) +
        (phase?.collateral ?? 0);
      const blocked = turn.damageBlocked ?? 0;
      const prevented = turn.damagePrevented ?? 0;
      const defenderDamage = Math.max(
        0,
        attackComponent - blocked - prevented
      );
      const defender = turn.defenderSide;
      hpTotals[defender] = Math.max(0, hpTotals[defender] - defenderDamage);
      const attackerDamage = Math.max(
        0,
        (phase?.upkeepDot ?? 0) + (phase?.counter ?? turn.counterDamage ?? 0)
      );
      const attacker = turn.attackerSide;
      hpTotals[attacker] = Math.max(0, hpTotals[attacker] - attackerDamage);
    });
    const hpDriftYou = hpTotals.you - finalHp.you;
    const hpDriftAi = hpTotals.ai - finalHp.ai;
    const hpOk = hpDriftYou === 0 && hpDriftAi === 0;
    const issues: string[] = [];
    if (!hpOk) {
      if (hpDriftYou !== 0) {
        issues.push(`you drift ${hpDriftYou}`);
      }
      if (hpDriftAi !== 0) {
        issues.push(`ai drift ${hpDriftAi}`);
      }
    }
    issues.push(...roundIssues);
    const ok = hpOk && roundIssues.length === 0;
    return {
      ok,
      recomputedHpYou: hpTotals.you,
      recomputedHpAi: hpTotals.ai,
      hpDriftYou,
      hpDriftAi,
      log: issues.length ? issues.join("; ") : undefined,
    };
  }
}
