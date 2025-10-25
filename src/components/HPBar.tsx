export default function HPBar({ hp, max }: { hp: number; max: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
  const bg = pct > 50 ? '#059669' : pct > 25 ? '#f59e0b' : '#dc2626';
  return (
    <div>
      <div style={{ height: 12, background: 'rgba(39,39,42,.7)', borderRadius: 999, overflow: 'hidden', border: '1px solid #3f3f46' }}>
        <div style={{ height: '100%', width: pct + '%', background: bg }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#d4d4d8' }}>{hp} / {max} HP</div>
    </div>
  );
}
