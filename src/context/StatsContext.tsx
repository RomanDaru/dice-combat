import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { StatsTracker } from "../stats/tracker";
import type {
  GameStat,
  StatsFinalizeInput,
  StatsGameInit,
  StatsRollInput,
  StatsSnapshot,
  StatsTurnInput,
  StatusRemovalReason,
} from "../stats/types";
import type { Side, Tokens } from "../game/types";

type StatsContextValue = {
  beginGame: (meta: StatsGameInit) => void;
  recordRoll: (entry: StatsRollInput) => void;
  recordTurn: (entry: StatsTurnInput) => void;
  finalizeGame: (input: StatsFinalizeInput) => StatsSnapshot | null;
  getSnapshot: () => StatsSnapshot | null;
  updateGameMeta: (partial: Partial<GameStat>) => void;
  recordStatusSnapshot: (
    side: Side,
    tokens: Tokens | undefined,
    round: number,
    reason?: StatusRemovalReason
  ) => ReturnType<StatsTracker["recordStatusSnapshot"]>;
};

const StatsContext = createContext<StatsContextValue | null>(null);

const createSessionId = () =>
  `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const StatsProvider = ({ children }: { children: ReactNode }) => {
  const trackerRef = useRef(new StatsTracker());
  const sessionIdRef = useRef(createSessionId());

  const beginGame = useCallback(
    (meta: StatsGameInit) => {
      trackerRef.current.beginGame({
        ...meta,
        sessionId: meta.sessionId ?? sessionIdRef.current,
      });
    },
    []
  );

  const recordRoll = useCallback((entry: StatsRollInput) => {
    trackerRef.current.recordRoll(entry);
  }, []);

  const recordTurn = useCallback((entry: StatsTurnInput) => {
    trackerRef.current.recordTurn(entry);
  }, []);

  const finalizeGame = useCallback((input: StatsFinalizeInput) => {
    return trackerRef.current.finalizeGame(input);
  }, []);

  const updateGameMeta = useCallback((partial: Partial<GameStat>) => {
    trackerRef.current.updateGameMeta(partial);
  }, []);

  const getSnapshot = useCallback((): StatsSnapshot | null => {
    const snapshot = trackerRef.current.getSnapshot();
    if (!snapshot.gameStats) {
      return null;
    }
    return snapshot;
  }, []);

  const recordStatusSnapshot = useCallback(
    (
      side: Side,
      tokens: Tokens | undefined,
      round: number,
      reason?: StatusRemovalReason
    ) => trackerRef.current.recordStatusSnapshot(side, tokens, round, reason),
    []
  );

  const value = useMemo(
    () => ({
      beginGame,
      recordRoll,
      recordTurn,
      finalizeGame,
      getSnapshot,
      updateGameMeta,
      recordStatusSnapshot,
    }),
    [beginGame, recordRoll, recordTurn, finalizeGame, getSnapshot, updateGameMeta, recordStatusSnapshot]
  );

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
};

export const useStatsTracker = () => {
  const context = useContext(StatsContext);
  if (!context) {
    throw new Error("useStatsTracker must be used within a StatsProvider");
  }
  return context;
};
