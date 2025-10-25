import { Phase } from '../game/types';

export default function TurnProgress({ phase }: { phase: Phase }) {
  const steps: { id: Phase; label: string }[] = [
    { id: 'upkeep', label: 'Upkeep' },
    { id: 'roll', label: 'Roll' },
    { id: 'attack', label: 'Attack' },
    { id: 'defense', label: 'Defense' },
    { id: 'end', label: 'End' },
  ];
  const activeIdx = Math.max(steps.findIndex((s) => s.id === phase), 0);
  const fillWidth = `${((activeIdx + 1) / steps.length) * 100}%`;

  return (
    <div className="turn-progress">
      <div className="turn-progress-bar">
        <div className="turn-progress-bar-fill" style={{ width: fillWidth }} />
      </div>
      <div className="turn-progress-steps">
        {steps.map((step, idx) => {
          const status = idx === activeIdx ? 'active' : idx < activeIdx ? 'done' : 'todo';
          return (
            <div key={step.id} className={`turn-step ${status}`}>
              <span className="turn-step-dot" />
              <span className="turn-step-label">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
