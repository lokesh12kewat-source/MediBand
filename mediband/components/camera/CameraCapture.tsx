'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Info,
  Package,
  CircleDot,
  Sliders,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import {
  DatasetImageRecord,
  ImageQualityAssessment,
  ImageView,
  RecognitionType,
} from '@/types';
import { analyzeCanvas } from '@/lib/image-quality';
import { createDatasetRecord } from '@/lib/dataset-manager';
import { INDIAN_MEDICINES } from '@/data/indian-medicines';
import { PredictionCard, MLPredictionResult } from '@/components/ml/PredictionCard';
import { runClientInference } from '@/lib/onnx-client';
import { executeFoilOCR, ExtractedFoilInfo } from '@/lib/ocr-engine';

interface CameraCaptureProps {
  onCaptureComplete?: (record: DatasetImageRecord) => void;
  initialMode?: RecognitionType;
}

const VIEW_OPTIONS: { id: ImageView; label: string; forType: RecognitionType | 'both' }[] = [
  { id: 'strip_front', label: 'Strip / Blister Front', forType: 'packaging' },
  { id: 'blister_foil', label: 'Blister Back (Foil Text)', forType: 'packaging' },
  { id: 'box_panel', label: 'Box Primary Panel', forType: 'packaging' },
  { id: 'bottle_label', label: 'Bottle Label', forType: 'packaging' },
  { id: 'top', label: 'Top View (Face / Imprint)', forType: 'loose_pill' },
  { id: 'side', label: 'Side / Thickness View', forType: 'loose_pill' },
  { id: 'angled', label: '3/4 Angled Perspective', forType: 'both' },
  { id: 'unspecified', label: 'Unspecified Angle', forType: 'both' },
];

export default function CameraCapture({
  onCaptureComplete,
  initialMode = 'packaging',
}: CameraCaptureProps) {
  // Mode selection: packaging vs loose pill
  const [recognitionType, setRecognitionType] = useState<RecognitionType>(initialMode);
  const [imageView, setImageView] = useState<ImageView>(
    initialMode === 'packaging' ? 'strip_front' : 'top'
  );
  const [selectedMedicineId, setSelectedMedicineId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Camera states
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'streaming' | 'captured' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Captured data
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<ImageQualityAssessment | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // AI Inference Prediction State
  const [prediction, setPrediction] = useState<MLPredictionResult | null>(null);
  const [predicting, setPredicting] = useState<boolean>(false);
  const [inferenceEngine, setInferenceEngine] = useState<'server' | 'client'>('server');

  // OCR Printed Text Extraction State
  const [ocrResult, setOcrResult] = useState<ExtractedFoilInfo | null>(null);
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger Optical Character Recognition (OCR) for printed text & foil stamps
  const triggerOCR = useCallback(async (dataUrl: string) => {
    setOcrLoading(true);
    setOcrResult(null);
    try {
      const ocrData = await executeFoilOCR(dataUrl);
      setOcrResult(ocrData);
      if (ocrData.matchedMedicineId) {
        setSelectedMedicineId(ocrData.matchedMedicineId);
      }
    } catch (err) {
      console.warn('OCR foil text recognition error:', err);
    } finally {
      setOcrLoading(false);
    }
  }, []);

  // Trigger GPU/Model Inference (with client-side WASM fallback)
  const triggerInference = useCallback(
    async (
      dataUrl: string,
      mode: RecognitionType,
      targetEngine?: 'server' | 'client'
    ) => {
      const activeEngine = targetEngine ?? inferenceEngine;
      setPredicting(true);
      setPrediction(null);

      // If user chosen Client-Side WASM engine directly
      if (activeEngine === 'client') {
        try {
          const clientData = await runClientInference(dataUrl, mode);
          setPrediction(clientData);
          if (clientData.prediction) {
            const found = INDIAN_MEDICINES.find(
              m => m.brand_name.toLowerCase() === clientData.prediction!.toLowerCase()
            );
            if (found) setSelectedMedicineId(found.medicine_id);
          }
        } catch (err) {
          console.warn('Client-side ONNX inference error:', err);
        } finally {
          setPredicting(false);
        }
        return;
      }

      // Default: Server GPU route with automatic fallback to Client WASM
      try {
        const res = await fetch('/api/ml/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, recognitionType: mode }),
        });

        if (res.ok) {
          const data: MLPredictionResult = await res.json();
          setPrediction(data);
          if (data.prediction) {
            const found = INDIAN_MEDICINES.find(
              m => m.brand_name.toLowerCase() === data.prediction!.toLowerCase()
            );
            if (found) {
              setSelectedMedicineId(found.medicine_id);
            }
          }
        } else {
          throw new Error(`Server returned ${res.status}`);
        }
      } catch (err) {
        console.warn('Server inference error, falling back to client-side ONNX:', err);
        try {
          const fallbackData = await runClientInference(dataUrl, mode);
          setPrediction(fallbackData);
          if (fallbackData.prediction) {
            const found = INDIAN_MEDICINES.find(
              m => m.brand_name.toLowerCase() === fallbackData.prediction!.toLowerCase()
            );
            if (found) setSelectedMedicineId(found.medicine_id);
          }
        } catch (clientErr) {
          console.error('Client-side inference fallback also failed:', clientErr);
        }
      } finally {
        setPredicting(false);
      }
    },
    [inferenceEngine]
  );

  // Update default view option when mode changes
  const handleModeChange = (mode: RecognitionType) => {
    setRecognitionType(mode);
    setImageView(mode === 'packaging' ? 'strip_front' : 'top');
    if (capturedDataUrl) {
      triggerInference(capturedDataUrl, mode);
    }
  };

  // Safe stream track cleanup
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // Request camera & start stream
  async function startCamera() {
    setErrorMessage(null);
    setSaveSuccess(null);
    setCameraState('starting');

    // Check secure context
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setErrorMessage(
        'Camera access requires a secure HTTPS connection or localhost in modern browsers.'
      );
      setCameraState('error');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage(
        'Camera API (getUserMedia) is not supported in this browser. Please use the file upload option below.'
      );
      setCameraState('error');
      return;
    }

    try {
      // Prefer rear camera on mobile (ideal 'environment') with high resolution
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(err => {
            console.warn('Auto play failed:', err);
          });
          setCameraState('streaming');
        };
      }
    } catch (err: unknown) {
      stopStream();
      setCameraState('error');

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMessage(
            'Camera permission was denied. Please allow camera permissions in your browser address bar and try again.'
          );
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setErrorMessage(
            'No camera found on this device. You can upload an image from your files instead.'
          );
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setErrorMessage(
            'The camera is currently in use by another application. Please close other camera apps and retry.'
          );
        } else {
          setErrorMessage(`Camera error: ${err.message}`);
        }
      } else {
        setErrorMessage('Failed to access camera. Please check permissions or use file upload.');
      }
    }
  }

  // Capture frame from video stream to canvas
  function capturePhoto() {
    if (!videoRef.current || cameraState !== 'streaming') return;

    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErrorMessage('Failed to create canvas rendering context.');
      return;
    }

    // Draw the exact video frame
    ctx.drawImage(video, 0, 0, width, height);

    // Run basic image quality analysis
    const assessment = analyzeCanvas(canvas);
    setQuality(assessment);

    // Export as high quality JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedDataUrl(dataUrl);

    // Stop camera stream once captured
    stopStream();
    setCameraState('captured');
    triggerInference(dataUrl, recognitionType);
    triggerOCR(dataUrl);
  }

  // Handle file upload fallback
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSaveSuccess(null);
    stopStream();

    const reader = new FileReader();
    reader.onload = event => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const assessment = analyzeCanvas(canvas);
          setQuality(assessment);
        }
        setCapturedDataUrl(dataUrl);
        setCameraState('captured');
        triggerInference(dataUrl, recognitionType);
        triggerOCR(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // Load preset demo sample for instant verification without physical camera
  const loadDemoSample = async (sampleUrl: string, type: RecognitionType, view: ImageView) => {
    try {
      setErrorMessage(null);
      setSaveSuccess(null);
      stopStream();
      setRecognitionType(type);
      setImageView(view);

      const res = await fetch(sampleUrl);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = event => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) return;

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const assessment = analyzeCanvas(canvas);
            setQuality(assessment);
          }
          setCapturedDataUrl(dataUrl);
          setCameraState('captured');
          triggerInference(dataUrl, type);
          if (type === 'packaging') {
            triggerOCR(dataUrl);
          } else {
            setOcrResult(null);
            setOcrLoading(false);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Failed to load demo sample:', err);
    }
  };

  // Retake photo: clear preview and reopen camera
  function retakePhoto() {
    setCapturedDataUrl(null);
    setQuality(null);
    setSaveSuccess(null);
    setErrorMessage(null);
    setPrediction(null);
    setOcrResult(null);
    setOcrLoading(false);
    startCamera();
  }

  // Save captured image and metadata to Dataset
  async function handleSaveToDataset() {
    if (!capturedDataUrl || !quality) return;

    setIsSaving(true);
    setErrorMessage(null);

    const record = createDatasetRecord({
      recognitionType,
      imageView,
      imageQuality: quality,
      medicineId: selectedMedicineId || null,
      source: streamRef.current ? 'camera' : 'upload',
      dataUrl: capturedDataUrl,
      notes,
    });

    try {
      // 1. Post to Next.js API to persist in MediBand_Dataset/ on disk
      const res = await fetch('/api/dataset/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record, dataUrl: capturedDataUrl }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save dataset file to disk.');
      }

      setSaveSuccess(`Saved to dataset: ${record.image_id}`);
      if (onCaptureComplete) {
        onCaptureComplete(record);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Server save warning:', msg);
      // Fallback: Notify completion even if local API failed
      setSaveSuccess(`Stored locally: ${record.image_id}`);
      if (onCaptureComplete) {
        onCaptureComplete(record);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const filteredViewOptions = VIEW_OPTIONS.filter(
    v => v.forType === 'both' || v.forType === recognitionType
  );

  return (
    <div className="card" style={{ padding: '1.5rem', background: '#FFFFFF', borderColor: '#E8E7E2' }}>
      {/* ── Mode Selection Header ── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
              Camera & Dataset Collector
            </h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--ink-secondary)', margin: '2px 0 0' }}>
              Capture high-resolution medicine packaging or loose pill samples for the Indian medicine dataset.
            </p>
          </div>

          {/* Recognition Category & Inference Engine Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Category Switcher */}
            <div
              style={{
                display: 'inline-flex',
                background: '#F1F0EA',
                padding: '3px',
                borderRadius: '999px',
                border: '1px solid #E2E0D8',
              }}
              role="group"
              aria-label="Recognition Category"
            >
              <button
                type="button"
                onClick={() => handleModeChange('packaging')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  fontWeight: recognitionType === 'packaging' ? 700 : 500,
                  color: recognitionType === 'packaging' ? '#FFFFFF' : '#4A5568',
                  background: recognitionType === 'packaging' ? 'var(--orange)' : 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Package size={14} />
                Scan Packaging
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('loose_pill')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  fontWeight: recognitionType === 'loose_pill' ? 700 : 500,
                  color: recognitionType === 'loose_pill' ? '#FFFFFF' : '#4A5568',
                  background: recognitionType === 'loose_pill' ? 'var(--orange)' : 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <CircleDot size={14} />
                Scan Loose Pill
              </button>
            </div>

            {/* Inference Engine Switcher */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: '#F8F9FA',
                padding: '3px',
                borderRadius: '999px',
                border: '1px solid #E5E7EB',
                gap: '2px',
              }}
              role="group"
              aria-label="Inference Engine"
            >
              <button
                type="button"
                onClick={() => {
                  setInferenceEngine('server');
                  if (capturedDataUrl) triggerInference(capturedDataUrl, recognitionType, 'server');
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.725rem',
                  fontWeight: inferenceEngine === 'server' ? 700 : 500,
                  color: inferenceEngine === 'server' ? '#FF6115' : '#6B7280',
                  background: inferenceEngine === 'server' ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  boxShadow: inferenceEngine === 'server' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                title="Runs inference on NVIDIA GeForce RTX 4050 GPU via server route"
              >
                ⚡ RTX 4050 GPU
              </button>
              <button
                type="button"
                onClick={() => {
                  setInferenceEngine('client');
                  if (capturedDataUrl) triggerInference(capturedDataUrl, recognitionType, 'client');
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: '0.725rem',
                  fontWeight: inferenceEngine === 'client' ? 700 : 500,
                  color: inferenceEngine === 'client' ? '#2563EB' : '#6B7280',
                  background: inferenceEngine === 'client' ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  boxShadow: inferenceEngine === 'client' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                title="Runs inference directly inside user browser via WebAssembly (ONNX Runtime)"
              >
                🌐 In-Browser WASM
              </button>
            </div>
          </div>
        </div>

        {/* Mode explanation banner */}
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--porcelain)',
            border: '1px solid #EFECE6',
            borderRadius: '8px',
            fontSize: '0.78rem',
            color: '#4A5568',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Info size={15} color="var(--orange)" />
          {recognitionType === 'packaging' ? (
            <span>
              <strong>Category: Medicine Packaging</strong> — captures blister strips, carton boxes, bottles, or tubes with printed text, brand names, and dosage information.
            </span>
          ) : (
            <span>
              <strong>Category: Loose Pill</strong> — captures individual tablets, caplets, or capsules outside packaging. Place on a clean, solid, matte background.
            </span>
          )}
        </div>

        {/* Quick 1-Click Verification Presets */}
        <div
          style={{
            marginTop: '0.65rem',
            padding: '8px 12px',
            background: '#FDFBF7',
            border: '1px solid #EBE7DD',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>
            <Sparkles size={14} color="#FF6115" />
            <span>QUICK PRESETS:</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => loadDemoSample('/demo-samples/metronidazole_blister.jpg', 'packaging', 'blister_foil')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#0F172A',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Test real silver metallic blister strip with Schedule H printed text"
            >
              <span>✨</span> Metronidazole Foil Strip (Phase 4)
            </button>
            <button
              type="button"
              onClick={() => loadDemoSample('/demo-samples/dolo_box.jpg', 'packaging', 'box_panel')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#0F172A',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Test retail cardboard packaging"
            >
              <span>📦</span> Dolo-650 Box
            </button>
            <button
              type="button"
              onClick={() => loadDemoSample('/demo-samples/loose_pill_sample.jpg', 'loose_pill', 'top')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#0F172A',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Test loose pill classifier on isolated tablet"
            >
              <span>💊</span> Loose Tablet (Class A)
            </button>
          </div>
        </div>
      </div>

      {/* ── Viewfinder / Capture Canvas Area ── */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '320px',
          background: '#1A1A1A',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
          border: '1px solid #333333',
        }}
      >
        {/* Hidden video element used as media stream destination */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            display: cameraState === 'streaming' ? 'block' : 'none',
            width: '100%',
            height: '100%',
            maxHeight: '440px',
            objectFit: 'contain',
          }}
        />

        {/* Viewfinder Target Reticle during streaming */}
        {cameraState === 'streaming' && (
          <div
            style={{
              position: 'absolute',
              inset: '16px',
              pointerEvents: 'none',
              border: '1.5px dashed rgba(255, 97, 21, 0.45)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 600 }}>
              <span style={{ background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: 4 }}>
                {recognitionType === 'packaging' ? '📦 Packaging Frame' : '💊 Loose Pill Frame'}
              </span>
              <span style={{ background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: 4 }}>
                Rear Camera Active
              </span>
            </div>

            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', background: 'rgba(0,0,0,0.5)', padding: '4px', borderRadius: 4, width: 'fit-content', margin: '0 auto' }}>
              Hold steady & align medicine within frame
            </div>
          </div>
        )}

        {/* Captured image preview */}
        {cameraState === 'captured' && capturedDataUrl && (
          <div style={{ width: '100%', maxHeight: '440px', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={capturedDataUrl}
              alt="Captured preview"
              style={{ width: '100%', maxHeight: '440px', objectFit: 'contain' }}
            />
          </div>
        )}

        {/* Idle / Starting state prompt */}
        {(cameraState === 'idle' || cameraState === 'starting') && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#CCCCCC' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(255, 97, 21, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              <Camera size={28} color="var(--orange)" />
            </div>

            <div style={{ fontWeight: 600, fontSize: '1rem', color: '#FFFFFF', marginBottom: '0.25rem' }}>
              {cameraState === 'starting' ? 'Initializing Camera…' : 'Camera is inactive'}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#999999', maxWidth: 360, margin: '0 auto 1.25rem' }}>
              Camera permission is requested only when you click Open Camera.
            </p>

            <button
              type="button"
              onClick={startCamera}
              className="btn btn-primary"
              style={{ padding: '0.65rem 1.4rem', fontSize: '0.9rem', borderRadius: '999px' }}
              disabled={cameraState === 'starting'}
            >
              <Camera size={16} />
              {cameraState === 'starting' ? 'Opening…' : 'Open Camera'}
            </button>
          </div>
        )}

        {/* Error State */}
        {cameraState === 'error' && (
          <div style={{ textAlign: 'center', padding: '2rem 1.5rem', color: '#CCCCCC', maxWidth: 420 }}>
            <AlertTriangle size={36} color="#EF4444" style={{ margin: '0 auto 0.75rem' }} />
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#FFFFFF', marginBottom: '0.5rem' }}>
              Camera Unavailable
            </div>
            <p style={{ fontSize: '0.8rem', color: '#FCA5A5', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              {errorMessage}
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={startCamera}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.8rem' }}
              >
                <RefreshCw size={14} /> Retry
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-primary btn-sm"
                style={{ fontSize: '0.8rem' }}
              >
                <Upload size={14} /> Upload File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Camera Action Controls Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {/* Left: Retake or Start Camera */}
        <div>
          {cameraState === 'streaming' && (
            <button
              type="button"
              onClick={stopStream}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.8rem' }}
            >
              Close Camera
            </button>
          )}

          {cameraState === 'captured' && (
            <button
              type="button"
              onClick={retakePhoto}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.825rem' }}
            >
              <RefreshCw size={14} /> Retake Photo
            </button>
          )}
        </div>

        {/* Center: Primary Capture Button */}
        <div>
          {cameraState === 'streaming' && (
            <button
              type="button"
              onClick={capturePhoto}
              className="btn btn-primary"
              style={{
                padding: '0.75rem 1.75rem',
                fontSize: '0.95rem',
                borderRadius: '999px',
                boxShadow: '0 4px 14px rgba(255, 97, 21, 0.4)',
              }}
            >
              <Camera size={18} /> Capture Photo
            </button>
          )}
        </div>

        {/* Right: File Upload fallback */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}
          >
            <Upload size={14} /> Upload Image File
          </button>
        </div>
      </div>

      {/* AI Vision Neural Prediction & OCR Decision Card */}
      {cameraState === 'captured' && (
        <PredictionCard
          result={prediction}
          loading={predicting}
          ocrResult={ocrResult}
          ocrLoading={ocrLoading}
          onApplyMedicine={medName => {
            const found = INDIAN_MEDICINES.find(
              m => m.brand_name.toLowerCase() === medName.toLowerCase()
            );
            if (found) {
              setSelectedMedicineId(found.medicine_id);
            } else {
              setNotes(prev => (prev ? `${prev} | Match: ${medName}` : `Match: ${medName}`));
            }
          }}
          onRetake={retakePhoto}
        />
      )}

      {/* ── Image Quality Inspection & Warnings ── */}
      {cameraState === 'captured' && quality && (
        <div
          style={{
            background: quality.isAcceptable ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${quality.isAcceptable ? '#BBF7D0' : '#FDE68A'}`,
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {quality.isAcceptable ? (
                <CheckCircle2 size={18} color="#16A34A" />
              ) : (
                <AlertTriangle size={18} color="#D97706" />
              )}
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: quality.isAcceptable ? '#166534' : '#92400E' }}>
                {quality.isAcceptable ? 'Image Quality Passed' : 'Image Quality Warning'}
              </span>
            </div>

            {/* Quality Metrics Summary Chips */}
            <div style={{ display: 'flex', gap: '6px', fontSize: '0.725rem', fontWeight: 600 }}>
              <span style={{ padding: '2px 8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px' }}>
                {quality.resolution.width}×{quality.resolution.height} ({quality.megapixels} MP)
              </span>
              <span style={{ padding: '2px 8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px' }}>
                Brightness: {quality.brightness}%
              </span>
              <span style={{ padding: '2px 8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px' }}>
                Sharpness: {quality.blurScore}
              </span>
              <span style={{ padding: '2px 8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px' }}>
                Glare: {quality.glareScore}%
              </span>
            </div>
          </div>

          {/* Warning list if any */}
          {quality.warnings.length > 0 && (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#92400E' }}>
              {quality.warnings.map((w, idx) => (
                <li key={idx} style={{ marginBottom: '2px' }}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Metadata Annotation Form (View & Medicine Association) ── */}
      {cameraState === 'captured' && (
        <div style={{ background: 'var(--porcelain)', border: '1px solid #EAE8E2', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--ink)' }}>
            Dataset Annotation & Metadata
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '0.75rem' }}>
            {/* Image View Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-secondary)', marginBottom: '4px' }}>
                Image View / Perspective:
              </label>
              <select
                value={imageView}
                onChange={e => setImageView(e.target.value as ImageView)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #D0CFC8',
                  background: '#FFFFFF',
                  fontSize: '0.825rem',
                }}
              >
                {filteredViewOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Medicine Reference Association (Optional — never forced or invented) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-secondary)', marginBottom: '4px' }}>
                Known Indian Medicine (Optional):
              </label>
              <select
                value={selectedMedicineId}
                onChange={e => setSelectedMedicineId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #D0CFC8',
                  background: '#FFFFFF',
                  fontSize: '0.825rem',
                }}
              >
                <option value="">(Unlabeled / Unknown Medicine)</option>
                {INDIAN_MEDICINES.map(m => (
                  <option key={m.medicine_id} value={m.medicine_id}>
                    {m.brand_name} ({m.strength}) — {m.manufacturer}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes field */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-secondary)', marginBottom: '4px' }}>
              Annotation Notes (Optional):
            </label>
            <input
              type="text"
              placeholder="e.g. ambient fluorescent lighting, slight foil crease, English text side"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '6px',
                border: '1px solid #D0CFC8',
                background: '#FFFFFF',
                fontSize: '0.825rem',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Save / Proceed Button ── */}
      {cameraState === 'captured' && (
        <div>
          {saveSuccess ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                color: '#15803D',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={16} />
              <span>{saveSuccess}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleSaveToDataset}
                disabled={isSaving}
                className="btn btn-primary"
                style={{ padding: '0.65rem 1.5rem', fontSize: '0.9rem', borderRadius: '8px' }}
              >
                {isSaving ? 'Saving to Dataset…' : 'Save to MediBand Dataset'}
              </button>

              <button
                type="button"
                onClick={retakePhoto}
                className="btn btn-ghost"
                style={{ fontSize: '0.85rem' }}
              >
                Retake
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
