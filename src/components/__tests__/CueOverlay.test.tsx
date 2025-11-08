import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CueOverlay } from "../CueOverlay";
import type { ActiveCue } from "../../hooks/useTurnController";

const makeCue = (overrides: Partial<ActiveCue> = {}): ActiveCue => ({
  id: 1,
  kind: "status",
  title: "Status",
  durationMs: 1600,
  startedAt: Date.now(),
  endsAt: Date.now() + 1600,
  repeat: 1,
  ...overrides,
});

describe("CueOverlay", () => {
  it("uses polite aria-live for status cues", () => {
    render(<CueOverlay cue={makeCue({ kind: "status" })} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("uses assertive aria-live for attack cues and renders repeat badge", () => {
    render(<CueOverlay cue={makeCue({ kind: "attack", repeat: 3, title: "Strike" })} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("renders subtitle text when provided", () => {
    render(
      <CueOverlay
        cue={makeCue({
          subtitle: "Hero takes damage",
        })}
      />
    );
    expect(screen.getByText("Hero takes damage")).toBeVisible();
  });
});
