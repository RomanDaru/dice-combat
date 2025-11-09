import type { HeroId, Side } from "../game/types";

export const STATS_SCHEMA_VERSION = "1.0.0" as const;

export type StatusRemovalReason = "natural" | "cleanse" | "transfer" | "cap";

export type PhaseDamage = {
  attack: number;
  counter: number;
  upkeepDot: number;
  collateral: number;
};

export type StatsResultType =
  | "win"
  | "loss"
  | "draw"
  | "forfeit"
  | "disconnect"
  | "abandon";

export type StatsIntegrity = {
  ok: boolean;
  recomputedHpYou: number | null;
  recomputedHpAi: number | null;
  hpDriftYou: number | null;
  hpDriftAi: number | null;
  log?: string;
};

export type RollStat = {
  id: string;
  gameId: string;
  turnId: string;
  side: Side;
  round: number;
  attemptIndex: number;
  diceBeforeHold: number[];
  diceAfterHold?: number[];
  holdsUsed?: number;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  combosAvailable?: string[];
  selectedCombo?: string | null;
  success?: boolean;
  firstRollHit?: boolean;
  rerollsUsed?: number;
  aiVsPlayer?: "ai" | "player";
  missedDefenseRoll?: boolean;
};

export type TurnStat = {
  id: string;
  gameId: string;
  turnId: string;
  round: number;
  attackerSide: Side;
  defenderSide: Side;
  abilityId?: string | null;
  combo?: string | null;
  pass?: boolean;
  expectedDamage?: number;
  actualDamage?: number;
  abilityValueDelta?: number;
  damageWithoutBlock?: number;
  damageBlocked?: number;
  damagePrevented?: number;
  counterDamage?: number;
  defenseAbilityId?: string | null;
  defenseEfficacyPercent?: number;
  statusApplied?: Record<string, number>;
  statusExpired?: Record<string, number>;
  statusStackAvg?: number;
  statusLifetimeTurns?: Record<string, number[]>;
  statusRemovalReasons?: Record<string, Record<StatusRemovalReason, number>>;
  capHitPercent?: number;
  cleansePercent?: number;
  phaseDamage?: PhaseDamage;
  attackDice?: number[];
  defenseDice?: number[];
  combosTriggered?: Record<string, number>;
  startedAt?: number;
  endedAt?: number;
  rollEndToAbilitySelectMs?: number;
  defensePromptToChoiceMs?: number;
  attackPromptToChoiceMs?: number;
  pickCount?: number;
  opportunityCount?: number;
  attackerStatusDiff?: Record<string, number>;
  defenderStatusDiff?: Record<string, number>;
  defenseEfficacy?: {
    defenseAbilityId: string | null;
    incomingAbilityId?: string | null;
    blocked: number;
    prevented: number;
    reflected: number;
  };
};

export type GameStat = {
  id: string;
  schemaVersion: typeof STATS_SCHEMA_VERSION;
  sessionId: string;
  heroId: HeroId;
  opponentHeroId: HeroId;
  heroVersion?: Partial<Record<HeroId, string>>;
  rulesVersion?: string;
  buildHash?: string;
  firstPlayer?: Side;
  seed: number;
  startedAt: number;
  endedAt?: number;
  roundsPlayed?: number;
  winner?: Side | "draw" | null;
  resultType?: StatsResultType;
  hpRemainingWinner?: number | null;
  hpRemainingLoser?: number | null;
  tempoSeconds?: number;
  maxDamageSingleTurn?: number;
  dprNet?: number;
  dprNetBySide?: Partial<Record<Side, number>>;
  atkEvBySide?: Partial<Record<Side, number>>;
  defEvBySide?: Partial<Record<Side, number>>;
  atkEv?: number;
  defEv?: number;
  abilityValue?: Record<string, number>;
  pickRate?: Record<string, number>;
  opportunityRate?: Record<string, number>;
  abilityDamage?: Record<string, number>;
  abilityHits?: Record<string, number>;
  statusImpact?: Record<string, number>;
  statusSummary?: {
    applied?: Record<string, number>;
    expired?: Record<string, number>;
    avgLifetimeTurns?: Record<string, number>;
    capHits?: Record<string, number>;
  };
  combosTriggered?: Record<string, number>;
  comebackIndex?: number;
  avgTurnTimeSec?: number;
  roundsPerMinute?: number;
  matchTempo?: number;
  integrity?: StatsIntegrity;
  metadata?: Record<string, unknown>;
};

export type StatsSnapshot = {
  gameStats: GameStat | null;
  turnStats: TurnStat[];
  rollStats: RollStat[];
};

export type StatsGameInit = {
  heroId: HeroId;
  opponentHeroId: HeroId;
  heroVersion?: Partial<Record<HeroId, string>>;
  rulesVersion?: string;
  buildHash?: string;
  seed: number;
  sessionId?: string;
  firstPlayer?: Side;
};

export type StatsRollInput = Omit<RollStat, "id" | "gameId">;
export type StatsTurnInput = Omit<TurnStat, "id" | "gameId">;

export type StatsFinalizeInput = {
  winner: Side | "draw" | null;
  resultType: StatsResultType;
  roundsPlayed: number;
  hp: { you: number; ai: number };
  endedAt?: number;
  hpRemainingWinner?: number | null;
  hpRemainingLoser?: number | null;
  integrity?: StatsIntegrity;
};
