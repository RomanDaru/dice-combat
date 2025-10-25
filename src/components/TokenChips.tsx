import { Tokens } from "../game/types";

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

export default function TokenChips({ tokens }: { tokens: Tokens }) {
  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {tokens.burn > 0 && (
        <div
          className='badge tooltip-anchor'
          style={{
            ...chipStyle,
            background: "rgba(127,29,29,.4)",
            border: "1px solid #b91c1c",
          }}
          data-tip="Burn deals 2 damage, plus +1 for each extra stack (max 4), then decays by 1."
          aria-label={`Burn ${tokens.burn}`}>
          Burn ×{tokens.burn}
        </div>
      )}
      {tokens.chi > 0 && (
        <div
          className='badge tooltip-anchor'
          style={{
            ...chipStyle,
            background: "rgba(19,78,74,.35)",
            border: "1px solid #0f766e",
          }}
          data-tip="Chi upgrades Monk defense rolls (max 3)."
          aria-label={`Chi ${tokens.chi}`}>
          Chi <DotRow count={Math.min(tokens.chi, 3)} />
        </div>
      )}
      {tokens.evasive > 0 && (
        <div
          className='badge tooltip-anchor'
          style={{
            ...chipStyle,
            background: "rgba(49,46,129,.35)",
            border: "1px solid #4338ca",
          }}
          data-tip="Evasive: spend to roll 5+ and dodge the attack."
          aria-label={`Evasive ${tokens.evasive}`}>
          Evasive ×{tokens.evasive}
        </div>
      )}
    </div>
  );
}
