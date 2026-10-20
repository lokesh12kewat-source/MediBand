'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetCabinet } from '@/store/cabinet-store';
import { resetHistory } from '@/store/history-store';

const SCENARIOS = [
  { id: 'A', label: 'Strong Evidence', color: 'var(--status-strong)' },
  { id: 'B', label: 'Conflict Detected', color: 'var(--status-conflict)' },
  { id: 'C', label: 'Insufficient Evidence', color: 'var(--status-insufficient)' },
  { id: 'D', label: 'Expired', color: 'var(--status-expired)' },
];

export default function DemoDrawer() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleScenario(id: string) {
    setOpen(false);
    router.push(`/scan?scenario=${id}`);
  }

  function handleReset() {
    resetCabinet();
    resetHistory();
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="demo-drawer" role="complementary" aria-label="Demo controls">
      {open && (
        <div className="demo-drawer-panel">
          <div className="demo-drawer-title">Demo Controls</div>
          <div className="demo-btn-group">
            {SCENARIOS.map(s => (
              <button
                key={s.id}
                className="demo-scenario-btn"
                onClick={() => handleScenario(s.id)}
                id={`demo-scenario-${s.id}`}
                aria-label={`Load scenario ${s.id}: ${s.label}`}
              >
                <span className="scenario-badge">{s.id}</span>
                <span>{s.label}</span>
              </button>
            ))}
            <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }} />
            <button className="demo-scenario-btn" onClick={handleReset} id="demo-reset" aria-label="Reset all demo data">
              <span style={{ fontSize: '0.9rem' }}>↺</span>
              <span>Reset Demo Data</span>
            </button>
          </div>
        </div>
      )}
      <button
        className="demo-drawer-toggle"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close demo controls' : 'Open demo controls'}
        aria-expanded={open}
        id="demo-drawer-toggle"
      >
        {open ? '✕' : '⚡'}
      </button>
    </div>
  );
}
