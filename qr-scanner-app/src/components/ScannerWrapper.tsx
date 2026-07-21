'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface ScannerWrapperProps {
  onScan: (value: string) => void;
  onError?: (err: string) => void;
}

export default function ScannerWrapper({ onScan, onError }: ScannerWrapperProps) {
  const containerId = 'html5qrcode-scanner-container';
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState<string>('Initializing Scanner...');
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Camera capabilities (Zoom & Torch)
  const [supportsTorch, setSupportsTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [supportsZoom, setSupportsZoom] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(1);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ value: string; time: number }>({ value: '', time: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Code 128 / GS1-128 Modulo 103 & digit validation
  const isValidBarcodeValue = (val: string): boolean => {
    if (!val) return false;
    const clean = val.trim();
    if (clean.length < 3) return false;

    // If it's a 30+ digit numerical tracking number starting with 96 or 92 (e.g. FedEx / USPS GS1-128)
    // ensure it has at least 34 digits and isn't truncated to 32 digits
    if (/^9[26]\d+$/.test(clean)) {
      if (clean.length < 34) {
        console.log(`Ignoring truncated GS1-128 barcode (${clean.length} digits): ${clean}`);
        return false;
      }
    }

    return true;
  };

  const handleDetectedValue = (rawValue: string) => {
    if (!rawValue) return;
    const cleanValue = rawValue.trim();
    if (!cleanValue || !isValidBarcodeValue(cleanValue)) return;

    const now = Date.now();
    // Prevent duplicate scans within 1.5 seconds if value is identical
    if (lastScannedRef.current.value === cleanValue && now - lastScannedRef.current.time < 1500) {
      return;
    }
    lastScannedRef.current = { value: cleanValue, time: now };
    onScanRef.current(cleanValue);
  };

  useEffect(() => {
    let mounted = true;

    const initScanner = async () => {
      try {
        setCameraError(null);
        setScannerStatus('Starting Camera Feed...');

        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.PDF_417,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ];

        const html5Qrcode = new Html5Qrcode(containerId, {
          formatsToSupport,
          verbose: false,
        });

        html5QrcodeRef.current = html5Qrcode;

        const config = {
          fps: 25,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(minEdge * 0.9),
              height: Math.floor(minEdge * 0.9),
            };
          },
          aspectRatio: 1.0, // 1:1 Aspect Ratio
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        };

        await html5Qrcode.start(
          {
            facingMode: 'environment',
          },
          config,
          (decodedText) => {
            if (mounted && decodedText) {
              handleDetectedValue(decodedText);
            }
          },
          () => {
            // Ignore scan frame failures
          }
        );

        if (mounted) {
          setIsScanning(true);
          setScannerStatus('Active - Hold Barcode or QR Code in box');

          // Query video track capabilities for Torch & Zoom
          try {
            const runningTrack = html5Qrcode.getRunningTrackCapabilities();
            if (runningTrack) {
              const capabilities = runningTrack as any;
              if (capabilities.torch) {
                setSupportsTorch(true);
              }
              if (capabilities.zoom) {
                setSupportsZoom(true);
                setZoomLevel(capabilities.zoom.min || 1);
                setMaxZoom(capabilities.zoom.max || 3);
              }
            }
          } catch (e) {
            console.log('Track capabilities check error:', e);
          }
        }
      } catch (err: any) {
        console.error('Html5Qrcode scanner error:', err);
        if (mounted) {
          const errMsg = err?.message || 'Failed to start camera scanner.';
          setCameraError(errMsg);
          setScannerStatus('Camera Error');
          if (onError) onError(errMsg);
        }
      }
    };

    initScanner();

    return () => {
      mounted = false;
      if (html5QrcodeRef.current) {
        if (html5QrcodeRef.current.isScanning) {
          html5QrcodeRef.current
            .stop()
            .then(() => {
              html5QrcodeRef.current?.clear();
            })
            .catch((e) => console.error('Error stopping html5Qrcode:', e));
        }
      }
    };
  }, [onError]);

  const toggleTorch = async () => {
    if (!html5QrcodeRef.current || !supportsTorch) return;
    try {
      const nextTorch = !torchOn;
      await html5QrcodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }] as any,
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.error('Failed to toggle torch:', err);
    }
  };

  const changeZoom = async (newZoom: number) => {
    if (!html5QrcodeRef.current || !supportsZoom) return;
    try {
      const clampedZoom = Math.min(Math.max(newZoom, 1), maxZoom);
      await html5QrcodeRef.current.applyVideoConstraints({
        advanced: [{ zoom: clampedZoom }] as any,
      });
      setZoomLevel(clampedZoom);
    } catch (err) {
      console.error('Failed to apply zoom:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setScannerStatus(`Scanning photo (${file.name})...`);

    try {
      let html5Qrcode = html5QrcodeRef.current;
      if (!html5Qrcode) {
        html5Qrcode = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
            Html5QrcodeSupportedFormats.PDF_417,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          verbose: false,
        });
      }

      const decodedText = await html5Qrcode.scanFile(file, true);
      if (decodedText && isValidBarcodeValue(decodedText)) {
        handleDetectedValue(decodedText);
        setScannerStatus(`Scanned successfully: ${decodedText}`);
      } else {
        setScannerStatus('No valid barcode or QR code found in photo.');
      }
    } catch (err: any) {
      console.error('File scan error:', err);
      setScannerStatus('Could not decode code from photo. Please ensure code is clear.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* 1:1 Aspect Ratio Camera Viewport */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black aspect-square max-w-md mx-auto w-full flex items-center justify-center shadow-xl">
        {/* Container for html5-qrcode video element */}
        <div id={containerId} className="w-full h-full object-cover [&>video]:w-full [&>video]:h-full [&>video]:object-cover" />

        {cameraError && (
          <div className="absolute inset-0 p-6 text-center text-xs text-red-400 font-semibold bg-slate-900 flex flex-col items-center justify-center gap-2">
            <span>⚠️</span>
            <span>{cameraError}</span>
          </div>
        )}

        {/* Animated laser line */}
        {isScanning && !cameraError && (
          <div className="absolute left-0 right-0 h-0.5 bg-green-500/90 shadow-[0_0_12px_#22c55e] animate-bounce top-0 pointer-events-none z-10" />
        )}

        {/* Camera Control Overlays (Torch & Zoom) */}
        {isScanning && !cameraError && (supportsTorch || supportsZoom) && (
          <div className="absolute top-3 right-3 z-20 flex gap-2">
            {supportsTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                  torchOn
                    ? 'bg-amber-400 text-slate-900 shadow-amber-400/20'
                    : 'bg-black/60 backdrop-blur text-white hover:bg-black/80'
                }`}
                title="Toggle Flashlight"
              >
                {torchOn ? '💡 Light ON' : '🔦 Light OFF'}
              </button>
            )}

            {supportsZoom && (
              <div className="flex bg-black/60 backdrop-blur rounded-xl p-1 text-white gap-1 items-center text-xs">
                <button
                  type="button"
                  onClick={() => changeZoom(zoomLevel - 0.5)}
                  disabled={zoomLevel <= 1}
                  className="px-2 py-1 rounded hover:bg-white/20 disabled:opacity-30 cursor-pointer font-bold"
                >
                  -
                </button>
                <span className="text-[10px] font-mono px-1">{zoomLevel.toFixed(1)}x</span>
                <button
                  type="button"
                  onClick={() => changeZoom(zoomLevel + 0.5)}
                  disabled={zoomLevel >= maxZoom}
                  className="px-2 py-1 rounded hover:bg-white/20 disabled:opacity-30 cursor-pointer font-bold"
                >
                  +
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status & File Upload Option */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-[11px] text-slate-500 font-semibold tracking-wide">
          {scannerStatus}
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            🖼️ Scan Barcode / QR from Photo
          </button>
        </div>
      </div>
    </div>
  );
}
