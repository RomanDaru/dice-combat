export default function DamageOverlay({ val, kind }: { val: number; kind: 'hit'|'reflect' }) {
  return (
    <div className="dmg-pop" style={{ fontSize: 36, fontWeight: 900, color: kind==='hit' ? '#ef4444' : '#2dd4bf' }}>
      -{val}
    </div>
  );
}
