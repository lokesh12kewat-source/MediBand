'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  PlusCircle,
  Clock,
  Check,
  Calendar,
  Layers,
} from 'lucide-react';
import { INDIAN_MEDICINES } from '@/data/indian-medicines';
import { getMedications, addMedication, addPack } from '@/store/cabinet-store';
import { recordEvent } from '@/store/history-store';
import { extractIngredientIds, getMedicationIngredients } from '@/lib/ingredient-normalizer';
import { Medication, MedicationPack } from '@/types';

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
  // Cabinet & Action states
  const [conflicts, setConflicts] = useState<{
    ingredientName: string;
    conflictingMed: Medication;
  }[]>([]);
  const [showCabinetModal, setShowCabinetModal] = useState<boolean>(false);
  const [cabinetSaved, setCabinetSaved] = useState<boolean>(false);
  const [doseLogged, setDoseLogged] = useState<string | null>(null);

  // Form states for adding to cabinet
  const [batchNo, setBatchNo] = useState<string>('B' + Math.floor(100000 + Math.random() * 900000));
  const [expiryStr, setExpiryStr] = useState<string>('12/2027');
  const [quantity, setQuantity] = useState<number>(10);
  const [scheduleTime, setScheduleTime] = useState<string>('08:00');

  // Check for ingredient overlaps whenever result changes
  useEffect(() => {
    if (!result?.prediction) {
      setConflicts([]);
      return;
    }

    const matched = INDIAN_MEDICINES.find(
      m => m.brand_name.toLowerCase() === result.prediction!.toLowerCase()
    );

    if (!matched) {
      setConflicts([]);
      return;
    }

    const candidateIngIds = extractIngredientIds(matched.generic_name);
    const cabinetMeds = getMedications();
    const detectedConflicts: { ingredientName: string; conflictingMed: Medication }[] = [];

    for (const cabMed of cabinetMeds) {
      const cabIngIds = getMedicationIngredients(cabMed);
      for (const ingId of candidateIngIds) {
        if (cabIngIds.includes(ingId)) {
          detectedConflicts.push({
            ingredientName: matched.generic_name,
            conflictingMed: cabMed,
          });
          break;
        }
      }
    }

    setConflicts(detectedConflicts);
  }, [result]);

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

  const matchedMedicine = result.prediction
    ? INDIAN_MEDICINES.find(m => m.brand_name.toLowerCase() === result.prediction!.toLowerCase())
    : null;

  function handleSaveToCabinet() {
    if (!matchedMedicine) return;

    const medId = matchedMedicine.medicine_id;
    const medObj: Medication = {
      id: medId,
      brandName: matchedMedicine.brand_name,
      genericName: matchedMedicine.generic_name,
      strength: matchedMedicine.strength,
      dosageForm: matchedMedicine.dosage_form,
      manufacturer: matchedMedicine.manufacturer,
      activeIngredients: extractIngredientIds(matchedMedicine.generic_name),
    };

    const packId = `pack-${medId}-${Date.now().toString(36)}`;
    const packObj: MedicationPack = {
      id: packId,
      medicationId: medId,
      batchNumber: batchNo || 'UNSPECIFIED',
      expiryPrinted: expiryStr || '12/2027',
      quantity: { remaining: Number(quantity) || 10, unit: 'tablets' },
      verificationStatus: 'verified',
      openedAt: new Date().toISOString(),
      inUseExpiryDays: 365,
      notes: `Identified via MediBand AI Vision (${confidencePercent}% match)`,
    };

    addMedication(medObj);
    addPack(packObj);

    setCabinetSaved(true);
    setShowCabinetModal(false);
  }

  function handleLogDose() {
    if (!matchedMedicine) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    recordEvent(
      matchedMedicine.medicine_id,
      matchedMedicine.brand_name,
      matchedMedicine.strength,
      'TAKEN',
      'USER'
    );
    setDoseLogged(timeStr);
  }

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
                ? 'Task A: Packaging Model (53 Indian Brands)'
                : 'Task B: Loose Pill Model (26 Tablet Classes)'}
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

      {/* Main Top Match Box */}
      {isConfident && result.prediction ? (
        <div
          style={{
            background: isHighConfidence ? '#F0FDF4' : '#FFFBEB',
            border: `1.5px solid ${isHighConfidence ? '#BBF7D0' : '#FDE68A'}`,
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} color={isHighConfidence ? '#16A34A' : '#D97706'} />
              <div>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1A1A' }}>
                  {result.prediction}
                </span>
                {matchedMedicine && (
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#4B5563', fontWeight: 500 }}>
                    ({matchedMedicine.strength} · {matchedMedicine.dosage_form})
                  </span>
                )}
              </div>
            </div>
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 800,
                color: isHighConfidence ? '#166534' : '#92400E',
              }}
            >
              {confidencePercent}% match
            </span>
          </div>

          {matchedMedicine && (
            <div style={{ fontSize: '0.75rem', color: '#4B5563', marginBottom: '0.5rem' }}>
              <strong>Active Salt:</strong> {matchedMedicine.generic_name} · <strong>Mfr:</strong> {matchedMedicine.manufacturer}
            </div>
          )}

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

          {/* Clinical Conflict Banner (Active Ingredient Overlap) */}
          {conflicts.length > 0 && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1.5px solid #F87171',
                borderRadius: '8px',
                padding: '0.75rem',
                marginBottom: '0.75rem',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.775rem', color: '#991B1B', lineHeight: 1.4 }}>
                <strong style={{ display: 'block', fontSize: '0.825rem', marginBottom: '2px' }}>
                  Clinical Warning: Active Ingredient Overlap Detected!
                </strong>
                You already have <strong>{conflicts.map(c => c.conflictingMed.brandName).join(', ')}</strong> in your cabinet containing active ingredient <strong>{matchedMedicine?.generic_name}</strong>.
                Taking both concurrently may exceed recommended daily limits. Verify total intake before consuming.
              </div>
            </div>
          )}

          {/* Clinical Action Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {onApplyMedicine && (
              <button
                type="button"
                onClick={() => onApplyMedicine(result.prediction!)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', padding: '6px 10px', flex: 1 }}
              >
                Auto-Select in Metadata <ArrowRight size={13} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowCabinetModal(true)}
              className="btn btn-primary btn-sm"
              style={{
                fontSize: '0.75rem',
                padding: '6px 12px',
                background: '#FF6115',
                color: '#FFFFFF',
                flex: 1,
              }}
              disabled={cabinetSaved}
            >
              {cabinetSaved ? (
                <>
                  <Check size={14} /> Added to Cabinet
                </>
              ) : (
                <>
                  <PlusCircle size={14} /> Add to My Cabinet
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogDose}
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: '0.75rem',
                padding: '6px 10px',
                border: '1px solid #D1D5DB',
                background: doseLogged ? '#F0FDF4' : '#FFFFFF',
                color: doseLogged ? '#166534' : '#374151',
              }}
            >
              {doseLogged ? (
                <>
                  <Check size={13} color="#16A34A" /> Dose Logged at {doseLogged}
                </>
              ) : (
                <>
                  <Clock size={13} /> Log Dose Taken
                </>
              )}
            </button>
          </div>
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

      {/* Inline Modal for Cabinet Ingestion */}
      {showCabinetModal && matchedMedicine && (
        <div
          style={{
            background: '#FAF9F6',
            border: '1.5px solid #E5E7EB',
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1A1A1A', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={15} color="#FF6115" /> Add {matchedMedicine.brand_name} to Cabinet
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#4B5563', fontWeight: 600 }}>Batch No:</label>
              <input
                type="text"
                value={batchNo}
                onChange={e => setBatchNo(e.target.value)}
                style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#4B5563', fontWeight: 600 }}>Expiry (MM/YYYY):</label>
              <input
                type="text"
                value={expiryStr}
                onChange={e => setExpiryStr(e.target.value)}
                style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#4B5563', fontWeight: 600 }}>Pack Count:</label>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setShowCabinetModal(false)}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.75rem' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveToCabinet}
              className="btn btn-primary btn-sm"
              style={{ fontSize: '0.75rem', background: '#FF6115', color: '#FFFFFF' }}
            >
              Confirm & Save to Cabinet
            </button>
          </div>
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
