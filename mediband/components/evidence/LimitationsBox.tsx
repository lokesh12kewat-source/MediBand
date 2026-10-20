'use client';

import { useState } from 'react';

export default function LimitationsBox({ limitations }: { limitations: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.625rem 0',
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--ink-muted)',
          width: '100%',
          textAlign: 'left',
        }}
        aria-expanded={expanded}
        id="limitations-toggle"
      >
        <span style={{ fontSize: '0.9rem' }}>ℹ</span>
        What this check cannot tell you
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {expanded && (
        <div className="limitation-box">
          {limitations.map((item, i) => (
            <div key={i} className="limitation-item">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
