import { Ability, Combo, Hero } from '../game/types';

export default function AbilityList({ hero, title, showReadyCombos }: { hero: Hero; title: string; showReadyCombos?: Record<Combo, boolean>; }) {
  return (
    <div className="card">
      <div className="label">{title}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {hero.abilities.map((a) => {
          const ready = showReadyCombos ? showReadyCombos[a.combo] : false;
          const effects: string[] = [];
          if (a.apply?.burn) effects.push(`🔥 Burn ×${a.apply.burn}`);
          if (a.apply?.ignite) effects.push(`✨ Ignite ×${a.apply.ignite}`);
          if (a.apply?.chi) effects.push(`🟡 Chi ×${a.apply.chi}`);
          if (a.apply?.evasive) effects.push(`🌀 Evasive ×${a.apply.evasive}`);
          return (
            <div key={a.combo} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 8px', borderRadius:8, border: `1px solid ${ready? '#6366f1' : '#27272a'}`, background: ready? 'rgba(30,27,75,.3)' : 'rgba(24,24,27,.4)'}}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className="badge" style={{ background: a.ultimate? '#6d28d9' : '#52525b' }}>{a.ultimate? 'ULT':'SK'}</span>
                <span>{a.label ?? a.combo}</span>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span className="num" style={{ color:'#e4e4e7' }}>{a.damage} dmg</span>
                {effects.length > 0 && <span style={{ color:'#a1a1aa', fontSize:12 }}>{effects.join(' · ')}</span>}
                {ready && <span className="badge indigo">READY</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
