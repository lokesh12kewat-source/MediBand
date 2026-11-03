'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  FileText,
  ScanText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { INDIAN_MEDICINES } from '@/data/indian-medicines';
import { getMedications, addMedication, addPack } from '@/store/cabinet-store';
import { recordEvent } from '@/store/history-store';
import { extractIngredientIds, getMedicationIngredients } from '@/lib/ingredient-normalizer';
import { Medication, MedicationPack } from '@/types';
import { ExtractedFoilInfo, resolveMedicineIdentity, MultiModalDecision } from '@/lib/ocr-engine';

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
  rawLogits?: number[];
  calibratedProbabilities?: number[];
}

interface PredictionCardProps {
  result: MLPredictionResult | null;
  loading: boolean;
  ocrResult?: ExtractedFoilInfo | null;
  ocrLoading?: boolean;
  onApplyMedicine?: (medicineName: string) => void;
  onRetake?: () => void;
}

export function PredictionCard({
  result,
  loading,
  ocrResult,
  ocrLoading,
  onApplyMedicine,
  onRetake,
}: PredictionCardProps) {
  // OCR & Decision details toggle
  const [showOcrDetails, setShowOcrDetails] = useState<boolean>(false);

  // Cabinet & Action states
  const [conflicts, setConflicts] = useState<{
    ingredientName: string;
    conflictingMed: Medication;
  }[]>([]);
  const [showCabinetModal, setShowCabinetModal] = useState<boolean>(false);
  const [cabinetSaved, setCabinetSaved] = useState<boolean>(false);
  const [doseLogged, setDoseLogged] = useState<string | null>(null);

  // Multi-Modal Decision Fusion (Vision + OCR)
  const decision: MultiModalDecision = useMemo(() => {
    return resolveMedicineIdentity(result, ocrResult || null);
  }, [result, ocrResult]);

  // Form states for adding to cabinet (auto-prefilled from OCR when available)
  const [batchNo, setBatchNo] = useState<string>('B' + Math.floor(100000 + Math.random() * 900000));
  const [expiryStr, setExpiryStr] = useState<string>('12/2027');
  const [quantity, setQuantity] = useState<number>(10);
  const [scheduleTime, setScheduleTime] = useState<string>('08:00');

  // Update batch/expiry if OCR detects them
  useEffect(() => {
    if (decision.batchNumber) {
      setBatchNo(decision.batchNumber);
    }
    if (decision.expiryDate) {
      setExpiryStr(decision.expiryDate);
    }
  }, [decision]);

  // Check for ingredient overlaps whenever decision/result changes
  useEffect(() => {
    const activeGeneric = decision.resolvedGeneric || '';
    if (!activeGeneric || activeGeneric === 'Unknown Composition') {
      setConflicts([]);
      return;
    }

    const candidateIngIds = extractIngredientIds(activeGeneric);
    const cabinetMeds = getMedications();
    const detectedConflicts: { ingredientName: string; conflictingMed: Medication }[] = [];

    for (const cabMed of cabinetMeds) {
      const cabIngIds = getMedicationIngredients(cabMed);
      for (const ingId of candidateIngIds) {
        if (cabIngIds.includes(ingId)) {
          detectedConflicts.push({
            ingredientName: activeGeneric,
            conflictingMed: cabMed,
          });
          break;
        }
      }
    }

    setConflicts(detectedConflicts);
  }, [decision]);

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

  const isConfident = result.confidence >= 0.50 || decision.resolutionSource === 'OCR_OVERRIDE';
  const effectiveConfidence = decision.resolutionSource === 'OCR_OVERRIDE' ? decision.confidence : result.confidence;
  const isHighConfidence = effectiveConfidence >= 0.75;
  const confidencePercent = Math.round(effectiveConfidence * 100);

  const activeMedicineName =
    decision.resolutionSource === 'OCR_OVERRIDE'
      ? decision.resolvedBrand
      : (result?.prediction || decision.resolvedBrand);

  const matchedMedicine = activeMedicineName
    ? (INDIAN_MEDICINES.find(m => m.brand_name.toLowerCase() === activeMedicineName.toLowerCase()) ||
       INDIAN_MEDICINES.find(m => m.generic_name.toLowerCase().includes(activeMedicineName.toLowerCase())))
    : null;

  function handleSaveToCabinet() {
    const medId = matchedMedicine?.medicine_id || `med_${activeMedicineName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const brand = matchedMedicine?.brand_name || activeMedicineName;
    const generic = matchedMedicine?.generic_name || decision.resolvedGeneric;
    const strengthVal = matchedMedicine?.strength || decision.resolvedStrength || 'As printed';
    const dosage = matchedMedicine?.dosage_form || 'Tablet';
    const mfr = matchedMedicine?.manufacturer || ocrResult?.manufacturer || 'Vivek Pharmaceuticals Pvt. Ltd.';

    const ingIds = extractIngredientIds(generic);
    const medObj: Medication = {
      id: medId,
      brandName: brand,
      genericName: generic,
      strength: strengthVal,
      dosageForm: dosage,
      manufacturer: mfr,
      activeIngredientId: ingIds[0] || 'ING_UNKNOWN',
      activeIngredients: ingIds,
    };

    const packId = `pack-${medId}-${Date.now().toString(36)}`;
    const packObj: MedicationPack = {
      id: packId,
      medicationId: medId,
      gtin: matchedMedicine?.product_identifier || '00000000000000',
      batchPrinted: batchNo || decision.batchNumber || 'UNSPECIFIED',
      batchEncoded: batchNo || decision.batchNumber || 'UNSPECIFIED',
      expiryPrinted: expiryStr || decision.expiryDate || '12/2027',
      expiryEncoded: expiryStr || decision.expiryDate || '12/2027',
      addedAt: new Date().toISOString(),
      quantity: { remaining: Number(quantity) || 10, unit: 'tablets' },
      openedAt: new Date().toISOString(),
      inUseExpiryDays: 365,
      notes:
        decision.resolutionSource === 'OCR_OVERRIDE'
          ? `Verified via Printed Text OCR (Foil Extraction: ${decision.resolvedBrand})`
          : `Identified via MediBand AI Vision (${confidencePercent}% match)`,
    };

    addMedication(medObj);
    addPack(packObj);

    setCabinetSaved(true);
    setShowCabinetModal(false);
  }

  function handleLogDose() {
    const medId = matchedMedicine?.medicine_id || `med_${activeMedicineName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const brand = matchedMedicine?.brand_name || activeMedicineName;
    const strengthVal = matchedMedicine?.strength || decision.resolvedStrength || 'As printed';
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    recordEvent(
      medId,
      brand,
      strengthVal,
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
          <Cpu size={12} color={result.device?.includes('WebAssembly') ? '#2563EB' : '#10B981'} />
          <span>
            {result.device?.includes('WebAssembly')
              ? 'Browser WASM'
              : result.device?.includes('cuda') || result.device?.includes('RTX')
              ? 'RTX 4050 GPU'
              : result.device || 'AI Engine'}{' '}
            ({result.inferenceMs} ms)
          </span>
        </div>
      </div>

      {/* Multi-Modal Discrepancy & OCR Override Banner */}
      {decision.discrepancyDetected && decision.resolutionSource === 'OCR_OVERRIDE' && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1.5px solid #BFDBFE',
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <ScanText size={20} color="#2563EB" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#1E40AF' }}>
                🔍 Foil Text Verification (OCR Override)
              </div>
              <div style={{ fontSize: '0.8rem', color: '#1E3A8A', marginTop: '3px', lineHeight: 1.45 }}>
                {decision.explanation}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Top Match Box (Resolved via Decision Fusion) */}
      {(decision.resolutionSource === 'OCR_OVERRIDE' || (isConfident && result.prediction)) ? (
        <div
          style={{
            background:
              decision.resolutionSource === 'OCR_OVERRIDE'
                ? '#F0F9FF'
                : isHighConfidence
                ? '#F0FDF4'
                : '#FFFBEB',
            border: `1.5px solid ${
              decision.resolutionSource === 'OCR_OVERRIDE'
                ? '#BAE6FD'
                : isHighConfidence
                ? '#BBF7D0'
                : '#FDE68A'
            }`,
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2
                size={18}
                color={
                  decision.resolutionSource === 'OCR_OVERRIDE'
                    ? '#0284C7'
                    : isHighConfidence
                    ? '#16A34A'
                    : '#D97706'
                }
              />
              <div>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1A1A' }}>
                  {decision.resolvedBrand}
                </span>
                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#4B5563', fontWeight: 500 }}>
                  ({decision.resolvedStrength} · {matchedMedicine?.dosage_form || 'Tablet'})
                </span>
              </div>
            </div>
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 800,
                color:
                  decision.resolutionSource === 'OCR_OVERRIDE'
                    ? '#0369A1'
                    : isHighConfidence
                    ? '#166534'
                    : '#92400E',
              }}
            >
              {decision.resolutionSource === 'OCR_OVERRIDE'
                ? `OCR Verified · ${confidencePercent}% match`
                : `${confidencePercent}% match`}
            </span>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#4B5563', marginBottom: '0.5rem' }}>
            <strong>Active Salt:</strong> {decision.resolvedGeneric} ·{' '}
            <strong>Mfr:</strong>{' '}
            {decision.resolutionSource === 'OCR_OVERRIDE' && ocrResult?.manufacturer
              ? ocrResult.manufacturer
              : matchedMedicine?.manufacturer || ocrResult?.manufacturer || 'Vivek Pharmaceuticals Pvt. Ltd.'}
          </div>

          {/* Special Notices (e.g. Government Supply, Schedule H) */}
          {ocrResult?.notices && ocrResult.notices.length > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              {ocrResult.notices.map((n, i) => (
                <span
                  key={i}
                  style={{
                    background: '#FEE2E2',
                    color: '#991B1B',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                  }}
                >
                  {n}
                </span>
              ))}
            </div>
          )}

          {/* Printed Batch & Expiry Stamp */}
          {(decision.batchNumber || decision.expiryDate) && (
            <div
              style={{
                fontSize: '0.75rem',
                color: '#1E3A8A',
                background: '#E0F2FE',
                padding: '4px 8px',
                borderRadius: '6px',
                marginBottom: '0.75rem',
                display: 'inline-flex',
                gap: '12px',
                fontWeight: 600,
              }}
            >
              {decision.batchNumber && <span>B.No: {decision.batchNumber}</span>}
              {decision.expiryDate && <span>EXP: {decision.expiryDate}</span>}
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
                background:
                  decision.resolutionSource === 'OCR_OVERRIDE'
                    ? 'linear-gradient(90deg, #0284C7 0%, #059669 100%)'
                    : isHighConfidence
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
                You already have <strong>{conflicts.map(c => c.conflictingMed.brandName).join(', ')}</strong> in your cabinet containing active ingredient <strong>{decision.resolvedGeneric}</strong>.
                Taking both concurrently may exceed recommended daily limits. Verify total intake before consuming.
              </div>
            </div>
          )}

          {/* Clinical Action Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {onApplyMedicine && (
              <button
                type="button"
                onClick={() => onApplyMedicine(decision.resolvedBrand)}
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

      {/* OCR Extracted Text Inspector Drawer */}
      {ocrResult && ocrResult.rawText && (
        <div
          style={{
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            marginBottom: '1rem',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => setShowOcrDetails(prev => !prev)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: '#F9FAFB',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.775rem',
              fontWeight: 600,
              color: '#374151',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ScanText size={15} color="#4F46E5" />
              <span>Extracted Printed Text from Foil (Optical Character Recognition)</span>
            </div>
            {showOcrDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showOcrDetails && (
            <div style={{ padding: '12px', background: '#FFFFFF', fontSize: '0.775rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <div><strong>Detected Drug:</strong> {ocrResult.detectedDrug || '—'}</div>
                <div><strong>Strength:</strong> {ocrResult.strength || '—'}</div>
                <div><strong>Batch Number:</strong> {ocrResult.batchNumber || '—'}</div>
                <div><strong>Expiry Date:</strong> {ocrResult.expiryDate || '—'}</div>
                <div><strong>Mfg Date:</strong> {ocrResult.mfgDate || '—'}</div>
                <div><strong>Manufacturer:</strong> {ocrResult.manufacturer || '—'}</div>
              </div>

              <details style={{ marginTop: '6px' }}>
                <summary style={{ cursor: 'pointer', color: '#6B7280', fontSize: '0.725rem' }}>
                  View raw OCR text output
                </summary>
                <pre
                  style={{
                    background: '#F3F4F6',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '120px',
                    overflowY: 'auto',
                    marginTop: '4px',
                    border: '1px solid #E5E7EB',
                  }}
                >
                  {ocrResult.rawText}
                </pre>
              </details>
            </div>
          )}
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
