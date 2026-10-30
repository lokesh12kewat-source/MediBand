'use client';

import { useState, useEffect } from 'react';
import { Download, RefreshCw, FileText, CheckCircle2, AlertTriangle, Eye, Trash2 } from 'lucide-react';
import { DatasetImageRecord } from '@/types';
import { downloadDatasetCSV } from '@/lib/dataset-manager';
import { getMedicineById } from '@/data/indian-medicines';

interface DatasetViewerProps {
  onRefreshTrigger?: number;
}

export default function DatasetViewer({ onRefreshTrigger }: DatasetViewerProps) {
  const [records, setRecords] = useState<DatasetImageRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<'all' | 'packaging' | 'loose_pill'>('all');

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dataset/save');
      const data = await res.json();
      if (data.success && Array.isArray(data.records)) {
        setRecords(data.records);
      }
    } catch (err) {
      console.warn('Failed to fetch dataset records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [onRefreshTrigger]);

  const packagingCount = records.filter(r => r.recognition_type === 'packaging').length;
  const loosePillCount = records.filter(r => r.recognition_type === 'loose_pill').length;

  const filteredRecords = records.filter(r => {
    if (filterType === 'all') return true;
    return r.recognition_type === filterType;
  });

  const handleExportCSV = () => {
    // Trigger download via API or client utility
    window.location.href = '/api/dataset/export';
  };

  return (
    <div className="card" style={{ padding: '1.5rem', background: '#FFFFFF', borderColor: '#E8E7E2', marginTop: '1.5rem' }}>
      {/* ── Dataset Header & Metrics ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
            Dataset Collection Repository
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--ink-secondary)', margin: '2px 0 0' }}>
            Structured repository stored in <code>MediBand_Dataset/</code> on disk.
          </p>
        </div>

        {/* CSV Export & Refresh Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={fetchRecords}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.8rem' }}
            title="Refresh records"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="btn btn-secondary btn-sm"
            style={{
              fontSize: '0.825rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            id="export-dataset-csv-btn"
          >
            <Download size={14} /> Export Dataset CSV
          </button>
        </div>
      </div>

      {/* ── Stats Summary Badges ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div
          onClick={() => setFilterType('all')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: filterType === 'all' ? 'var(--orange-pale)' : 'var(--porcelain)',
            border: `1px solid ${filterType === 'all' ? 'var(--orange)' : '#E8E7E2'}`,
            cursor: 'pointer',
            fontSize: '0.825rem',
          }}
        >
          <strong>All Records:</strong> {records.length}
        </div>

        <div
          onClick={() => setFilterType('packaging')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: filterType === 'packaging' ? 'var(--orange-pale)' : 'var(--porcelain)',
            border: `1px solid ${filterType === 'packaging' ? 'var(--orange)' : '#E8E7E2'}`,
            cursor: 'pointer',
            fontSize: '0.825rem',
          }}
        >
          <strong>📦 Packaging:</strong> {packagingCount}
        </div>

        <div
          onClick={() => setFilterType('loose_pill')}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: filterType === 'loose_pill' ? 'var(--orange-pale)' : 'var(--porcelain)',
            border: `1px solid ${filterType === 'loose_pill' ? 'var(--orange)' : '#E8E7E2'}`,
            cursor: 'pointer',
            fontSize: '0.825rem',
          }}
        >
          <strong>💊 Loose Pills:</strong> {loosePillCount}
        </div>
      </div>

      {/* ── Records Table / List ── */}
      {filteredRecords.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'var(--porcelain)', borderRadius: '8px', border: '1px dashed #D0CFC8' }}>
          <FileText size={28} color="#94A3B8" style={{ margin: '0 auto 0.5rem' }} />
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)' }}>No dataset records captured yet</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)', margin: '4px 0 0' }}>
            Use the camera or upload button above to capture medicine packaging or loose pills.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E8E7E2', textAlign: 'left', color: 'var(--ink-secondary)' }}>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Image ID</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>View</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Medicine Association</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Quality</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(r => {
                const med = r.medicine_id ? getMedicineById(r.medicine_id) : null;
                const isAcceptable = r.image_quality?.isAcceptable ?? true;

                return (
                  <tr key={r.image_id} style={{ borderBottom: '1px solid #F1F0EA' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>
                      {r.image_id}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          background: r.recognition_type === 'packaging' ? '#FFF0E8' : '#EFF6FF',
                          color: r.recognition_type === 'packaging' ? 'var(--orange-dark)' : '#1D4ED8',
                        }}
                      >
                        {r.recognition_type === 'packaging' ? '📦 Packaging' : '💊 Loose Pill'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--ink-secondary)' }}>
                      {r.image_view || 'unspecified'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {med ? (
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                          {med.brand_name} <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>({med.strength})</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}>Unlabeled / Unknown</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {isAcceptable ? (
                        <span style={{ color: '#16A34A', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} /> OK
                        </span>
                      ) : (
                        <span style={{ color: '#D97706', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title={r.image_quality?.warnings?.join(', ')}>
                          <AlertTriangle size={13} /> Warn
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--ink-muted)', fontSize: '0.75rem' }}>
                      {new Date(r.capture_timestamp).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
