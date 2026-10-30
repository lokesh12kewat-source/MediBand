'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ALL_SCENARIOS, getScenario } from '@/data/demo-scenarios';
import { DatasetImageRecord, DemoScenario } from '@/types';
import LiveScanner from '@/components/scan/LiveScanner';
import CameraCapture from '@/components/camera/CameraCapture';
import DatasetViewer from '@/components/camera/DatasetViewer';
import { Camera, QrCode } from 'lucide-react';

const STEPS = [
  'Capturing',
  'Reading code',
  'Reading text',
  'Comparing information',
  'Checking evidence',
  'Result ready',
];

function ScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'camera_dataset' | 'gs1_verification'>('camera_dataset');
  const [scanning, setScanning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario | null>(null);
  const [datasetRefreshKey, setDatasetRefreshKey] = useState<number>(0);

  useEffect(() => {
    const sid = searchParams.get('scenario');
    if (sid) {
      const scenario = getScenario(sid);
      if (scenario) {
        setSelectedScenario(scenario);
        setActiveTab('gs1_verification');
      }
    }
  }, [searchParams]);

  function handleCaptureComplete(_record: DatasetImageRecord) {
    setDatasetRefreshKey(prev => prev + 1);
  }

  function startScan(scenario: DemoScenario) {
    setSelectedScenario(scenario);
    setScanning(true);
    setCurrentStep(0);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < STEPS.length - 1) {
        setCurrentStep(step);
      } else {
        clearInterval(interval);
        setCurrentStep(STEPS.length - 1);
        setTimeout(() => {
          router.push(`/scan/result?scenario=${scenario.id}`);
        }, 400);
      }
    }, 450);
  }

  return (
    <div className="page-content" style={{ maxWidth: '960px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '0.25rem', fontSize: '1.75rem' }}>Medicine Identification & Dataset Collection</h1>
        <p style={{ fontSize: '0.875rem' }}>
          Capture packaging or loose pills for dataset collection, or verify GS1 code-print consistency.
        </p>

        {/* Primary Tab Switcher */}
        <div
          style={{
            display: 'inline-flex',
            background: '#F1F0EA',
            padding: '4px',
            borderRadius: '999px',
            marginTop: '1rem',
            border: '1px solid #E2E0D8',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('camera_dataset')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'camera_dataset' ? 700 : 500,
              color: activeTab === 'camera_dataset' ? '#FFFFFF' : '#4A5568',
              background: activeTab === 'camera_dataset' ? 'var(--orange)' : 'transparent',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Camera size={15} />
            Camera & Dataset Collector
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gs1_verification')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'gs1_verification' ? 700 : 500,
              color: activeTab === 'gs1_verification' ? '#FFFFFF' : '#4A5568',
              background: activeTab === 'gs1_verification' ? 'var(--orange)' : 'transparent',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <QrCode size={15} />
            GS1 & Demo Scenarios
          </button>
        </div>
      </div>

      {!scanning ? (
        activeTab === 'camera_dataset' ? (
          <div>
            {/* Live Camera & Dataset Module */}
            <CameraCapture onCaptureComplete={handleCaptureComplete} />

            {/* Structured Dataset Table & CSV Exporter */}
            <DatasetViewer onRefreshTrigger={datasetRefreshKey} />
          </div>
        ) : (
          <>
            {/* Scanner frame */}
            <div className="scan-frame" style={{ marginBottom: '2rem' }} aria-hidden="true">
              <div className="scan-corner scan-corner--tl" />
              <div className="scan-corner scan-corner--tr" />
              <div className="scan-corner scan-corner--bl" />
              <div className="scan-corner scan-corner--br" />
              <div className="scan-line" />
              <div style={{ textAlign: 'center', color: '#555' }}>
                <div style={{ fontSize: '0.75rem', color: '#555', letterSpacing: '0.05em' }}>
                  SELECT DEMO SCENARIO BELOW
                </div>
              </div>
            </div>

            {/* Demo scenarios */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-title">Demo scenarios</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {ALL_SCENARIOS.map(scenario => (
                  <button
                    key={scenario.id}
                    id={`scan-scenario-${scenario.id}`}
                    onClick={() => startScan(scenario)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.875rem',
                      padding: '0.875rem',
                      background: selectedScenario?.id === scenario.id ? 'var(--orange-pale)' : 'var(--surface-muted)',
                      border: `1px solid ${selectedScenario?.id === scenario.id ? 'var(--orange)' : 'var(--border)'}`,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    aria-label={`Run scenario ${scenario.id}: ${scenario.label}`}
                  >
                    <span className="scenario-badge" style={{ width: 28, height: 28, borderRadius: 6, fontSize: '0.8rem' }}>
                      {scenario.id}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '2px' }}>
                        {scenario.label}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                        {scenario.description}
                      </div>
                    </div>
                    <AssessmentChip assessment={scenario.expectedAssessment} />
                  </button>
                ))}
              </div>
            </div>

            {/* Live Scanner & Manual Entry */}
            <LiveScanner />
          </>
        )
      ) : (
        <ScanProgress currentStep={currentStep} />
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="page-content" style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--orange)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>Loading scanner…</p>
        </div>
      }
    >
      <ScanContent />
    </Suspense>
  );
}

function AssessmentChip({ assessment }: { assessment: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    STRONG_EVIDENCE:       { label: 'Strong', cls: 'badge-strong' },
    CONFLICT_DETECTED:     { label: 'Conflict', cls: 'badge-conflict' },
    INSUFFICIENT_EVIDENCE: { label: 'Insufficient', cls: 'badge-insufficient' },
    EXPIRED:               { label: 'Expired', cls: 'badge-expired' },
  };
  const { label, cls } = map[assessment] ?? { label: assessment, cls: 'badge-neutral' };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function ScanProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="card" style={{ maxWidth: 360, margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--orange-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
          <div style={{ width: 20, height: 20, border: '2.5px solid var(--orange)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Processing scan…</div>
        <div style={{ marginTop: '0.375rem' }}>
          <span className="demo-tag">Simulated processing — no camera used</span>
        </div>
      </div>
      <div className="step-list">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className={`step-item${i === currentStep ? ' active' : ''}${i < currentStep ? ' done' : ''}`}
          >
            <div className="step-dot" />
            <span style={{ fontSize: '0.875rem' }}>
              {i < currentStep ? '✓ ' : ''}{step}
            </span>
          </div>
        ))}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
