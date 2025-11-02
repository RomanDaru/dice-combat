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

const pushLog = vi.fn();
const animateDefenseDie = vi.fn<(cb: (roll: number) => void) => void>();
const restoreDiceAfterDefense = vi.fn();
const sendFlowEvent = vi.fn();
const resumePendingStatus = vi.fn();

const wrapHook = (pendingStatus: PendingStatusClear | null) => {
  mockState.pendingStatusClear = pendingStatus;
  return renderHook(() =>
    useStatusManager({
      pushLog,
      animateDefenseDie,
      restoreDiceAfterDefense,
      sendFlowEvent,
      resumePendingStatus,
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
});
