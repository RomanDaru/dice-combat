import type { ReactNode } from "react";
import { getStacks, getStatus, type StatusId } from "../engine/status";
import type { Tokens } from "../game/types";

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
};

function DotRow({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div
      style={{ display: "flex", gap: 4 }}
      aria-label={`count ${count}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: i < count ? "#fde047" : "#52525b",
          }}
        />
      ))}
    </div>
  );
}

type ChipConfig = {
  id: StatusId;
  background: string;
  border: string;
  fallbackName: string;
  fallbackIcon: string;
  tooltip: string;
  renderContent?: (count: number) => ReactNode;
  showMultiplier?: boolean;
};

const CHIP_CONFIG: ChipConfig[] = [
  {
    id: "burn",
    background: "rgba(127,29,29,.4)",
    border: "1px solid #b91c1c",
    fallbackName: "Burn",
    fallbackIcon: "B",
    tooltip: "Burn deals damage each upkeep and then decays by 1.",
    showMultiplier: true,
  },
  {
    id: "chi",
    background: "rgba(19,78,74,.35)",
    border: "1px solid #0f766e",
    fallbackName: "Chi",
    fallbackIcon: "C",
    tooltip: "Chi adds block to defense rolls.",
    renderContent: (count: number) => <DotRow count={Math.min(count, 3)} />,
  },
  {
    id: "evasive",
    background: "rgba(49,46,129,.35)",
    border: "1px solid #4338ca",
    fallbackName: "Evasive",
    fallbackIcon: "E",
    tooltip: "Spend to roll 5+ and dodge an incoming attack.",
    showMultiplier: true,
  },
];

export default function TokenChips({ tokens }: { tokens: Tokens }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}>
      {CHIP_CONFIG.map((config) => {
        const count = getStacks(tokens, config.id, 0);
        if (count <= 0) return null;

        const definition = getStatus(config.id);
        const name = definition?.name ?? config.fallbackName;
        const icon = definition?.icon ?? config.fallbackIcon;

        return (
          <div
            key={config.id}
            className='badge tooltip-anchor'
            style={{
              ...chipStyle,
              background: config.background,
              border: config.border,
            }}
            data-tip={config.tooltip}
            aria-label={`${name} ${count}`}>
            {icon} {name}
            {config.showMultiplier ? ` \u00d7${count}` : null}
            {config.renderContent ? config.renderContent(count) : null}
          </div>
        );
      })}
    </div>
  );
}
