import { Tokens } from '../game/types';

function DotRow({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} aria-label={`count ${count}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: 999, background: i < count ? '#fde047' : '#52525b' }} />
      ))}
    </div>
  );
}

export default function TokenChips({ tokens }: { tokens: Tokens }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {tokens.burn > 0 && (
        <div
          className="badge tooltip-anchor"
          data-tip={`Burn: loses ${tokens.burn * 2} HP at Upkeep (${tokens.burn} stack${tokens.burn === 1 ? '' : 's'}; max 1).`}
          aria-label={`Burn ${tokens.burn} stack${tokens.burn === 1 ? '' : 's'}`}
          style={{ background: 'rgba(127,29,29,.4)', border: '1px solid #b91c1c' }}
        >
          🔥 ×{tokens.burn}
        </div>
      )}
      {tokens.ignite > 0 && (
        <div
          className="badge tooltip-anchor"
          data-tip="Ignite: loses 1 HP at Upkeep, then expires."
          aria-label="Ignite 1"
          style={{ background: 'rgba(154,52,18,.3)', border: '1px solid #c2410c' }}
        >
          ✨ ×1
        </div>
      )}
      {tokens.chi > 0 && (
        <div
          className="badge tooltip-anchor"
          data-tip={`Chi: boosts Monk defense rolls (max 3). Current stacks: ${tokens.chi}.`}
          aria-label={`Chi ${tokens.chi}`}
          style={{ background: 'rgba(19,78,74,.35)', border: '1px solid #0f766e', display: 'flex', gap: 8, alignItems: 'center' }}
        >
          🟡 Chi <DotRow count={Math.min(tokens.chi, 3)} />
        </div>
      )}
      {tokens.evasive > 0 && (
        <div
          className="badge tooltip-anchor"
          data-tip="Evasive: spend to roll 5+ and dodge the attack."
          aria-label={`Evasive ${tokens.evasive}`}
          style={{ background: 'rgba(49,46,129,.35)', border: '1px solid #4338ca' }}
        >
          🌀 ×{tokens.evasive}
        </div>
      )}
    </div>
  );
}
