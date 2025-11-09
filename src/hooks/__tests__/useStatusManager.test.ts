import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStatusManager } from "../useStatusManager";
import type { GameState, PendingStatusClear } from "../../game/state";
import type { Side } from "../../game/types";

const mockDispatch = vi.fn();
const basePlayer = {
  hero: {
    id: "you",
    name: "You",
    maxHp: 30,
    offensiveBoard: {},
    defensiveBoard: {},
    ai: {
      chooseHeld: () => [false, false, false, false, false],
    },
  },
  hp: 30,
  tokens: {},
};

const mockState: GameState = {
  log: [] as { t: string }[],
  rngSeed: 1,
  players: {
    you: { ...basePlayer },
    ai: {
      ...basePlayer,
      hero: {
        ...basePlayer.hero,
        id: "ai",
        name: "AI",
      },
    },
  },
  turn: "you",
  phase: "roll",
  round: 1,
  dice: [1, 1, 1, 1, 1],
  held: [false, false, false, false, false],
  rolling: [false, false, false, false, false],
  rollsLeft: 3,
  aiPreview: {
    active: false,
    rolling: false,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
  },
  aiDefense: {
    inProgress: false,
    defenseRoll: null,
    defenseDice: null,
    defenseCombo: null,
    evasiveRoll: null,
  },
  pendingAttack: null,
  pendingStatusClear: null,
  savedDefenseDice: null,
  fx: {
    floatDamage: { you: null, ai: null },
    shake: { you: false, ai: false },
  },
  initialRoll: {
    you: null,
    ai: null,
    inProgress: false,
    winner: null,
    tie: false,
    awaitingConfirmation: false,
  },
};

vi.mock("../../context/GameContext", () => ({
  useGame: () => ({ state: mockState, dispatch: mockDispatch }),
  GameContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

vi.mock("../../context/StatsContext", () => ({
  useStatsTracker: () => ({
    beginGame: vi.fn(),
    recordRoll: vi.fn(),
    recordTurn: vi.fn(),
    finalizeGame: vi.fn(),
    getSnapshot: vi.fn(),
    recordStatusSnapshot: vi.fn(() => ({})),
  }),
}));

const pushLog = vi.fn();
const animateDefenseDie = vi.fn<(cb: (roll: number) => void) => void>();
const restoreDiceAfterDefense = vi.fn();
const sendFlowEvent = vi.fn();
const resumePendingStatus = vi.fn();
const scheduleCallback = vi.fn<(duration: number, cb: () => void) => () => void>(
  (duration, cb) => {
    const handle = setTimeout(cb, duration);
    return () => clearTimeout(handle);
  }
);

const wrapHook = (pendingStatus: PendingStatusClear | null) => {
  mockState.pendingStatusClear = pendingStatus;
  return renderHook(() =>
    useStatusManager({
      pushLog,
      animateDefenseDie,
      restoreDiceAfterDefense,
      sendFlowEvent,
      resumePendingStatus,
      scheduleCallback,
    })
  );
};

const buildPending = (
  side: Side,
  stacks: number,
  rolling = false
): PendingStatusClear => ({
  side,
  status: "burn",
  stacks,
  rolling,
});

const buildTransferPending = (
  overrides: Partial<PendingStatusClear> = {}
): PendingStatusClear => ({
  side: "you",
  status: "burn",
  stacks: 2,
  action: "transfer",
  sourceStatus: "purify",
  targetSide: "ai",
  transferStacks: 1,
  consumeStacks: 1,
  rollThreshold: 4,
  rolling: false,
  ...overrides,
});

const findSetPlayer = (side: Side) => {
  const call = [...mockDispatch.mock.calls]
    .reverse()
    .find(
      ([action]) => action.type === "SET_PLAYER" && action.side === side
    );
  return call?.[0].player;
};

describe("useStatusManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockDispatch.mockReset();
    animateDefenseDie.mockImplementation((cb) => cb(6));
    mockState.players.you = { ...basePlayer, tokens: { burn: 2 } };
    mockState.pendingStatusClear = null;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("cleanses burn on success and logs result", () => {
    const { result } = wrapHook(buildPending("you", 2));

    act(() => {
      result.current.performStatusClearRoll("you");
      vi.runAllTimers();
    });

    const setPlayerAction = mockDispatch.mock.calls.find(
      ([action]) => action.type === "SET_PLAYER" && action.side === "you"
    );

    expect(restoreDiceAfterDefense).toHaveBeenCalled();
    expect(sendFlowEvent).toHaveBeenCalledWith({
      type: "SET_PHASE",
      phase: "roll",
    });
    expect(resumePendingStatus).toHaveBeenCalled();
    expect(pushLog).toHaveBeenCalledWith(
      expect.stringContaining("Burn cleanse")
    );
    expect(setPlayerAction).toBeTruthy();
    expect(setPlayerAction?.[0].player.tokens.burn ?? 0).toBe(0);
  });

  it("retains burn stacks on failed cleanse and logs failure", () => {
    animateDefenseDie.mockImplementationOnce((cb) => cb(1));
    const { result } = wrapHook(buildPending("you", 2));

    act(() => {
      result.current.performStatusClearRoll("you");
      vi.runAllTimers();
    });

    const setPlayerAction = mockDispatch.mock.calls.find(
      ([action]) => action.type === "SET_PLAYER" && action.side === "you"
    );

    expect(setPlayerAction).toBeTruthy();
    expect(setPlayerAction?.[0].player.tokens.burn ?? 0).toBe(2);
    expect(pushLog).toHaveBeenCalledWith(
      expect.stringContaining("failed")
    );
  });
  it("transfers burn to opponent on successful transfer roll", () => {
    mockState.players.you = {
      ...basePlayer,
      tokens: { burn: 2, purify: 1 },
    };
    mockState.players.ai = {
      ...basePlayer,
      hero: { ...basePlayer.hero, id: "ai", name: "AI" },
      tokens: {},
    };
    const { result } = wrapHook(buildTransferPending());

    act(() => {
      result.current.performStatusClearRoll("you");
      vi.runAllTimers();
    });

    const youPlayer = findSetPlayer("you");
    const aiPlayer = findSetPlayer("ai");

    expect(youPlayer?.tokens.burn ?? 0).toBe(1);
    expect(youPlayer?.tokens.purify ?? 0).toBe(0);
    expect(aiPlayer?.tokens.burn ?? 0).toBe(1);
    expect(pushLog).toHaveBeenCalled();
  });

  it("consumes purify stack on failed transfer", () => {
    mockState.players.you = {
      ...basePlayer,
      tokens: { burn: 2, purify: 1 },
    };
    mockState.players.ai = {
      ...basePlayer,
      hero: { ...basePlayer.hero, id: "ai", name: "AI" },
      tokens: {},
    };
    animateDefenseDie.mockImplementationOnce((cb) => cb(2));
    const { result } = wrapHook(buildTransferPending());

    act(() => {
      result.current.performStatusClearRoll("you");
      vi.runAllTimers();
    });

    const youPlayer = findSetPlayer("you");
    const aiPlayer = findSetPlayer("ai");

    expect(youPlayer?.tokens.burn ?? 0).toBe(2);
    expect(youPlayer?.tokens.purify ?? 0).toBe(0);
    expect(aiPlayer?.tokens.burn ?? 0).toBe(0);
  });

  it("falls back to cleanse when no transfer metadata is present", () => {
    mockState.players.you = {
      ...basePlayer,
      tokens: { burn: 2 },
    };
    const { result } = wrapHook(buildPending("you", 2));

    act(() => {
      result.current.performStatusClearRoll("you");
      vi.runAllTimers();
    });

    const youPlayer = findSetPlayer("you");
    const aiPlayer = findSetPlayer("ai");

    expect(youPlayer?.tokens.burn ?? 0).toBe(0);
    expect(aiPlayer).toBeUndefined();
  });

  it("merges transferred stacks with existing opponent stacks", () => {
    mockState.players.you = {
      ...basePlayer,
      tokens: { burn: 2, purify: 1 },
    };
    mockState.players.ai = {
      ...basePlayer,
      hero: { ...basePlayer.hero, id: "ai", name: "AI" },
      tokens: { burn: 1 },
    };
    const { result } = wrapHook(buildTransferPending());

    act(() => {
      result.current.performStatusClearRoll("you");
      vi.runAllTimers();
    });

    const aiPlayer = findSetPlayer("ai");
    expect(aiPlayer?.tokens.burn ?? 0).toBe(2);
  });

  it("caps transferred stacks at status maxStacks", () => {
    mockState.players.you = {
      ...basePlayer,
      tokens: { burn: 2, purify: 1 },
    };
    mockState.players.ai = {
      ...basePlayer,
      hero: { ...basePlayer.hero, id: "ai", name: "AI" },
      tokens: { burn: 3 },
    };
    const { result } = wrapHook(buildTransferPending());

    act(() => {
      result.current.performStatusClearRoll("you");
      vi.runAllTimers();
    });

    const aiPlayer = findSetPlayer("ai");
    expect(aiPlayer?.tokens.burn ?? 0).toBe(3);
  });
});
