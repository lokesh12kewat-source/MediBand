'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { validateGTIN } from '@/lib/gtin';
import { parseGS1 } from '@/lib/gs1-parser';
import { BrowserMultiFormatReader } from '@zxing/browser';

export default function LiveScanner() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  // Decoded or manual fields
  const [rawDecoded, setRawDecoded] = useState<string>('');
  const [gtin, setGtin] = useState<string>('');
  const [encodedBatch, setEncodedBatch] = useState<string>('');
  const [encodedExpiry, setEncodedExpiry] = useState<string>('');
  const [serial, setSerial] = useState<string>('');

  // Printed on pack (user entered for OCR simulation)
  const [brandName, setBrandName] = useState<string>('');
  const [printedBatch, setPrintedBatch] = useState<string>('');
  const [printedExpiry, setPrintedExpiry] = useState<string>('');

  // Live GTIN validation feedback
  const gtinValidation = gtin ? validateGTIN(gtin) : null;

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
      }

      setCameraActive(true);
      // Wait for video element to mount
      setTimeout(async () => {
        if (!videoRef.current || !readerRef.current) return;
        try {
          await readerRef.current.decodeFromVideoDevice(
            undefined, // default camera
            videoRef.current,
            (result, error) => {
              if (result) {
                handleBarcodeDetected(result.getText());
                stopCamera();
              }
            }
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setCameraError(`Camera error: ${msg}`);
          setCameraActive(false);
        }
      }, 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(`Could not access camera: ${msg}`);
      setCameraActive(false);
    }
  }

  function stopCamera() {
    if (readerRef.current && videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  // Handle image upload decoding
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCameraError(null);
    try {
      const reader = new BrowserMultiFormatReader();
      const imgUrl = URL.createObjectURL(file);
      const result = await reader.decodeFromImageUrl(imgUrl);
      URL.revokeObjectURL(imgUrl);
      if (result) {
        handleBarcodeDetected(result.getText());
      }
    } catch (err) {
      setCameraError('No barcode, DataMatrix or QR code could be decoded from this image.');
    }
  }

  function handleBarcodeDetected(text: string) {
    setRawDecoded(text);
    const parsed = parseGS1(text);

    if (parsed.gtin) setGtin(parsed.gtin);
    else if (/^\d{8,14}$/.test(text.trim())) setGtin(text.trim());

    if (parsed.batch) setEncodedBatch(parsed.batch);
    if (parsed.expiry) setEncodedExpiry(parsed.expiry);
    if (parsed.serial) setSerial(parsed.serial);
  }

  function handleRunCheck() {
    const customData = {
      gtin: gtin.trim(),
      batchEncoded: encodedBatch.trim(),
      expiryEncoded: encodedExpiry.trim(),
      serial: serial.trim(),
      brandName: brandName.trim() || 'Scanned Pack',
      batchPrinted: printedBatch.trim() || encodedBatch.trim(),
      expiryPrinted: printedExpiry.trim() || encodedExpiry.trim(),
    };

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('mediband_custom_scan', JSON.stringify(customData));
    }
    router.push('/scan/result?custom=1');
  }

  const hasMinimumData = gtin.trim().length > 0 || printedBatch.trim().length > 0;

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Live Scanner & Manual Entry</div>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--surface-muted)', padding: '2px', borderRadius: 6 }}>
          <button
            onClick={() => setActiveTab('camera')}
            className={`btn btn-sm ${activeTab === 'camera' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
          >
            Camera / Upload
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`btn btn-sm ${activeTab === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
          >
            Manual Entry
          </button>
        </div>
      </div>

      {/* Tab 1: Live Camera / Image Upload */}
      {activeTab === 'camera' && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            {cameraActive ? (
              <div style={{ position: 'relative', width: '100%', maxWidth: '360px', margin: '0 auto', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                <video ref={videoRef} style={{ width: '100%', height: '240px', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)' }}>
                  <button onClick={stopCamera} className="btn btn-ghost btn-sm" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    Stop Camera
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '1.5rem', background: 'var(--surface-muted)', borderRadius: 8, border: '2px dashed var(--border)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📷</div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Scan Barcode, DataMatrix or QR Code
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
                  Uses your device camera or upload an image file. Decodes real GS1 elements.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={startCamera} className="btn btn-primary btn-sm" id="start-camera-btn">
                    Start Camera
                  </button>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                    Upload Image
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            )}

            {cameraError && (
              <div style={{ color: 'var(--status-conflict)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {cameraError}
              </div>
            )}
          </div>

          {rawDecoded && (
            <div style={{ padding: '0.625rem', background: 'var(--status-strong-bg)', border: '1px solid var(--status-strong)', borderRadius: 6, marginBottom: '1rem', fontSize: '0.75rem' }}>
              <strong>Decoded payload:</strong> <code style={{ wordBreak: 'break-all' }}>{rawDecoded}</code>
            </div>
          )}
        </div>
      )}

      {/* Form Fields (Common to Camera and Manual) */}
      <div style={{ display: 'grid', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          1. Machine-Readable Code Data
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
            GTIN (Barcode / EAN)
          </label>
          <input
            type="text"
            placeholder="e.g. 09312345678907"
            value={gtin}
            onChange={e => setGtin(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', fontSize: '0.8125rem', border: '1px solid var(--border)', borderRadius: 6 }}
          />
          {gtinValidation && (
            <div style={{ fontSize: '0.72rem', marginTop: '3px' }}>
              {gtinValidation.valid ? (
                <span style={{ color: 'var(--status-strong)', fontWeight: 600 }}>
                  ✓ {gtinValidation.format} — check digit {gtinValidation.checkDigit} is valid
                </span>
              ) : (
                <span style={{ color: 'var(--status-conflict)', fontWeight: 600 }}>
                  ✗ {gtinValidation.error || 'Invalid GTIN check digit'}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
              Encoded Batch
            </label>
            <input
              type="text"
              placeholder="e.g. A12345"
              value={encodedBatch}
              onChange={e => setEncodedBatch(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', fontSize: '0.8125rem', border: '1px solid var(--border)', borderRadius: 6 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
              Encoded Expiry
            </label>
            <input
              type="text"
              placeholder="e.g. 08/2027 or 270800"
              value={encodedExpiry}
              onChange={e => setEncodedExpiry(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', fontSize: '0.8125rem', border: '1px solid var(--border)', borderRadius: 6 }}
            />
          </div>
        </div>

        {/* Printed Information */}
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: '0.5rem' }}>
          2. What is printed on the physical pack?
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
            Brand Name (Printed)
          </label>
          <input
            type="text"
            placeholder="e.g. ExampleMed 650"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', fontSize: '0.8125rem', border: '1px solid var(--border)', borderRadius: 6 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
              Printed Batch
            </label>
            <input
              type="text"
              placeholder="e.g. A12345"
              value={printedBatch}
              onChange={e => setPrintedBatch(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', fontSize: '0.8125rem', border: '1px solid var(--border)', borderRadius: 6 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>
              Printed Expiry
            </label>
            <input
              type="text"
              placeholder="e.g. 08/2027"
              value={printedExpiry}
              onChange={e => setPrintedExpiry(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', fontSize: '0.8125rem', border: '1px solid var(--border)', borderRadius: 6 }}
            />
          </div>
        </div>

        <button
          onClick={handleRunCheck}
          disabled={!hasMinimumData}
          className="btn btn-primary"
          style={{ marginTop: '0.5rem', opacity: hasMinimumData ? 1 : 0.5, cursor: hasMinimumData ? 'pointer' : 'not-allowed' }}
          id="run-evidence-check-btn"
        >
          Run Evidence Check →
        </button>
      </div>
    </div>
  );
}
