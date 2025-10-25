import React from 'react';

export default function Section({ title, children, active }: { title: string; children: React.ReactNode; active?: boolean }) {
  return (
    <div className={`card ${active ? 'ring-2 ring-emerald-500/40' : ''}`} style={{ borderColor: active ? '#059669' : undefined }}>
      <div className="label">{title}</div>
      {children}
    </div>
  );
}
