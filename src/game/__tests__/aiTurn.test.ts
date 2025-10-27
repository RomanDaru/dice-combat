import { describe, expect, it } from "vitest";
import { createInitialState } from "../state";
import { HEROES } from "../heroes";
import { resolveTurnStart } from "../flow";
import { bestAbility } from "../combos";
import { applyAttack } from "../engine";

describe("AI turn integration", () => {
  it("handles AI winning initiative and performing an attack", () => {
    let state = createInitialState(
      HEROES.Pyromancer,
      HEROES["Shadow Monk"]
    );

    // Simulate initiative result: AI starts first.
    state = {
      ...state,
      turn: "ai",
      phase: "upkeep",
    };

    const upkeepResult = resolveTurnStart(state, "ai");
    expect(upkeepResult.continueBattle).toBe(true);
    expect(upkeepResult.statusDamage).toBe(0);

    const aiAfterUpkeep = upkeepResult.updatedPlayer;
    const youBefore = state.players.you;

    // Force a strong dice roll for the AI.
    const forcedDice = [5, 5, 5, 5, 5];
    const ability = bestAbility(aiAfterUpkeep.hero, forcedDice);
    expect(ability).toBeTruthy();
    expect(ability?.combo).toBe("5OAK");

    const [aiAfterAttack, youAfterAttack, notes] = applyAttack(
      aiAfterUpkeep,
      youBefore,
      ability!
    );

    expect(youAfterAttack.hp).toBeLessThan(youBefore.hp);
    expect(notes.some((line) => line.includes("Hit for"))).toBe(true);

    // Verify AI state updated correctly.
    expect(aiAfterAttack.hero.id).toBe("Shadow Monk");
  });
});
