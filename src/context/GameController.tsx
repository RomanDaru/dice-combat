import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGame } from "./GameContext";
import type { GameState, InitialRollState } from "../game/state";
import type {
  OffensiveAbility,
  Phase,
  Side,
  Combo,
  PlayerState,
  PendingDefenseBuff,
  Hero,
  HeroId,
  Tokens,
} from "../game/types";
import type {
  BaseDefenseResolution,
  CombatEvent,
  DefenseRollResult,
} from "../game/combat/types";
import {
  getStatus,
  getStacks,
  listStatuses,
  setStacks,
  type StatusId,
  type StatusTimingPhase,
} from "../engine/status";
import {
  consumeTurnStatusBudgetValue,
  createEmptyTurnStatusBudgets,
  getTurnStatusBudget,
  hasTurnStatusBudget,
  setTurnStatusBudgetValue,
  type TurnStatusBudgets,
} from "../game/statusBudgets";

import { useCombatLog } from "../hooks/useCombatLog";
import { useDiceAnimator } from "../hooks/useDiceAnimator";
import { useAiDiceAnimator } from "../hooks/useAiDiceAnimator";
import { useAiController } from "../hooks/useAiController";
import { useStatusManager } from "../hooks/useStatusManager";
import { useDefenseActions } from "../hooks/useDefenseActions";
import {
  useGameFlow,
  type ActiveTransition,
  type ActiveCue,
} from "../hooks/useTurnController";
import { useActiveAbilities } from "../hooks/useActiveAbilities";
import { useRollAnimator } from "../hooks/useRollAnimator";
import { useLatest } from "../hooks/useLatest";
import {
  bestAbility,
  detectCombos,
  rollDie,
  selectedAbilityForHero,
} from "../game/combos";
import { makeRng } from "../engine/rng";
import type { Rng } from "../engine/rng";
import type {
  ActiveAbility,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
} from "../game/types";
import type { DefenseStatusGrant } from "../defense/effects";
import type { DefenseVersion } from "../defense/types";
import {
  buildPendingDefenseBuffsFromGrants,
  partitionBuffsByKo,
  partitionPendingDefenseBuffs,
} from "../game/defenseBuffs";
import type { PendingDefenseBuffTrigger } from "../game/defenseBuffs";
import {
  resolvePassTurn,
  TURN_TRANSITION_DELAY_MS,
  type TurnEndResolution,
} from "../game/flow/turnEnd";
import { getAbilityIcon } from "../assets/abilityIconMap";
import { getCueDuration } from "../config/cueDurations";
import { useStatsTracker } from "./StatsContext";
import {
  BUILD_HASH,
  HERO_VERSION_MAP,
  RULES_VERSION,
  DEFENSE_DSL_VERSION,
  DEFENSE_SCHEMA_VERSION,
} from "../config/buildInfo";
import { ENABLE_DEFENSE_V2 } from "../config/featureFlags";
import { defenseDebugLog } from "../utils/debug";
import {
  deriveVirtualTokensForSide,
  type VirtualTokenDerivationBreakdown,
} from "./virtualTokens";
import { getPlayerSnapshot, setPlayerSnapshot } from "./playerSnapshot";
import type { PlayerDefenseState } from "../hooks/usePlayerDefenseController";

const DEF_DIE_INDEX = 2;
const ROLL_ANIM_MS = 1300;
const AI_ROLL_ANIM_MS = 900;
const AI_STEP_MS = 2000;
const AI_PASS_FOLLOW_UP_MS = 450;
const AI_PASS_EVENT_DURATION_MS = 600;
const DEFENSE_OVERRIDE_KEY = "dcDefenseOverrides";

const createDefenseTelemetryTotals = () => ({
  blockFromDefenseRoll: 0,
  blockFromStatuses: 0,
  preventHalfEvents: 0,
  preventAllEvents: 0,
  reflectSum: 0,
  wastedBlockSum: 0,
});
const createTurnId = () =>
  `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

type DefenseBuffExpirationRecord = PendingDefenseBuff & {
  reason: string;
  expiredAt: {
    round: number;
    turnId: string;
    phase?: StatusTimingPhase;
    cause: "phase" | "ko";
  };
};

type PendingUpkeepRecord = Record<
  Side,
  {
    turnId: string;
    amount: number;
  }
>;

type ReleasePendingOptions = {
  pendingOverride?: PendingDefenseBuff[];
  skipDispatch?: boolean;
};

type ReleasePendingResult = {
  pending: PendingDefenseBuff[];
  changed: boolean;
};

type TurnStartPrepDeps = {
  currentTurnIdRef: React.MutableRefObject<string>;
  pendingUpkeepRef: React.MutableRefObject<PendingUpkeepRecord>;
  releasePendingDefenseBuffs: (
    trigger: PendingDefenseBuffTrigger,
    options?: ReleasePendingOptions
  ) => ReleasePendingResult;
};

export const prepareDefenseTurnStart = (
  deps: TurnStartPrepDeps,
  payload: { side: Side; round: number }
) => {
  const nextTurnId = createTurnId();
  deps.currentTurnIdRef.current = nextTurnId;
  deps.pendingUpkeepRef.current[payload.side] = {
    turnId: nextTurnId,
    amount: 0,
  };
  deps.releasePendingDefenseBuffs({
    phase: "nextTurn",
    owner: payload.side,
    turnId: nextTurnId,
    round: payload.round,
  });
  deps.releasePendingDefenseBuffs({
    phase: "turnStart",
    owner: payload.side,
    turnId: nextTurnId,
    round: payload.round,
  });
};

type TurnStartStatsDeps = {
  currentTurnIdRef: React.MutableRefObject<string>;
  pendingUpkeepRef: React.MutableRefObject<PendingUpkeepRecord>;
  stats: {
    recordTurn: (input: {
      turnId: string;
      round: number;
      attackerSide: Side;
      defenderSide: Side;
      abilityId: string | null;
      combo: string | null;
      pass: boolean;
      phaseDamage: {
        attack: number;
        counter: number;
        upkeepDot: number;
        collateral: number;
      };
      damageWithoutBlock: number;
      damageBlocked: number;
      damagePrevented: number;
      counterDamage: number;
      actualDamage: number;
    }) => void;
    updateGameMeta: (meta: { firstPlayer: Side }) => void;
  };
  firstPlayerRef: React.MutableRefObject<Side | null>;
};

export const applyDefenseTurnStartStats = (
  deps: TurnStartStatsDeps,
  payload: {
    side: Side;
    round: number;
    statusDamage: number;
    hpAfter: number;
  }
) => {
  const { side, round, statusDamage, hpAfter } = payload;
  const activeTurnId = deps.currentTurnIdRef.current;
  deps.pendingUpkeepRef.current[side] = {
    turnId: activeTurnId,
    amount: statusDamage,
  };
  if (statusDamage > 0 && hpAfter <= 0) {
    deps.stats.recordTurn({
      turnId: activeTurnId,
      round: Math.max(1, round || 1),
      attackerSide: side,
      defenderSide: side,
      abilityId: null,
      combo: null,
      pass: true,
      phaseDamage: {
        attack: 0,
        counter: 0,
        upkeepDot: statusDamage,
        collateral: 0,
      },
      damageWithoutBlock: 0,
      damageBlocked: 0,
      damagePrevented: 0,
      counterDamage: 0,
      actualDamage: 0,
    });
    deps.pendingUpkeepRef.current[side] = { turnId: activeTurnId, amount: 0 };
  }
  if (deps.firstPlayerRef.current === null) {
    deps.firstPlayerRef.current = side;
    deps.stats.updateGameMeta({ firstPlayer: side });
  }
};

const mapBuffForStats = (buff: PendingDefenseBuff) => ({
  id: buff.id,
  owner: buff.owner,
  kind: buff.kind,
  statusId: buff.statusId,
  stacks: buff.stacks,
  usablePhase: buff.usablePhase,
  stackCap: buff.stackCap,
  expires: buff.expires ? { ...buff.expires } : undefined,
  cleansable: buff.cleansable,
  carryOverOnKO: buff.carryOverOnKO
    ? { ...buff.carryOverOnKO }
    : undefined,
  turnsRemaining: buff.turnsRemaining,
  createdAt: { ...buff.createdAt },
  source: buff.source ? { ...buff.source } : undefined,
});

const mapExpiredBuffForStats = (entry: DefenseBuffExpirationRecord) => ({
  ...mapBuffForStats(entry),
  reason: entry.reason,
  expiredAt: { ...entry.expiredAt },
});

type ComputedData = {
  ability: OffensiveAbility | null;
  suggestedAbility: OffensiveAbility | null;
  selectedAttackCombo: Combo | null;
  readyForActing: ReturnType<typeof detectCombos>;
  readyForAI: ReturnType<typeof detectCombos>;
  isDefenseTurn: boolean;
  statusActive: boolean;
  showDcLogo: boolean;
  diceTrayVisible: boolean;
  defenseDieIndex: number;
  phase: Phase;
  initialRoll: InitialRollState;
  defenseRoll: DefenseRollResult | null;
  defenseSelection: Combo | null;
  awaitingDefenseSelection: boolean;
  impactLocked: boolean;
  defenseStatusRoll: {
    dice: number[];
    inProgress: boolean;
    label: string | null;
    outcome: "success" | "failure" | null;
  } | null;
  attackBaseDamage: number;
  defenseBaseBlock: number;
  defenseStatusMessage: string | null;
  turnTransitionSide: Side | null;
  activeTransition: ActiveTransition | null;
  activeCue: ActiveCue | null;
  pendingDefenseBuffs: PendingDefenseBuff[];
  defenseBuffExpirations: DefenseBuffExpirationRecord[];
  awaitingDefenseConfirmation: boolean;
  virtualTokens: Record<Side, Tokens>;
};

type StatusSpendPhase = "attackRoll" | "defenseRoll";

type ControllerContext = {
  attackStatusRequests: Record<StatusId, number>;
  defenseStatusRequests: Record<StatusId, number>;
  requestStatusSpend: (phase: StatusSpendPhase, statusId: StatusId) => void;
  undoStatusSpend: (phase: StatusSpendPhase, statusId: StatusId) => void;
  clearAttackStatusRequests: () => void;
  clearDefenseStatusRequests: () => void;
  getStatusBudget: (side: Side, statusId: StatusId) => number;
  consumeStatusBudget: (side: Side, statusId: StatusId, amount: number) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  onRoll: () => void;
  onToggleHold: (index: number) => void;
  onSelectAttackCombo: (combo: Combo | null) => void;
  openDiceTray: () => void;
  closeDiceTray: () => void;
  onEndTurnNoAttack: () => void;
  handleReset: () => void;
  startInitialRoll: () => void;
  confirmInitialRoll: () => void;
  performStatusClearRoll: (side: Side) => void;
  onConfirmAttack: () => void;
  onUserDefenseRoll: () => void;
  onTriggerStatusReaction: (statusId: StatusId) => void;
  onChooseDefenseOption: (combo: Combo | null) => void;
  onConfirmDefense: () => void;
  onConfirmDefenseResolution: () => void;
  activeAbilities: ActiveAbility[];
  onPerformActiveAbility: (abilityId: string) => boolean;
  setDefenseStatusMessage: (message: string | null) => void;
  setDefenseStatusRollDisplay: (
    display: {
      dice: number[];
      inProgress: boolean;
      label: string | null;
      outcome: "success" | "failure" | null;
    } | null
  ) => void;
  devDefenseOverrides: Record<HeroId, DefenseVersion | null>;
  setDefenseVersionOverride: (heroId: HeroId, version: DefenseVersion | null) => void;
  applyDefenseVersionOverride: (hero: Hero) => Hero;
};

type FlowEventOptions = {
  afterReady?: () => void;
  durationMs?: number;
};

const GameDataContext = createContext<ComputedData | null>(null);
const GameControllerContext = createContext<ControllerContext | null>(null);

export const GameController = ({ children }: { children: ReactNode }) => {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const setPlayer = useCallback(
    (side: Side, player: PlayerState, reason?: string) => {
      if (import.meta.env?.DEV) {
        const before = getPlayerSnapshot(side);
        defenseDebugLog("setPlayer", {
          side,
          reason,
          hpBefore: before?.hp ?? null,
          hpAfter: player.hp,
          tokensBefore: before?.tokens ?? null,
          tokensAfter: player.tokens,
        });
      }
      setPlayerSnapshot(side, player);
      dispatch({ type: "SET_PLAYER", side, player, meta: reason ?? "GameController:setPlayer" });
    },
    [dispatch]
  );
  const stats = useStatsTracker();
  const statsSeedRef = useRef<number | null>(null);
  const statsFinalizedRef = useRef(false);
  const currentTurnIdRef = useRef(createTurnId());
  const pendingUpkeepRef = useRef<PendingUpkeepRecord>({
    you: { turnId: currentTurnIdRef.current, amount: 0 },
    ai: { turnId: currentTurnIdRef.current, amount: 0 },
  });
  const firstPlayerRef = useRef<Side | null>(null);
  const turnSignatureRef = useRef({ side: state.turn, phase: state.phase, round: state.round });
  const lastRollEndRef = useRef<number | null>(null);
  const decisionLatencyRef = useRef<number | null>(null);
  const defensePromptAtRef = useRef<number | null>(null);
  const defenseDecisionLatencyRef = useRef<number | null>(null);
  const getAttackDecisionLatency = useCallback(
    () => decisionLatencyRef.current,
    []
  );
  const getDefenseDecisionLatency = useCallback(
    () => defenseDecisionLatencyRef.current,
    []
  );
  const clearDefenseDecisionLatency = useCallback(() => {
    defensePromptAtRef.current = null;
    defenseDecisionLatencyRef.current = null;
  }, []);
  const consumeUpkeepDamage = useCallback(
    (side: Side, turnId: string) => {
      const record = pendingUpkeepRef.current[side];
      if (!record || record.turnId !== turnId) {
        return 0;
      }
      pendingUpkeepRef.current[side] = { turnId, amount: 0 };
      return record.amount;
    },
    []
  );
  const rngRef = useRef<{ seed: number; rng: Rng }>({
    seed: state.rngSeed,
    rng: makeRng(state.rngSeed),
  });
  if (rngRef.current.seed !== state.rngSeed) {
    rngRef.current = {
      seed: state.rngSeed,
      rng: makeRng(state.rngSeed),
    };
  }
  const rng = rngRef.current.rng;

  const {
    pushLog,
    logPlayerAttackStart,
    logPlayerNoCombo,
    logAiAttackRoll,
    logAiNoCombo,
  } = useCombatLog();

  const {
    players,
    turn,
    round,
    dice,
    held,
    rolling,
    rollsLeft,
    aiPreview,
    pendingAttack,
    pendingStatusClear,
  } = state;
  const phase = state.phase;

  const applyPendingDefenseBuff = useCallback(
    (buff: PendingDefenseBuff, trigger: PendingDefenseBuffTrigger) => {
      if (buff.kind !== "status") return;
      const player = getPlayerSnapshot(buff.owner);
      if (!player) return;
      const currentStacks = getStacks(player.tokens, buff.statusId, 0);
      let nextStacks = currentStacks + buff.stacks;
      if (typeof buff.stackCap === "number") {
        nextStacks = Math.min(nextStacks, buff.stackCap);
      }
      const statusDef = getStatus(buff.statusId);
      if (typeof statusDef?.maxStacks === "number") {
        nextStacks = Math.min(nextStacks, statusDef.maxStacks);
      }
      if (nextStacks === currentStacks) return;
      if (import.meta.env?.DEV) {
        defenseDebugLog("pendingDefenseBuff:apply", {
          buffId: buff.id,
          statusId: buff.statusId,
          owner: buff.owner,
          triggerPhase: trigger.phase,
          triggerOwner: trigger.owner,
          createdAt: buff.createdAt,
          usablePhase: buff.usablePhase,
          stacksGranted: buff.stacks,
          stackCap: buff.stackCap ?? null,
          beforeStacks: currentStacks,
          afterStacks: nextStacks,
          source: buff.source ?? null,
          triggerTurnId: trigger.turnId,
          triggerRound: trigger.round,
        });
      }
      const nextTokens = setStacks(player.tokens, buff.statusId, nextStacks);
      setPlayer(
        buff.owner,
        { ...player, tokens: nextTokens },
        "pendingDefenseBuff:apply"
      );
      pushLog(
        `[Status Ready] ${player.hero.name} gains ${buff.statusId} (${nextStacks} stack${
          nextStacks === 1 ? "" : "s"
        }).`
      );
    },
    [latestState, pushLog, setPlayer]
  );

  const enqueuePendingDefenseGrants = useCallback(
    ({
      grants,
      attackerSide,
      defenderSide,
    }: {
      grants: DefenseStatusGrant[];
      attackerSide: Side;
      defenderSide: Side;
    }) => {
      if (!grants || grants.length === 0) return;
      const entries = buildPendingDefenseBuffsFromGrants(grants, {
        attackerSide,
        defenderSide,
        round: state.round,
        turnId: currentTurnIdRef.current,
      });
      if (entries.length === 0) return;
      dispatch({
        type: "SET_PENDING_DEFENSE_BUFFS",
        buffs: [...state.pendingDefenseBuffs, ...entries],
      });
    },
    [dispatch, state.pendingDefenseBuffs, state.round]
  );
  const aiPlayRef = useRef<() => void>(() => {});
  const [attackStatusRequests, setAttackStatusRequests] = useState<
    Record<StatusId, number>
  >({});
  const [defenseStatusRequests, setDefenseStatusRequests] = useState<
    Record<StatusId, number>
  >({});
  useEffect(() => {
    if (import.meta.env?.DEV) {
      defenseDebugLog("defenseStatusRequests:update", defenseStatusRequests);
    }
  }, [defenseStatusRequests]);
  const [turnStatusBudgets, setTurnStatusBudgets] = useState<TurnStatusBudgets>(
    () => ({
      ...createEmptyTurnStatusBudgets(),
    })
  );
  const turnLimitedStatusSet = useMemo(() => {
    const defs = listStatuses();
    return new Set<StatusId>(
      defs
        .filter((status) => status.spend?.turnLimited)
        .map((status) => status.id)
    );
  }, []);
  const [playerDefenseState, setPlayerDefenseState] =
    useState<PlayerDefenseState | null>(null);
  const [playerAttackSelection, setPlayerAttackSelection] =
    useState<Combo | null>(null);
  const [diceTrayVisible, setDiceTrayVisible] = useState(false);
  const [defenseStatusMessage, setDefenseStatusMessage] = useState<string | null>(
    null
  );
const [defenseStatusRoll, setDefenseStatusRoll] = useState<{
    dice: number[];
    inProgress: boolean;
    label: string | null;
    outcome: "success" | "failure" | null;
  } | null>(null);
  const [defenseBuffExpirations, setDefenseBuffExpirations] = useState<
    DefenseBuffExpirationRecord[]
  >([]);
  const [queuedDefenseResolution, setQueuedDefenseResolution] = useState<{
    resolve: () => void;
    defenderSide: Side;
  } | null>(null);
  const queueDefenseResolution = useCallback(
    (payload: { resolve: () => void; defenderSide: Side }) => {
      setQueuedDefenseResolution(payload);
    },
    []
  );
  const confirmQueuedDefenseResolution = useCallback(() => {
    setQueuedDefenseResolution((current) => {
      if (current) {
        current.resolve();
      }
      return null;
    });
  }, []);
  const loadDefenseOverrides = useCallback(() => {
    if (
      !import.meta.env.DEV ||
      typeof window === "undefined"
    ) {
      return {};
    }
    try {
      const raw = window.localStorage.getItem(DEFENSE_OVERRIDE_KEY);
      return raw ? (JSON.parse(raw) as Record<HeroId, DefenseVersion>) : {};
    } catch {
      return {};
    }
  }, []);
  const [devDefenseOverrides, setDevDefenseOverrides] = useState<
    Record<HeroId, DefenseVersion | null>
  >(() => loadDefenseOverrides());
  const persistDefenseOverrides = useCallback(
    (overrides: Record<HeroId, DefenseVersion | null>) => {
      if (!import.meta.env.DEV || typeof window === "undefined") return;
      try {
        const filtered = Object.fromEntries(
          Object.entries(overrides).filter(
            ([, value]) => value && (value === "v1" || value === "v2")
          )
        ) as Record<HeroId, DefenseVersion>;
        window.localStorage.setItem(
          DEFENSE_OVERRIDE_KEY,
          JSON.stringify(filtered)
        );
      } catch {
        // ignore storage errors
      }
    },
    []
  );
  const setDefenseVersionOverride = useCallback(
    (heroId: HeroId, version: DefenseVersion | null) => {
      if (!import.meta.env.DEV) return;
      setDevDefenseOverrides((prev) => {
        const next = { ...prev };
        if (!version) {
          delete next[heroId];
        } else {
          next[heroId] = version;
        }
        persistDefenseOverrides(next);
        return next;
      });
    },
    [persistDefenseOverrides]
  );
  const applyDefenseVersionOverride = useCallback(
    (hero: Hero): Hero => {
      if (!import.meta.env.DEV) return hero;
      const override = devDefenseOverrides[hero.id];
      if (!override || hero.defenseVersion === override) {
        return hero;
      }
      return { ...hero, defenseVersion: override };
    },
    [devDefenseOverrides]
  );


  const archiveExpiredDefenseBuffs = useCallback(
    (
      entries: Array<{ buff: PendingDefenseBuff; reason: string }>,
      context: {
        cause: "phase" | "ko";
        phase?: StatusTimingPhase;
        round: number;
        turnId: string;
      }
    ) => {
      if (!entries.length) return;
      setDefenseBuffExpirations((prev) => [
        ...prev,
        ...entries.map(({ buff, reason }) => ({
          ...buff,
          reason,
          expiredAt: {
            round: context.round,
            turnId: context.turnId,
            phase: context.phase,
            cause: context.cause,
          },
        })),
      ]);
    },
    []
  );

  const pendingDefenseBuffsBufferRef = useRef<PendingDefenseBuff[] | null>(null);

  useEffect(() => {
    pendingDefenseBuffsBufferRef.current = null;
  }, [state.pendingDefenseBuffs]);

  const releasePendingDefenseBuffs = useCallback(
    (
      trigger: PendingDefenseBuffTrigger,
      options?: ReleasePendingOptions
    ): ReleasePendingResult => {
      const snapshot = latestState.current;
      const playerLookup = {
        you: getPlayerSnapshot("you") ?? snapshot.players.you,
        ai: getPlayerSnapshot("ai") ?? snapshot.players.ai,
      };
      const sourceBuffs =
        options?.pendingOverride ??
        pendingDefenseBuffsBufferRef.current ??
        snapshot.pendingDefenseBuffs;
      if (!sourceBuffs.length) {
        return { pending: sourceBuffs, changed: false };
      }
      const { ready, pending, expired } = partitionPendingDefenseBuffs(
        sourceBuffs,
        trigger
      );
      const hasCountdownUpdates =
        ready.length === 0 &&
        expired.length === 0 &&
        pending.length === sourceBuffs.length &&
        pending.some((buff, index) => buff !== sourceBuffs[index]);
      if (!ready.length && !expired.length && !hasCountdownUpdates) {
        pendingDefenseBuffsBufferRef.current = sourceBuffs;
        return { pending: sourceBuffs, changed: false };
      }

      if (expired.length) {
        archiveExpiredDefenseBuffs(expired, {
          cause: "phase",
          phase: trigger.phase,
          round: trigger.round,
          turnId: trigger.turnId,
        });
        expired.forEach(({ buff, reason }) => {
          const owner = playerLookup[buff.owner];
          if (!owner) return;
          pushLog(
            `[Defense] ${owner.hero.name}'s ${buff.statusId} expires${
              reason ? ` (${reason})` : ""
            }.`
          );
        });
      }
      if (ready.length) {
        ready.forEach((buff) => {
          applyPendingDefenseBuff(buff, trigger);
        });
      }
      pendingDefenseBuffsBufferRef.current = pending;
      if (!options?.skipDispatch) {
        dispatch({ type: "SET_PENDING_DEFENSE_BUFFS", buffs: pending });
      }
      return { pending, changed: true };
    },
    [
      applyPendingDefenseBuff,
      archiveExpiredDefenseBuffs,
      dispatch,
      latestState,
      pushLog,
    ]
  );

  const triggerDefenseBuffsBatch = useCallback(
    (entries: Array<{ phase: StatusTimingPhase; owner: Side }>) => {
      if (!entries.length) return;
      let working =
        pendingDefenseBuffsBufferRef.current ??
        latestState.current.pendingDefenseBuffs;
      let changed = false;
      entries.forEach(({ phase, owner }) => {
        const { pending: next, changed: entryChanged } =
          releasePendingDefenseBuffs(
            {
              phase,
              owner,
              turnId: currentTurnIdRef.current,
              round: state.round,
            },
            { pendingOverride: working, skipDispatch: true }
          );
        if (entryChanged) {
          changed = true;
        }
        working = next;
      });
      pendingDefenseBuffsBufferRef.current = working;
      if (changed) {
        dispatch({ type: "SET_PENDING_DEFENSE_BUFFS", buffs: working });
      }
    },
    [dispatch, latestState, releasePendingDefenseBuffs, state.round]
  );
  const triggerDefenseBuffs = useCallback(
    (phase: StatusTimingPhase, owner: Side) => {
      triggerDefenseBuffsBatch([{ phase, owner }]);
    },
    [triggerDefenseBuffsBatch]
  );
  const expireBuffsOnKo = useCallback(
    (side: Side) => {
      const snapshot = latestState.current;
      if (!snapshot.pendingDefenseBuffs.length) return;
      const { pending, expired } = partitionBuffsByKo(
        snapshot.pendingDefenseBuffs,
        side
      );
      if (!expired.length) return;
      dispatch({ type: "SET_PENDING_DEFENSE_BUFFS", buffs: pending });
      archiveExpiredDefenseBuffs(expired, {
        cause: "ko",
        round: state.round,
        turnId: currentTurnIdRef.current,
      });
      expired.forEach(({ buff, reason }) => {
        const owner = snapshot.players[buff.owner];
        if (!owner) return;
        pushLog(
          `[Defense] ${owner.hero.name}'s ${buff.statusId} expires${
            reason ? ` (${reason})` : ""
          }.`
        );
      });
    },
    [
      archiveExpiredDefenseBuffs,
      dispatch,
      latestState,
      pushLog,
      state.round,
    ]
  );
  const lastAttackMarkerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingAttack) {
      lastAttackMarkerRef.current = null;
      return;
    }
    const marker = [
      pendingAttack.attacker,
      pendingAttack.defender,
      pendingAttack.ability.combo,
      pendingAttack.baseDamage,
      pendingAttack.dice.join(""),
    ].join(":");
    if (lastAttackMarkerRef.current === marker) {
      return;
    }
    lastAttackMarkerRef.current = marker;
    triggerDefenseBuffs("nextAttackCommit", pendingAttack.attacker);
  }, [pendingAttack, triggerDefenseBuffs]);
  const lastHpRef = useRef({ you: players.you.hp, ai: players.ai.hp });
  useEffect(() => {
    const previous = lastHpRef.current;
    if (players.you.hp <= 0 && previous.you > 0) {
      expireBuffsOnKo("you");
    }
    if (players.ai.hp <= 0 && previous.ai > 0) {
      expireBuffsOnKo("ai");
    }
    lastHpRef.current = { you: players.you.hp, ai: players.ai.hp };
  }, [expireBuffsOnKo, players.ai.hp, players.you.hp]);
  const [activeTransition, setActiveTransition] =
    useState<ActiveTransition | null>(null);
  const [activeCue, setActiveCue] = useState<ActiveCue | null>(null);
  const lastRoundRef = useRef(state.round);
  useEffect(() => {
    const prevRound = lastRoundRef.current ?? 0;
    if (state.round > 0 && state.round > prevRound) {
      triggerDefenseBuffs("roundEnd", "you");
      triggerDefenseBuffs("roundEnd", "ai");
    }
    lastRoundRef.current = state.round;
  }, [state.round, triggerDefenseBuffs]);
  const prepareTurnStart = useCallback(
    (payload: { side: Side; round: number }) => {
      prepareDefenseTurnStart(
        {
          currentTurnIdRef,
          pendingUpkeepRef,
          releasePendingDefenseBuffs,
        },
        payload
      );
    },
    [releasePendingDefenseBuffs]
  );

  const handleTurnStartStats = useCallback(
    ({
      side,
      round,
      statusDamage,
      hpAfter,
    }: {
      side: Side;
      round: number;
      statusDamage: number;
      hpAfter: number;
    }) =>
      applyDefenseTurnStartStats(
        {
          currentTurnIdRef,
          pendingUpkeepRef,
          stats,
          firstPlayerRef,
        },
        { side, round, statusDamage, hpAfter }
      ),
    [stats]
  );
  const openDiceTray = useCallback(() => {
    setDefenseStatusMessage(null);
    setDefenseStatusRoll(null);
    setDiceTrayVisible(true);
  }, [setDefenseStatusMessage, setDefenseStatusRoll]);
  const closeDiceTray = useCallback(() => {
    setDefenseStatusMessage(null);
    setDefenseStatusRoll(null);
    setDiceTrayVisible(false);
  }, [setDefenseStatusMessage, setDefenseStatusRoll]);
  const [impactLocked, setImpactLocked] = useState(false);
  const impactTimerRef = useRef<(() => void) | null>(null);
  const shakeTimerRef = useRef<(() => void) | null>(null);
  const floatDamageTimerRef = useRef<(() => void) | null>(null);
  const scheduleCallbackRef = useRef<(duration: number, callback: () => void) => () => void>();

  const schedule = useCallback(
    (durationMs: number, callback: () => void): (() => void) => {
      const scheduler = scheduleCallbackRef.current;
      if (!scheduler) {
        callback();
        return () => {};
      }
      return scheduler(durationMs, callback);
    },
    []
  );

  const consumeStatusBudget = useCallback(
    (side: Side, statusId: StatusId, amount: number) => {
      if (amount <= 0) return;
      if (!turnLimitedStatusSet.has(statusId)) return;
      defenseDebugLog("consumeStatusBudget", { side, statusId, amount });
      setTurnStatusBudgets((prev) =>
        consumeTurnStatusBudgetValue(prev, side, statusId, amount)
      );
    },
    [turnLimitedStatusSet]
  );

  const getStatusBudget = useCallback(
    (side: Side, statusId: StatusId) =>
      getTurnStatusBudget(turnStatusBudgets, side, statusId),
    [turnStatusBudgets]
  );

  const getTokenSource = useCallback(
    (phase: StatusSpendPhase): Tokens => {
      if (phase === "defenseRoll" && playerDefenseState?.tokenSnapshot) {
        return playerDefenseState.tokenSnapshot;
      }
      const player = latestState.current.players.you;
      return player?.tokens ?? {};
    },
    [latestState, playerDefenseState]
  );

  const virtualTokens = useMemo<Record<Side, Tokens>>(() => {
    const debugEntries: VirtualTokenDerivationBreakdown[] = [];
    const deriveFor = (side: Side): Tokens => {
      const result = deriveVirtualTokensForSide({
        player: state.players[side],
        side,
        attackStatusRequests,
        defenseStatusRequests,
        pendingDefenseBuffs: state.pendingDefenseBuffs,
      });
      debugEntries.push(result.breakdown);
      return result.tokens;
    };
    const derived = {
      you: deriveFor("you"),
      ai: deriveFor("ai"),
    };
    if (import.meta.env?.DEV) {
      const shouldLog = debugEntries.some(
        (entry) =>
          entry.requestDeltaApplied || entry.pendingBuffSummary.length > 0
      );
      if (shouldLog) {
        defenseDebugLog("virtualTokens:derive", debugEntries);
      }
    }
    return derived;
  }, [
    attackStatusRequests,
    defenseStatusRequests,
    state.pendingDefenseBuffs,
    state.players.ai,
    state.players.you,
  ]);

  const adjustStatusRequest = useCallback(
    (phase: StatusSpendPhase, statusId: StatusId, delta: number) => {
      if (delta === 0) return;
      const setter =
        phase === "attackRoll"
          ? setAttackStatusRequests
          : setDefenseStatusRequests;

      setter((prev) => {
        const current = prev[statusId] ?? 0;
        const tokenSource = getTokenSource(phase);
        const ownedStacks = getStacks(tokenSource, statusId, 0);
        const isTurnLimited = turnLimitedStatusSet.has(statusId);
        let limit = ownedStacks;
        let budgetValue: number | null = null;
        if (isTurnLimited) {
          const budget = getStatusBudget("you", statusId);
          budgetValue = budget;
          if (budget > 0) {
            limit = Math.min(limit, budget);
          }
        }
        if (delta > 0 && limit <= 0) {
          defenseDebugLog("adjustStatusRequest:blocked", {
            phase,
            statusId,
            delta,
            ownedStacks,
            limit,
            budget: budgetValue,
            current,
          });
          return prev;
        }
        let nextValue = current + delta;
        if (delta > 0) {
          nextValue = Math.max(0, Math.min(nextValue, limit));
        } else {
          nextValue = Math.max(0, nextValue);
        }
        if (nextValue === current) {
          defenseDebugLog("adjustStatusRequest:noChange", {
            phase,
            statusId,
            delta,
            ownedStacks,
            limit,
            budget: budgetValue,
            current,
          });
          return prev;
        }
        const logPayload = {
          phase,
          statusId,
          delta,
          ownedStacks,
          limit,
            budget: budgetValue,
          previous: current,
          next: nextValue,
        };
        if (nextValue <= 0) {
          const { [statusId]: _, ...rest } = prev;
          defenseDebugLog("adjustStatusRequest:cleared", logPayload);
          return rest;
        }
        defenseDebugLog("adjustStatusRequest:update", logPayload);
        return { ...prev, [statusId]: nextValue };
      });
    },
    [getStatusBudget, getTokenSource, turnLimitedStatusSet]
  );

  const requestStatusSpend = useCallback(
    (phase: StatusSpendPhase, statusId: StatusId) => {
      adjustStatusRequest(phase, statusId, 1);
    },
    [adjustStatusRequest]
  );

  const undoStatusSpend = useCallback(
    (phase: StatusSpendPhase, statusId: StatusId) => {
      adjustStatusRequest(phase, statusId, -1);
    },
    [adjustStatusRequest]
  );

  const clearAttackStatusRequests = useCallback(() => {
    setAttackStatusRequests({});
  }, []);

  const clearDefenseStatusRequests = useCallback(() => {
    setDefenseStatusRequests({});
  }, []);

  useEffect(() => {
    const clampTurnLimited = (
      prev: Record<StatusId, number>,
      phase: StatusSpendPhase
    ) => {
      if (turnLimitedStatusSet.size === 0) return prev;
      const tokenSource = getTokenSource(phase);
      let next = prev;
      Object.entries(prev).forEach(([statusId, requested]) => {
        if (!turnLimitedStatusSet.has(statusId as StatusId)) return;
        const owned = getStacks(tokenSource, statusId, 0);
        const budget = getStatusBudget("you", statusId as StatusId);
        const maxAllowed = Math.min(owned, budget);
        if (requested <= maxAllowed) return;
        if (maxAllowed <= 0) {
          const { [statusId]: _ignored, ...rest } = next;
          next = rest;
        } else {
          next = { ...next, [statusId]: maxAllowed };
        }
      });
      return next;
    };

    setAttackStatusRequests((prev) => clampTurnLimited(prev, "attackRoll"));
    setDefenseStatusRequests((prev) => clampTurnLimited(prev, "defenseRoll"));
  }, [getStatusBudget, getTokenSource, turnLimitedStatusSet]);


  const triggerImpactLock = useCallback((kind: "hit" | "reflect") => {
    impactTimerRef.current?.();
    setImpactLocked(true);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(kind === "hit" ? 80 : 50);
      } catch {
        // ignore vibration errors
      }
    }
    impactTimerRef.current = schedule(180, () => {
      setImpactLocked(false);
      impactTimerRef.current = null;
    });
  }, [schedule]);

  useEffect(
    () => () => {
      impactTimerRef.current?.();
      impactTimerRef.current = null;
      shakeTimerRef.current?.();
      shakeTimerRef.current = null;
      floatDamageTimerRef.current?.();
      floatDamageTimerRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (statsSeedRef.current === state.rngSeed) {
      return;
    }
    statsSeedRef.current = state.rngSeed;
    statsFinalizedRef.current = false;
    currentTurnIdRef.current = createTurnId();
    pendingUpkeepRef.current = {
      you: { turnId: currentTurnIdRef.current, amount: 0 },
      ai: { turnId: currentTurnIdRef.current, amount: 0 },
    };
    firstPlayerRef.current = null;
    setDefenseBuffExpirations([]);
    const youHeroId = players.you.hero.id;
    const aiHeroId = players.ai.hero.id;
    const youVersion = HERO_VERSION_MAP[youHeroId] ?? "0.0.0";
    const aiVersion = HERO_VERSION_MAP[aiHeroId] ?? "0.0.0";
    const resolvedYouHero = applyDefenseVersionOverride(players.you.hero);
    const resolvedAiHero = applyDefenseVersionOverride(players.ai.hero);
    const heroDefenseVersion = {
      [youHeroId]: resolvedYouHero.defenseVersion ?? "v1",
      [aiHeroId]: resolvedAiHero.defenseVersion ?? "v1",
    };
    const heroSchemaHash = {
      [youHeroId]: players.you.hero.defenseSchemaHash ?? null,
      [aiHeroId]: players.ai.hero.defenseSchemaHash ?? null,
    };
    stats.beginGame({
      heroId: youHeroId,
      opponentHeroId: aiHeroId,
      seed: state.rngSeed,
      heroVersion: {
        [youHeroId]: youVersion,
        [aiHeroId]: aiVersion,
      },
      rulesVersion: RULES_VERSION,
      buildHash: BUILD_HASH,
      firstPlayer: state.turn,
      defenseMeta: {
        enableDefenseV2: ENABLE_DEFENSE_V2,
        defenseDslVersion: DEFENSE_DSL_VERSION,
        defenseSchemaVersion: DEFENSE_SCHEMA_VERSION,
        heroDefenseVersion,
        heroSchemaHash,
        totals: createDefenseTelemetryTotals(),
      },
    });
  }, [
    players.ai.hero.id,
    players.you.hero.id,
    setDefenseBuffExpirations,
    state.rngSeed,
    state.turn,
    stats,
    applyDefenseVersionOverride,
  ]);

  useEffect(() => {
    turnSignatureRef.current = { side: turn, phase, round };
  }, [phase, round, turn]);

  useEffect(() => {
    if (pendingAttack) {
      if (pendingAttack.defender === "you") {
        defensePromptAtRef.current = Date.now();
        defenseDecisionLatencyRef.current = null;
      } else {
        clearDefenseDecisionLatency();
      }
    } else {
      clearDefenseDecisionLatency();
    }
  }, [pendingAttack, clearDefenseDecisionLatency]);

  const setDice = useCallback(
    (value: number[] | ((prev: number[]) => number[])) => {
      const next =
        typeof value === "function"
          ? (value as (prev: number[]) => number[])(latestState.current.dice)
          : value;
      dispatch({ type: "SET_DICE", dice: next });
    },
    [dispatch]
  );

  const setHeld = useCallback(
    (value: boolean[] | ((prev: boolean[]) => boolean[])) => {
      const next =
        typeof value === "function"
          ? (value as (prev: boolean[]) => boolean[])(latestState.current.held)
          : value;
      dispatch({ type: "SET_HELD", held: next });
    },
    [dispatch]
  );

  const setRolling = useCallback(
    (value: boolean[]) => {
      dispatch({ type: "SET_ROLLING", rolling: value });
    },
    [dispatch]
  );

  const setRollsLeft = useCallback(
    (value: number | ((prev: number) => number)) => {
      const next =
        typeof value === "function"
          ? (value as (prev: number) => number)(latestState.current.rollsLeft)
          : value;
      dispatch({ type: "SET_ROLLS_LEFT", rollsLeft: next });
    },
    [dispatch]
  );

  const handlePlayerRollComplete = useCallback(() => {
    lastRollEndRef.current = Date.now();
    decisionLatencyRef.current = null;
  }, []);

  const { animateRoll: animatePlayerRoll } = useRollAnimator({
    stateRef: latestState,
    setDice,
    setRolling,
    setRollsLeft,
    rng,
    durationMs: ROLL_ANIM_MS,
    onRollComplete: handlePlayerRollComplete,
  });

  const setFloatDamage = useCallback(
    (side: Side, value: GameState["fx"]["floatDamage"][Side]) => {
      dispatch({ type: "SET_FLOAT_DAMAGE", side, value });
    },
    [dispatch]
  );

  const setShake = useCallback(
    (side: Side, value: boolean) => {
      dispatch({ type: "SET_SHAKE", side, value });
    },
    [dispatch]
  );

  const popDamage = useCallback(
    (side: Side, amount: number, kind: "hit" | "reflect" = "hit") => {
      const payload = { val: amount, kind } as const;
      setFloatDamage(side, payload);
      if (amount > 0) {
        triggerImpactLock(kind);
      }
      if (kind === "hit") {
        setShake(side, true);
        shakeTimerRef.current?.();
        shakeTimerRef.current = schedule(450, () => {
          setShake(side, false);
          shakeTimerRef.current = null;
        });
      }
      floatDamageTimerRef.current?.();
      floatDamageTimerRef.current = schedule(1300, () => {
        setFloatDamage(side, null);
        floatDamageTimerRef.current = null;
      });
    },
    [schedule, setFloatDamage, setShake, triggerImpactLock]
  );

  const readyForActing = useMemo(() => detectCombos(dice), [dice]);
  const readyForAI = useMemo(
    () => detectCombos(aiPreview.dice),
    [aiPreview.dice]
  );
  const suggestedAbility = useMemo(
    () => bestAbility(players.you.hero, dice),
    [players.you.hero, dice]
  );
  const playerSelectedAbility = useMemo(
    () =>
      selectedAbilityForHero(players.you.hero, dice, playerAttackSelection),
    [dice, playerAttackSelection, players.you.hero]
  );
  const ability = useMemo(
    () =>
      turn === "you"
        ? playerSelectedAbility ?? suggestedAbility
        : suggestedAbility,
    [playerSelectedAbility, suggestedAbility, turn]
  );
  const attackBaseDamage = ability?.damage ?? 0;
  useEffect(() => {
    if (!ability || attackBaseDamage <= 0) {
      setAttackStatusRequests({});
    }
  }, [ability, attackBaseDamage]);
  useEffect(() => {
    if (turn !== "you") {
      setPlayerAttackSelection(null);
      return;
    }
    if (
      playerAttackSelection &&
      !readyForActing[playerAttackSelection]
    ) {
      setPlayerAttackSelection(null);
    }
  }, [playerAttackSelection, readyForActing, turn]);
  useEffect(() => {
    if (state.phase !== "roll" || turn !== "you") {
      setDiceTrayVisible(false);
    }
  }, [state.phase, turn]);
  const isDefenseTurn = !!pendingAttack && pendingAttack.defender === "you";
  const initialRoll = state.initialRoll;
  const defenseBaseBlock = playerDefenseState?.baseResolution.baseBlock ?? 0;
  useEffect(() => {
    // no-op: keep defense requests until they are consumed
  }, [playerDefenseState, defenseBaseBlock]);

  useEffect(() => {
    if (turnLimitedStatusSet.size === 0) return;
    setTurnStatusBudgets((prev) => {
      let next = prev;
      turnLimitedStatusSet.forEach((statusId) => {
        const ownedYou = getStacks(players.you.tokens, statusId, 0);
        const ownedAi = getStacks(players.ai.tokens, statusId, 0);
        next = setTurnStatusBudgetValue(next, "you", statusId, ownedYou);
        next = setTurnStatusBudgetValue(next, "ai", statusId, ownedAi);
      });
      return next;
    });
  }, [players.ai.tokens, players.you.tokens, turnLimitedStatusSet]);
  const statusActive = !!pendingStatusClear;
  const showDcLogo =
    turn === "you" && rollsLeft === 3 && !pendingAttack && !statusActive;

  const {
    resetRoll,
    animateDefenseDie,
    animateDefenseRoll,
    restoreDiceAfterDefense,
  } = useDiceAnimator({ defenseDieIndex: DEF_DIE_INDEX, rng });
  const { animatePreviewRoll } = useAiDiceAnimator({
    rollDurationMs: AI_ROLL_ANIM_MS,
  });
  const {
    send: sendFlowEvent,
    resumePendingStatus,
    scheduleCallback,
    enqueueCue,
    clearCues,
    interruptCue,
  } = useGameFlow({
    resetRoll,
    pushLog,
    popDamage,
    onTransitionChange: setActiveTransition,
    onCueChange: setActiveCue,
    onTurnPrepare: prepareTurnStart,
    onTurnStart: handleTurnStartStats,
  });
  scheduleCallbackRef.current = scheduleCallback;

  const queueTurnCue = useCallback(
    (side: Side, durationMs?: number) => {
      const snapshot = latestState.current;
      const player = snapshot.players[side];
      if (!player) return;
      const fallbackDuration = getCueDuration("turn");
      const effectiveDuration =
        typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
          ? durationMs
          : fallbackDuration;
      interruptCue();
      enqueueCue({
        kind: "turn",
        title: side === "you" ? "Your Turn" : "Opponent Turn",
        subtitle: player.hero.name,
        durationMs: effectiveDuration,
        side,
        priority: "urgent",
        allowDuringTransition: true,
      });
    },
    [enqueueCue, interruptCue, latestState]
  );

  const handleFlowEvent = useCallback(
    (event: CombatEvent, options: FlowEventOptions = {}) => {
      if (event.type !== "TURN_END") {
        return;
      }

      const prePhase = event.payload.prePhase ?? "turnTransition";
      const defaultDuration = prePhase === "turnTransition" ? TURN_TRANSITION_DELAY_MS : 0;
      const rawDuration =
        options.durationMs ?? event.payload.durationMs ?? defaultDuration;
      const durationMs =
        typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration
          : 0;

      const endingSide: Side = event.payload.next === "you" ? "ai" : "you";
      triggerDefenseBuffs("turnEnd", endingSide);

      if (prePhase === "turnTransition") {
        const fallbackTurnDuration = getCueDuration("turn", TURN_TRANSITION_DELAY_MS);
        queueTurnCue(
          event.payload.next,
          durationMs > 0 ? durationMs : fallbackTurnDuration
        );
      }

      sendFlowEvent({
        type: "TURN_END",
        next: event.payload.next,
        prePhase,
        durationMs,
        afterReady: options.afterReady,
      });
    },
    [queueTurnCue, sendFlowEvent, triggerDefenseBuffs]
  );

  const applyTurnEndResolution = useCallback(
    (
      resolution: TurnEndResolution,
      logOptions?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
    ) => {
      if (resolution.logs.length) {
        pushLog(resolution.logs, logOptions);
      }
      resolution.events.forEach((event) => {
        const afterReady =
          event.followUp === "trigger_ai_turn"
            ? () => {
                scheduleCallback(AI_PASS_FOLLOW_UP_MS, () => {
                  const snapshot = latestState.current;
                  const aiState = snapshot.players.ai;
                  const youState = snapshot.players.you;
                  if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
                    return;
                  aiPlayRef.current();
                });
              }
            : undefined;

        handleFlowEvent(event, { afterReady });
      });
    },
    [handleFlowEvent, latestState, pushLog, scheduleCallback]
  );

  const startInitialRoll = useCallback(() => {
    if (
      phase !== "standoff" ||
      initialRoll.inProgress ||
      initialRoll.awaitingConfirmation
    )
      return;
    dispatch({ type: "START_INITIAL_ROLL" });
    const youRoll = rollDie(rng);
    const aiRoll = rollDie(rng);
    const winner =
      youRoll === aiRoll ? null : youRoll > aiRoll ? ("you" as Side) : "ai";

    scheduleCallback(350, () => {
      dispatch({
        type: "RESOLVE_INITIAL_ROLL",
        payload: { you: youRoll, ai: aiRoll, winner },
      });
      const logEntry =
        winner === null
          ? `Initiative roll tie: You ${youRoll} vs AI ${aiRoll}. Roll again!`
          : `Initiative roll: You ${youRoll} vs AI ${aiRoll}. ${
              winner === "you" ? "You begin." : "AI begins."
            }`;
      pushLog(logEntry, { blankLineBefore: true });
    });
  }, [
    dispatch,
    initialRoll.awaitingConfirmation,
    initialRoll.inProgress,
    phase,
    pushLog,
    rng,
    scheduleCallback,
  ]);

  const confirmInitialRoll = useCallback(() => {
    if (
      phase !== "standoff" ||
      initialRoll.inProgress ||
      !initialRoll.awaitingConfirmation ||
      !initialRoll.winner
    ) {
      return;
    }
    dispatch({ type: "CONFIRM_INITIAL_ROLL" });
  }, [dispatch, initialRoll, phase]);

  const { performStatusClearRoll } = useStatusManager({
    pushLog,
    animateDefenseDie,
    restoreDiceAfterDefense,
    sendFlowEvent,
    resumePendingStatus,
    scheduleCallback: schedule,
    setDefenseStatusMessage,
    setDefenseStatusRollDisplay: setDefenseStatusRoll,
    openDiceTray,
  });
  const { aiPlay } = useAiController({
    logAiNoCombo,
    logAiAttackRoll,
    animatePreviewRoll,
    sendFlowEvent,
    aiStepDelay: AI_STEP_MS,
    scheduleDelay: schedule,
    getStatusBudget,
    consumeStatusBudget,
    onAiNoCombo: () => {
      applyTurnEndResolution(
        resolvePassTurn({
          side: "ai",
          durationMs: AI_PASS_EVENT_DURATION_MS,
        })
      );
    },
    rng,
  });

  useEffect(() => {
    aiPlayRef.current = aiPlay;
  }, [aiPlay]);
  const {
    onConfirmAttack,
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense: baseOnConfirmDefense,
    onUserStatusReaction,
  } = useDefenseActions({
    turn,
    round,
    turnId: currentTurnIdRef.current,
    getAttackDecisionLatency,
    getDefenseDecisionLatency,
    clearDefenseDecisionLatency,
    consumeUpkeepDamage,
    rolling,
    ability,
    dice,
    you: players.you,
    pendingAttack,
    logPlayerNoCombo,
    logPlayerAttackStart,
    pushLog,
    animateDefenseDie,
    animateDefenseRoll,
    openDiceTray,
    closeDiceTray,
    popDamage,
    restoreDiceAfterDefense,
    handleFlowEvent,
    sendFlowEvent,
    aiPlay,
    aiStepDelay: AI_STEP_MS,
    attackStatusRequests,
    defenseStatusRequests,
    clearAttackStatusRequests,
    clearDefenseStatusRequests,
    getStatusBudget,
    consumeStatusBudget,
    playerDefenseState,
    setPlayerDefenseState,
    applyTurnEndResolution,
    setDefenseStatusMessage,
    setDefenseStatusRollDisplay: setDefenseStatusRoll,
    queuePendingDefenseGrants: enqueuePendingDefenseGrants,
    triggerDefenseBuffs,
    triggerDefenseBuffsBatch,
    enqueueCue,
    interruptCue,
    scheduleCallback,
    applyDefenseVersionOverride,
    queueDefenseResolution,
    setPlayer,
  });

  const onConfirmDefense = useCallback(() => {
    if (pendingAttack?.defender === "you" && defensePromptAtRef.current) {
      defenseDecisionLatencyRef.current = Date.now() - defensePromptAtRef.current;
    }
    baseOnConfirmDefense();
  }, [baseOnConfirmDefense, pendingAttack]);

  const handleAbilityControllerAction = useCallback(
    (
      action: NonNullable<ActiveAbilityOutcome["controllerAction"]>,
      _context: ActiveAbilityContext
    ) => {
      switch (action.type) {
        case "USE_STATUS_REACTION":
          if (action.payload && typeof action.payload === "object") {
            const statusId = (action.payload as { statusId?: StatusId })
              .statusId;
            if (statusId) {
              onUserStatusReaction(statusId);
            }
          }
          break;
        default:
          break;
      }
    },
    [onUserStatusReaction]
  );

  const turnTransitionSide =
    activeTransition?.phase === "turnTransition" ? activeTransition.side : null;

  const { abilities: activeAbilities, performAbility: onPerformActiveAbility } =
    useActiveAbilities({
      side: "you",
      pushLog,
      popDamage,
      sendFlowEvent,
      handleControllerAction: handleAbilityControllerAction,
    });


  const onRoll = useCallback(() => {
    if (turn !== "you" || rollsLeft <= 0 || statusActive || isDefenseTurn) {
      return;
    }
    const attemptIndex = Math.max(0, 3 - rollsLeft);
    const combosAvailable = Object.entries(readyForActing)
      .filter(([, ok]) => ok)
      .map(([combo]) => combo);
    stats.recordRoll({
      turnId: currentTurnIdRef.current,
      side: turn,
      round: Math.max(1, round || 1),
      attemptIndex,
      diceBeforeHold: [...dice],
      holdsUsed: held.filter(Boolean).length,
      combosAvailable,
      selectedCombo: playerAttackSelection,
      firstRollHit: attemptIndex === 0 && combosAvailable.length > 0,
      startedAt: Date.now(),
    });
    openDiceTray();
    const mask = held.map((h) => !h);
    animatePlayerRoll(mask);
  }, [
    animatePlayerRoll,
    dice,
    held,
    isDefenseTurn,
    openDiceTray,
    playerAttackSelection,
    readyForActing,
    round,
    rollsLeft,
    stats,
    statusActive,
    turn,
  ]);

  const onToggleHold = useCallback(
    (index: number) => {
      if (turn !== "you") return;
      setHeld((prev) =>
        prev.map((value, idx) => (idx === index ? !value : value))
      );
    },
    [setHeld, turn]
  );

  const onSelectAttackCombo = useCallback(
    (combo: Combo | null) => {
      if (turn !== "you" || statusActive || isDefenseTurn) return;
      setPlayerAttackSelection(combo);
      if (
        combo &&
        lastRollEndRef.current &&
        decisionLatencyRef.current === null
      ) {
        decisionLatencyRef.current = Date.now() - lastRollEndRef.current;
      }
    },
    [isDefenseTurn, statusActive, turn]
  );

  useEffect(() => {
    if (
      pendingStatusClear &&
      pendingStatusClear.side === "ai" &&
      !pendingStatusClear.roll &&
      !pendingStatusClear.rolling
    ) {
      return scheduleCallback(700, () => performStatusClearRoll("ai"));
    }
    return undefined;
  }, [pendingStatusClear, performStatusClearRoll, scheduleCallback]);

  const onEndTurnNoAttack = useCallback(() => {
    if (turn !== "you" || rolling.some(Boolean)) return;
    const heroName = players.you.hero.name;
    const resolution = resolvePassTurn({
      side: "you",
      message: `[Turn] ${heroName} ends the turn.`,
    });
    applyTurnEndResolution(resolution, { blankLineBefore: true });
  }, [applyTurnEndResolution, players.you.hero.name, rolling, turn]);

  const handleReset = useCallback(() => {
    const current = latestState.current;
    if (!statsFinalizedRef.current) {
      stats.finalizeGame({
        winner: null,
        resultType: "abandon",
        roundsPlayed: Math.max(1, current.round || 1),
        hp: { you: current.players.you.hp, ai: current.players.ai.hp },
      });
      statsFinalizedRef.current = true;
    }
    clearCues();
    dispatch({
      type: "RESET",
      payload: {
        youHero: current.players.you.hero,
        aiHero: current.players.ai.hero,
        seed: Date.now(),
      },
    });
    resetRoll();
    setQueuedDefenseResolution(null);
  }, [clearCues, dispatch, resetRoll, stats, latestState, setQueuedDefenseResolution]);

  useEffect(() => {
    const youDefeated = players.you.hp <= 0;
    const aiDefeated = players.ai.hp <= 0;
    if (youDefeated || aiDefeated) {
      clearCues();
      if (!statsFinalizedRef.current) {
        statsFinalizedRef.current = true;
        const winner: Side | "draw" | null = youDefeated && aiDefeated ? "draw" : youDefeated ? "ai" : "you";
        stats.finalizeGame({
          winner,
          resultType: winner === "you" ? "win" : winner === "ai" ? "loss" : "draw",
          roundsPlayed: Math.max(1, state.round || 1),
          hp: { you: players.you.hp, ai: players.ai.hp },
        });
      }
    }
  }, [clearCues, players.ai.hp, players.you.hp, state.round, stats]);

  const initialStartRef = useRef(false);
  const initialStartTimersRef = useRef<{
    start: (() => void) | null;
    follow: (() => void) | null;
  }>({ start: null, follow: null });
  const clearInitialStartTimers = useCallback(() => {
    initialStartTimersRef.current.start?.();
    initialStartTimersRef.current.start = null;
    initialStartTimersRef.current.follow?.();
    initialStartTimersRef.current.follow = null;
  }, []);
  const lastAttackCueKeyRef = useRef<string | null>(null);
  const lastStatusCueKeyRef = useRef<string | null>(null);
  const statusTrayPromptKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase === "standoff") {
      initialStartRef.current = false;
      clearInitialStartTimers();
    }
  }, [clearInitialStartTimers, state.phase]);
  useEffect(() => {
    return () => {
      clearInitialStartTimers();
    };
  }, [clearInitialStartTimers]);

  useEffect(() => {
    if (!diceTrayVisible) {
      return;
    }

    const inPlayerRollPhase = state.phase === "roll" && turn === "you";
    const inDefensePhase = state.phase === "defense";
    const duringInitialRoll = state.initialRoll.inProgress;
    const playerStatusClearActive =
      Boolean(state.pendingStatusClear) &&
      state.pendingStatusClear?.side === "you";

    if (
      inPlayerRollPhase ||
      inDefensePhase ||
      duringInitialRoll ||
      playerStatusClearActive
    ) {
      return;
    }

    closeDiceTray();
  }, [
    diceTrayVisible,
    state.phase,
    state.initialRoll.inProgress,
    state.pendingStatusClear,
    turn,
    closeDiceTray,
  ]);

  useEffect(() => {
    if (!pendingAttack) {
      lastAttackCueKeyRef.current = null;
      return;
    }
    const bonusDamage =
      pendingAttack.modifiers?.statusSpends?.reduce(
        (sum, spend) => sum + (spend.bonusDamage ?? 0),
        0
      ) ?? 0;
    const projectedDamage = Math.max(0, pendingAttack.baseDamage + bonusDamage);
    const key = `${pendingAttack.attacker}:${pendingAttack.ability.combo}:${pendingAttack.dice.join(
      ""
    )}:${projectedDamage}`;
    if (key === lastAttackCueKeyRef.current) {
      return;
    }
    lastAttackCueKeyRef.current = key;
    const attacker = players[pendingAttack.attacker];
    const attackerName = attacker?.hero.name ?? "Opponent";
    const abilityCombo = pendingAttack.ability.combo;
    const abilityTitle =
      pendingAttack.ability.displayName ??
      pendingAttack.ability.label ??
      pendingAttack.ability.combo;
    const abilityIconVariants =
      attacker && abilityCombo
        ? getAbilityIcon(attacker.hero.id, abilityCombo)
        : undefined;
    const abilityIconSource =
      abilityIconVariants?.offense ?? abilityIconVariants?.defense;
    const abilityIcon =
      abilityIconSource?.webp ?? abilityIconSource?.png ?? null;
    enqueueCue({
      kind: "attack",
      title: abilityTitle,
      subtitle: `${attackerName} prepares an attack (${projectedDamage} dmg)`,
      icon: abilityIcon,
      cta: "Prepare for defense!",
      durationMs: getCueDuration("attackTelegraph"),
      side: pendingAttack.attacker,
      priority: "urgent",
    });
  }, [enqueueCue, pendingAttack, players]);

  useEffect(() => {
    if (!pendingStatusClear) {
      lastStatusCueKeyRef.current = null;
      statusTrayPromptKeyRef.current = null;
      return;
    }
    if (pendingStatusClear.rolling) {
      return;
    }
    const key = `${pendingStatusClear.side}:${pendingStatusClear.status}:${pendingStatusClear.stacks}`;
    if (key === lastStatusCueKeyRef.current) {
      return;
    }
    lastStatusCueKeyRef.current = key;
    const status = getStatus(pendingStatusClear.status);
    const ownerName =
      pendingStatusClear.side === "you"
        ? players.you.hero.name
        : players.ai.hero.name;
    enqueueCue({
      kind: "status",
      title: status?.name ?? pendingStatusClear.status,
      subtitle: `${ownerName} - ${pendingStatusClear.stacks} stack${
        pendingStatusClear.stacks === 1 ? "" : "s"
      }`,
      durationMs: getCueDuration("statusTick"),
      side: pendingStatusClear.side,
      priority: "low",
      mergeKey: key,
      mergeWindowMs: 2200,
    });
  }, [enqueueCue, pendingStatusClear, players.ai.hero.name, players.you.hero.name]);

  useEffect(() => {
    if (!pendingStatusClear || pendingStatusClear.side !== "you") {
      statusTrayPromptKeyRef.current = null;
      return;
    }
    const key = `${pendingStatusClear.side}:${pendingStatusClear.status}:${pendingStatusClear.stacks}:${pendingStatusClear.action}`;
    if (statusTrayPromptKeyRef.current === key) {
      return;
    }
    statusTrayPromptKeyRef.current = key;
    setDiceTrayVisible(true);
  }, [pendingStatusClear]);

  useEffect(() => {
    if (
      !initialStartRef.current &&
      state.phase === "upkeep" &&
      state.round === 0 &&
      !state.initialRoll.inProgress &&
      state.initialRoll.winner
    ) {
      initialStartRef.current = true;
      clearInitialStartTimers();
      const startingSide = state.turn;
      const cancelStart = scheduleCallback(0, () => {
        initialStartTimersRef.current.start = null;
        if (startingSide === "ai") {
          queueTurnCue("ai", TURN_TRANSITION_DELAY_MS);
          const cont = sendFlowEvent({
            type: "TURN_START",
            side: "ai",
            afterReady: () => {
              initialStartTimersRef.current.follow?.();
              initialStartTimersRef.current.follow = scheduleCallback(450, () => {
                initialStartTimersRef.current.follow = null;
                const aiState = latestState.current.players.ai;
                const youState = latestState.current.players.you;
                if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
                  return;
                aiPlay();
              });
            },
          });
          if (!cont) {
            initialStartTimersRef.current.follow?.();
            initialStartTimersRef.current.follow = null;
          }
        } else {
          queueTurnCue("you", TURN_TRANSITION_DELAY_MS);
          sendFlowEvent({ type: "TURN_START", side: "you" });
        }
      });
      initialStartTimersRef.current.start = cancelStart;
    }
  }, [
    aiPlay,
    clearInitialStartTimers,
    queueTurnCue,
    scheduleCallback,
    sendFlowEvent,
    state.initialRoll.inProgress,
    state.initialRoll.winner,
    state.phase,
    state.round,
    state.turn,
  ]);

  useEffect(() => {
    stats.updateGameMeta({
      defenseBuffs: {
        pending: state.pendingDefenseBuffs.map(mapBuffForStats),
        expired: defenseBuffExpirations.map(mapExpiredBuffForStats),
      },
    });
  }, [defenseBuffExpirations, state.pendingDefenseBuffs, stats]);

  const dataValue: ComputedData = useMemo(
    () => ({
      ability,
      suggestedAbility,
      selectedAttackCombo: playerAttackSelection,
      readyForActing,
      readyForAI,
      isDefenseTurn,
      statusActive,
      showDcLogo,
      diceTrayVisible,
      defenseDieIndex: isDefenseTurn ? -1 : DEF_DIE_INDEX,
      phase,
      initialRoll,
      defenseRoll: playerDefenseState?.roll ?? null,
      defenseSelection: playerDefenseState?.selectedCombo ?? null,
      awaitingDefenseSelection: !!playerDefenseState,
      impactLocked,
      defenseStatusRoll,
      attackBaseDamage,
      defenseBaseBlock,
      defenseStatusMessage,
      turnTransitionSide,
      activeTransition,
      activeCue,
      pendingDefenseBuffs: state.pendingDefenseBuffs,
      defenseBuffExpirations,
      awaitingDefenseConfirmation: Boolean(queuedDefenseResolution),
      virtualTokens,
    }),
    [
      ability,
      suggestedAbility,
      playerAttackSelection,
      readyForActing,
      readyForAI,
      isDefenseTurn,
      statusActive,
      showDcLogo,
      diceTrayVisible,
      phase,
      initialRoll,
      playerDefenseState,
      impactLocked,
      defenseStatusRoll,
      attackBaseDamage,
      defenseBaseBlock,
      defenseStatusMessage,
      turnTransitionSide,
      activeTransition,
      activeCue,
      defenseBuffExpirations,
      state.pendingDefenseBuffs,
      queuedDefenseResolution,
      virtualTokens,
    ]
  );

  const controllerValue: ControllerContext = useMemo(
    () => ({
      attackStatusRequests,
      defenseStatusRequests,
      requestStatusSpend,
      undoStatusSpend,
      clearAttackStatusRequests,
      clearDefenseStatusRequests,
      getStatusBudget,
      consumeStatusBudget,
      popDamage,
      onRoll,
      onToggleHold,
      onSelectAttackCombo,
      openDiceTray,
      closeDiceTray,
      onEndTurnNoAttack,
      handleReset,
      startInitialRoll,
      confirmInitialRoll,
      performStatusClearRoll,
      onConfirmAttack,
      onUserDefenseRoll,
      onChooseDefenseOption,
      onConfirmDefense,
      onConfirmDefenseResolution: confirmQueuedDefenseResolution,
      onTriggerStatusReaction: onUserStatusReaction,
      activeAbilities,
      onPerformActiveAbility,
      setDefenseStatusMessage,
      setDefenseStatusRollDisplay: setDefenseStatusRoll,
      devDefenseOverrides,
      setDefenseVersionOverride,
      applyDefenseVersionOverride,
    }),
    [
      attackStatusRequests,
      defenseStatusRequests,
      requestStatusSpend,
      undoStatusSpend,
      clearAttackStatusRequests,
      clearDefenseStatusRequests,
      activeAbilities,
      handleReset,
      onConfirmAttack,
      onEndTurnNoAttack,
      onPerformActiveAbility,
      onRoll,
      onToggleHold,
      onSelectAttackCombo,
      openDiceTray,
      closeDiceTray,
      getStatusBudget,
      consumeStatusBudget,
      onUserDefenseRoll,
      onChooseDefenseOption,
      onConfirmDefense,
      onUserStatusReaction,
      performStatusClearRoll,
      popDamage,
      startInitialRoll,
      confirmInitialRoll,
      setDefenseStatusMessage,
      setDefenseStatusRoll,
      devDefenseOverrides,
      setDefenseVersionOverride,
      applyDefenseVersionOverride,
      confirmQueuedDefenseResolution,
    ]
  );

  return (
    <GameDataContext.Provider value={dataValue}>
      <GameControllerContext.Provider value={controllerValue}>
        {children}
      </GameControllerContext.Provider>
    </GameDataContext.Provider>
  );
};

export const useGameData = () => {
  const context = useContext(GameDataContext);
  if (!context) {
    throw new Error("useGameData must be used within a GameController");
  }
  return context;
};

export const useGameController = () => {
  const context = useContext(GameControllerContext);
  if (!context) {
    throw new Error("useGameController must be used within a GameController");
  }
  return context;
};

export { DEF_DIE_INDEX };
