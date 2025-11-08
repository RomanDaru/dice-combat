import { describe, expect, it } from "vitest";
import { buildStatusPromptCue } from "../useTurnController";

describe("buildStatusPromptCue", () => {
  it("formats cleanse prompts with normal priority", () => {
    const cue = buildStatusPromptCue({
      statusName: "Burn",
      ownerName: "Pyromancer",
      stacks: 2,
    });
    expect(cue.title).toBe("Burn");
    expect(cue.subtitle).toBe("Pyromancer - 2 stacks");
    expect(cue.cta).toMatch(/resolve/i);
    expect(cue.priority).toBe("normal");
  });

  it("uses urgent priority and transfer CTA for transfer actions", () => {
    const cue = buildStatusPromptCue({
      statusName: "Burn",
      ownerName: "Pyromancer",
      stacks: 1,
      action: "transfer",
    });
    expect(cue.subtitle).toBe("Pyromancer - 1 stack");
    expect(cue.cta).toMatch(/transfer/i);
    expect(cue.priority).toBe("urgent");
  });
});
