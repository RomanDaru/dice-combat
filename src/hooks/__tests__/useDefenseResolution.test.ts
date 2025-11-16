import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDefenseResolution } from "../useDefenseResolution";
import type { GameState } from "../../game/state";
import type { PlayerState } from "../../game/types";

const basePlayer: PlayerState = {
  hero: {
    id: "test",
    name: "Tester",
    maxHp: 30,
    offensiveBoard: {},
    defensiveBoard: {},
    ai: { chooseHeld: () => [false, false, false, false, false] },
  },
  hp: 20,
  tokens: {},
};

const mockGameState: GameState = {
  log: [],
  rngSeed: 1,
  players: {
    you: { ...basePlayer },
    ai: {
      ...basePlayer,
      hero: { ...basePlayer.hero, id: "ai", name: "AI" },
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

const noop = () => {};

const createHook = () => {
  const enqueueCue = vi.fn();
  const args = {
    enqueueCue,
    interruptCue: vi.fn(),
    scheduleCallback: vi.fn<(duration: number, cb: () => void) => () => void>(
      (_duration, cb) => {
        cb();
        return noop;
      }
    ),
    setPhase: vi.fn(),
    restoreDiceAfterDefense: vi.fn(),
    handleFlowEvent: vi.fn(),
    aiPlay: vi.fn(),
    aiStepDelay: 500,
    latestState: { current: mockGameState },
    popDamage: vi.fn(),
    pushLog: vi.fn(),
    setPlayer: vi.fn(),
    triggerDefenseBuffs: vi.fn(),
  };

  const { result } = renderHook(() => useDefenseResolution(args));
  return { handler: result.current.resolveDefenseWithEvents, enqueueCue, args };
};

describe("useDefenseResolution - defense summary cue", () => {
  it("emits defenseSummary cue with stats for a standard block scenario", () => {
    const { handler, enqueueCue } = createHook();
    const resolution = {
      updatedAttacker: basePlayer,
      updatedDefender: basePlayer,
      logs: [],
      fx: [],
      summary: {
        damageDealt: 2,
        blocked: 5,
        reflected: 1,
        negated: false,
        attackerDefeated: false,
        defenderDefeated: false,
      },
      events: [],
      nextPhase: "roll",
    } as any;

    handler(resolution, {
      attackerSide: "ai",
      defenderSide: "you",
      attackerName: "Shadow Monk",
      defenderName: "Pyromancer",
      abilityName: "Moon Slash",
      defenseAbilityName: "Flame Ward",
    });

    expect(enqueueCue).toHaveBeenCalledTimes(1);
    const payload = enqueueCue.mock.calls[0][0];
    expect(payload.kind).toBe("defenseSummary");
    expect(payload.title).toMatch(/Damage/i);
    expect(payload.subtitle).toMatch(/Blocked 5/i);
    expect(payload.subtitle).toMatch(/Damage 2/i);
    expect(payload.subtitle).toMatch(/Reflect 1/i);
    expect(payload.cta).toMatch(/Moon Slash/);
    expect(payload.priority).toBe("urgent");
    expect(payload.side).toBe("you");
  });

  it("marks cue as urgent and allows transition when lethal occurs", () => {
    const { handler, enqueueCue } = createHook();
    const resolution = {
      updatedAttacker: basePlayer,
      updatedDefender: basePlayer,
      logs: [],
      fx: [],
      summary: {
        damageDealt: 8,
        blocked: 0,
        reflected: 0,
        negated: false,
        attackerDefeated: false,
        defenderDefeated: true,
      },
      events: [],
      nextPhase: "roll",
    } as any;

    handler(resolution, {
      attackerSide: "ai",
      defenderSide: "you",
      attackerName: "Shadow Monk",
      defenderName: "Pyromancer",
      abilityName: "Moon Slash",
      defenseAbilityName: "Flame Ward",
    });

    const payload = enqueueCue.mock.calls[0][0];
    expect(payload.kind).toBe("defenseSummary");
    expect(payload.priority).toBe("urgent");
    expect(payload.allowDuringTransition).toBe(true);
    expect(payload.title).toMatch(/You Fall/i);
  });

  it("fires defense buff triggers after resolution commits", () => {
    const { handler, args } = createHook();
    const resolution = {
      updatedAttacker: basePlayer,
      updatedDefender: basePlayer,
      logs: [],
      fx: [],
      events: [],
      nextPhase: "roll",
    } as any;

    handler(resolution, {
      attackerSide: "ai",
      defenderSide: "you",
      attackerName: "Shadow Monk",
      defenderName: "Pyromancer",
      abilityName: "Moon Slash",
    });

    expect(args.triggerDefenseBuffs).toHaveBeenCalledTimes(2);
    expect(args.triggerDefenseBuffs).toHaveBeenNthCalledWith(
      1,
      "nextDefenseCommit",
      "you"
    );
    expect(args.triggerDefenseBuffs).toHaveBeenNthCalledWith(
      2,
      "postDamageApply",
      "you"
    );
  });
});
