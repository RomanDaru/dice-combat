import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { createInitialState, gameReducer } from "../state";
import { HEROES } from "../heroes";

describe("Initiative flow", () => {
  const originalRandom = Math.random;
  const originalSetTimeout = globalThis.setTimeout;

  beforeAll(() => {
    globalThis.setTimeout = ((cb: (...args: unknown[]) => void) =>
      cb()) as typeof setTimeout;
  });

  afterAll(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.Math.random = originalRandom;
  });

  it("resolves initiative for AI and waits for confirmation", () => {
    globalThis.Math.random = vi
      .fn()
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.9);

    let state = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );

    expect(state.phase).toBe("standoff");
    expect(state.turn).toBe("you");

    state = gameReducer(state, { type: "START_INITIAL_ROLL" });
    state = gameReducer(state, {
      type: "RESOLVE_INITIAL_ROLL",
      payload: { you: 2, ai: 6, winner: "ai" },
    });

    expect(state.turn).toBe("ai");
    expect(state.phase).toBe("standoff");
    expect(state.initialRoll.awaitingConfirmation).toBe(true);

    state = gameReducer(state, { type: "CONFIRM_INITIAL_ROLL" });

    expect(state.phase).toBe("upkeep");
    expect(state.turn).toBe("ai");
  });
});
