'use client';

import React from 'react';
import { Sparkles, Cpu, CheckCircle2, AlertTriangle, ShieldAlert, ArrowRight } from 'lucide-react';

export interface MLPredictionResult {
  mode: 'packaging' | 'loose_pill';
  device: string;
  prediction: string | null;
  confidence: number;
  top3: Array<{
    label: string;
    confidence: number;
  }>;
  inferenceMs: number;
}

interface PredictionCardProps {
  result: MLPredictionResult | null;
  loading: boolean;
  onApplyMedicine?: (medicineName: string) => void;
  onRetake?: () => void;
}

export function PredictionCard({
  result,
  loading,
  onApplyMedicine,
  onRetake,
}: PredictionCardProps) {
  if (loading) {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #FFF7F2 0%, #FFFFFF 100%)',
          border: '1.5px solid #FFD9C6',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: '3px solid #FFD9C6',
            borderTopColor: '#FF6115',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#FF6115' }}>
            Analyzing Image with Neural Network...
          </div>
          <div style={{ fontSize: '0.75rem', color: '#666666' }}>
            Running inference on NVIDIA GeForce RTX 4050 Laptop GPU (Ada Lovelace)
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const isConfident = result.confidence >= 0.50;
  const isHighConfidence = result.confidence >= 0.75;
  const confidencePercent = Math.round(result.confidence * 100);

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1.5px solid #FFE4D6',
        borderRadius: '12px',
        padding: '1.25rem',
        marginBottom: '1.25rem',
        boxShadow: '0 4px 16px rgba(255, 97, 21, 0.08)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '8px',
              background: '#FF6115',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
            }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.925rem', color: '#1A1A1A' }}>
              MediBand AI Vision Match
            </div>
            <div style={{ fontSize: '0.7rem', color: '#777777' }}>
              {result.mode === 'packaging'
                ? 'Task A: Packaging Classifier (53 Indian Brands)'
                : 'Task B: Loose Pill Classifier (26 Tablet Classes)'}
            </div>
          </div>
        </div>

        {/* Hardware badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: '#F4F5F7',
            padding: '3px 9px',
            borderRadius: '999px',
            fontSize: '0.7rem',
            color: '#4B5563',
            fontWeight: 600,
          }}
        >
          <Cpu size={12} color="#10B981" />
          <span>RTX 4050 GPU ({result.inferenceMs} ms)</span>
        </div>
      </div>

      {/* Main Top Match */}
      {isConfident && result.prediction ? (
        <div
          style={{
            background: isHighConfidence ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${isHighConfidence ? '#BBF7D0' : '#FDE68A'}`,
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} color={isHighConfidence ? '#16A34A' : '#D97706'} />
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1A1A1A' }}>
                {result.prediction}
              </span>
            </div>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: isHighConfidence ? '#166534' : '#92400E',
              }}
            >
              {confidencePercent}% match
            </span>
          </div>

          {/* Confidence Progress Bar */}
          <div
            style={{
              width: '100%',
              height: '8px',
              background: 'rgba(0,0,0,0.06)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '0.75rem',
            }}
          >
            <div
              style={{
                width: `${confidencePercent}%`,
                height: '100%',
                background: isHighConfidence
                  ? 'linear-gradient(90deg, #22C55E 0%, #16A34A 100%)'
                  : 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
                borderRadius: '999px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          {/* Action button */}
          {onApplyMedicine && (
            <button
              type="button"
              onClick={() => onApplyMedicine(result.prediction!)}
              className="btn btn-primary btn-sm"
              style={{
                width: '100%',
                fontSize: '0.8rem',
                padding: '6px 12px',
                justifyContent: 'center',
                background: '#FF6115',
              }}
            >
              Auto-Select {result.prediction} in Metadata <ArrowRight size={14} />
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <AlertTriangle size={18} color="#EF4444" />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#991B1B' }}>
              Low Confidence Match (Below 50% Threshold)
            </span>
          </div>
          <p style={{ fontSize: '0.775rem', color: '#B91C1C', margin: 0 }}>
            Visual patterns are ambiguous. Please verify medicine packaging text or GS1 barcode manually.
          </p>
        </div>
      )}

      {/* Top 3 Breakdown */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Top Alternative Predictions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {result.top3.map((cand, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: '#F9FAFB',
                borderRadius: '6px',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ fontWeight: 600, color: '#374151' }}>
                {idx + 1}. {cand.label}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: 70,
                    height: 5,
                    background: '#E5E7EB',
                    borderRadius: '999px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(cand.confidence * 100)}%`,
                      height: '100%',
                      background: '#FF6115',
                      borderRadius: '999px',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6B7280', minWidth: '32px', textAlign: 'right' }}>
                  {Math.round(cand.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mandatory Safety Disclosure Card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          background: '#FFF7ED',
          border: '1px solid #FFEDD5',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '0.725rem',
          color: '#9A3412',
          lineHeight: 1.4,
        }}
      >
        <ShieldAlert size={16} color="#EA580C" style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          <strong>Evidence Note:</strong> Visual classification is based on optical pattern matching.
          Always cross-check printed batch details, active ingredients, and consult a certified healthcare professional.
        </span>
      </div>
    </div>
  );
}
