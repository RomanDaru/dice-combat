import { Phase } from "../game/types";

export default function TurnProgress({ phase }: { phase: Phase }) {
  const steps: { id: Phase; label: string }[] = [
    { id: "upkeep", label: "Upkeep" },
    { id: "roll", label: "Roll" },
    { id: "attack", label: "Attack" },
    { id: "defense", label: "Defense" },
    { id: "end", label: "End" },
  ];
  const normalizedPhase = phase === "turnTransition" ? "end" : phase;
  const activeIdx = Math.max(
    steps.findIndex((s) => s.id === normalizedPhase),
    0
  );

  return (
    <div className='turn-progress' role='list' aria-label='Turn progression'>
      {steps.map((step, idx) => {
        const status =
          idx === activeIdx ? "active" : idx < activeIdx ? "done" : "todo";
        return (
          <span
            key={step.id}
            className={`turn-step ${status}`}
            role='listitem'
            aria-label={step.label}
            aria-current={idx === activeIdx ? "step" : undefined}>
            <span className='turn-step-dot' />
            <span className='turn-step-label'>{step.label}</span>
          </span>
        );
      })}
    </div>
  );
}
