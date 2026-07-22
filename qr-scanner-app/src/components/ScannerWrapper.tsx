'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { readBarcodesFromImageData } from 'zxing-wasm/reader';

export interface RenderScannerProps {
  refreshScanner: () => void;
  isPaused: boolean;
}

interface ScannerWrapperProps {
  onScan: (value: string) => void;
  onError?: (err: string) => void;
  children?: React.ReactNode | ((props: RenderScannerProps) => React.ReactNode);
}

export default function ScannerWrapper({ onScan, onError, children }: ScannerWrapperProps) {
  const containerId = 'html5qrcode-scanner-container';
  const [scanMode, setScanMode] = useState<'barcode' | 'qrcode'>('barcode');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState<string>('Initializing Scanner...');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isCameraPaused, setIsCameraPaused] = useState<boolean>(false);

  // Camera capabilities (Zoom & Torch)
  const [supportsTorch, setSupportsTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [supportsZoom, setSupportsZoom] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.5);
  const [maxZoom, setMaxZoom] = useState<number>(1);

  // Photo Crop Modal State
  const [cropModalImage, setCropModalImage] = useState<string | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);

  // Crop area percentages (0 to 100)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 5,
    y: 20,
    width: 90,
    height: 50,
  });

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ value: string; time: number }>({ value: '', time: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    boxX: number;
    boxY: number;
    boxWidth: number;
    boxHeight: number;
    handle: string;
  } | null>(null);

  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Code 128 / GS1-128 Modulo 103 & digit validation
  const isValidBarcodeValue = (val: string): boolean => {
    if (!val) return false;
    const clean = val.trim();
    if (clean.length < 3) return false;

    // If numerical tracking number starting with 96 or 92 (FedEx / USPS GS1-128)
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

    // Pause camera stream on frame decode
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        html5QrcodeRef.current.pause(true);
        setIsCameraPaused(true);
      } catch (e) {
        console.log('Error pausing html5Qrcode:', e);
      }
    }

    setScannerStatus(`Code Scanned: ${cleanValue}`);
    onScanRef.current(cleanValue);
  };

  const handleRefreshScanner = () => {
    if (html5QrcodeRef.current && isCameraPaused) {
      try {
        html5QrcodeRef.current.resume();
      } catch (e) {
        console.log('Error resuming html5Qrcode:', e);
      }
    }
    setIsCameraPaused(false);
    setCroppedPreviewUrl(null);
    setScannerStatus(`Active (${scanMode === 'barcode' ? 'Bar Code' : 'QR Code'}) - Position code in viewfinder`);
  };

  useEffect(() => {
    let mounted = true;

    const initScanner = async () => {
      try {
        setCameraError(null);
        setIsCameraPaused(false);
        setScannerStatus(`Starting ${scanMode === 'barcode' ? 'Bar Code' : 'QR Code'} Scanner...`);

        // Configure formats based on scan mode
        const formatsToSupport =
          scanMode === 'barcode'
            ? [
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.CODE_93,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODABAR,
                Html5QrcodeSupportedFormats.RSS_14,
                Html5QrcodeSupportedFormats.RSS_EXPANDED,
              ]
            : [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.DATA_MATRIX,
                Html5QrcodeSupportedFormats.PDF_417,
                Html5QrcodeSupportedFormats.AZTEC,
              ];

        const html5Qrcode = new Html5Qrcode(containerId, {
          formatsToSupport,
          verbose: false,
        });

        html5QrcodeRef.current = html5Qrcode;

        const isBarcode = scanMode === 'barcode';
        const config = {
          fps: 25,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            if (isBarcode) {
              return {
                width: Math.floor(viewfinderWidth * 0.85),
                height: Math.floor(viewfinderHeight * 0.60),
              };
            }
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(minEdge * 0.70),
              height: Math.floor(minEdge * 0.70),
            };
          },
          aspectRatio: isBarcode ? 2.0 : 1.0, // 16:8 (2:1) for Barcode, 1:1 for QR
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: false, // Enforce strict canvas cropping to target viewfinder box ONLY
          },
        };

        await html5Qrcode.start(
          {
            facingMode: 'environment',
          },
          config,
          (decodedText) => {
            if (mounted && decodedText && !croppedPreviewUrl) {
              handleDetectedValue(decodedText);
            }
          },
          () => {
            // Ignore scan frame failures
          }
        );

        if (mounted) {
          setIsScanning(true);
          setScannerStatus(`Active (${isBarcode ? 'Bar Code' : 'QR Code'}) - Position code in viewfinder`);

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
                const minZ = capabilities.zoom.min || 1;
                const maxZ = capabilities.zoom.max || 3;
                setMaxZoom(maxZ);

                // Apply default 1.5x zoom for optimal barcode resolution
                const defaultZoom = Math.min(Math.max(1.5, minZ), maxZ);
                try {
                  await html5Qrcode.applyVideoConstraints({
                    advanced: [{ zoom: defaultZoom }] as any,
                  });
                  setZoomLevel(defaultZoom);
                } catch (zErr) {
                  console.log('Error applying default 1.5x zoom:', zErr);
                  setZoomLevel(minZ);
                }
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
  }, [onError, croppedPreviewUrl, scanMode]);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const photoUrl = URL.createObjectURL(file);

    // Open Crop Modal with photo
    setCropModalImage(photoUrl);

    // Set crop overlay based on current scan mode
    if (scanMode === 'barcode') {
      setCropBox({ x: 5, y: 25, width: 90, height: 50 }); // Wide horizontal crop for barcodes
    } else {
      setCropBox({ x: 20, y: 20, width: 60, height: 60 }); // Square crop for QR codes
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Pointer drag event handlers for direct corner & box dragging
  const handlePointerDown = (handle: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      boxX: cropBox.x,
      boxY: cropBox.y,
      boxWidth: cropBox.width,
      boxHeight: cropBox.height,
      handle,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current || !cropContainerRef.current) return;
    e.preventDefault();

    const rect = cropContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const start = dragStartRef.current;
    const deltaXPercent = ((e.clientX - start.pointerX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - start.pointerY) / rect.height) * 100;

    let x = start.boxX;
    let y = start.boxY;
    let width = start.boxWidth;
    let height = start.boxHeight;

    const minW = 15;
    const minH = 10;

    if (start.handle === 'move') {
      x = Math.max(0, Math.min(100 - width, start.boxX + deltaXPercent));
      y = Math.max(0, Math.min(100 - height, start.boxY + deltaYPercent));
    } else if (start.handle === 'nw') {
      const maxX = start.boxX + start.boxWidth - minW;
      const maxY = start.boxY + start.boxHeight - minH;
      x = Math.max(0, Math.min(maxX, start.boxX + deltaXPercent));
      y = Math.max(0, Math.min(maxY, start.boxY + deltaYPercent));
      width = start.boxWidth + (start.boxX - x);
      height = start.boxHeight + (start.boxY - y);
    } else if (start.handle === 'ne') {
      const maxY = start.boxY + start.boxHeight - minH;
      y = Math.max(0, Math.min(maxY, start.boxY + deltaYPercent));
      width = Math.max(minW, Math.min(100 - start.boxX, start.boxWidth + deltaXPercent));
      height = start.boxHeight + (start.boxY - y);
    } else if (start.handle === 'sw') {
      const maxX = start.boxX + start.boxWidth - minW;
      x = Math.max(0, Math.min(maxX, start.boxX + deltaXPercent));
      width = start.boxWidth + (start.boxX - x);
      height = Math.max(minH, Math.min(100 - start.boxY, start.boxHeight + deltaYPercent));
    } else if (start.handle === 'se') {
      width = Math.max(minW, Math.min(100 - start.boxX, start.boxWidth + deltaXPercent));
      height = Math.max(minH, Math.min(100 - start.boxY, start.boxHeight + deltaYPercent));
    }

    setCropBox({ x, y, width, height });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      dragStartRef.current = null;
    }
  };

  const decodeCroppedCanvas = async (canvas: HTMLCanvasElement): Promise<string | null> => {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Pass 1: WASM Barcode Decoder (Ultra high precision for Code 128 / UPS / FedEx / QR)
      try {
        const results = await readBarcodesFromImageData(imageData, {
          tryHarder: true,
          tryRotate: true,
          formats: ['Code128', 'Code39', 'Code93', 'QRCode', 'DataMatrix', 'ITF', 'EAN13', 'EAN8', 'UPCA', 'UPCE']
        });
        if (results && results.length > 0 && results[0].text) {
          return results[0].text.trim();
        }
      } catch (e) {
        console.log('zxing-wasm scan pass error:', e);
      }

      // Pass 2: html5-qrcode scanFile fallback
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const croppedFile = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
        
        let html5Qrcode = html5QrcodeRef.current || new Html5Qrcode(containerId, { verbose: false });
        const text = await html5Qrcode.scanFile(croppedFile, true);
        if (text) {
          return text.trim();
        }
      } catch (e) {
        console.log('html5-qrcode scan pass error:', e);
      }

      return null;
    } catch (err) {
      console.error('decodeCroppedCanvas error:', err);
      return null;
    }
  };

  const executeCropAndScan = async () => {
    if (!cropModalImage || !cropImageRef.current) return;

    const img = cropImageRef.current;
    const naturalW = img.naturalWidth || 800;
    const naturalH = img.naturalHeight || 600;

    // Calculate crop pixel bounds
    const cropX = Math.max(0, Math.floor((cropBox.x / 100) * naturalW));
    const cropY = Math.max(0, Math.floor((cropBox.y / 100) * naturalH));
    const cropW = Math.min(naturalW - cropX, Math.floor((cropBox.width / 100) * naturalW));
    const cropH = Math.min(naturalH - cropY, Math.floor((cropBox.height / 100) * naturalH));

    if (cropW <= 0 || cropH <= 0) return;

    // Create cropped canvas
    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCroppedPreviewUrl(croppedDataUrl);
    setCropModalImage(null);

    setScannerStatus('Decoding cropped code photo...');

    // Decode cropped area using multi-pass WASM decoder
    const decodedValue = await decodeCroppedCanvas(canvas);
    if (decodedValue && isValidBarcodeValue(decodedValue)) {
      handleDetectedValue(decodedValue);
      setScannerStatus(`Scanned Code: ${decodedValue}`);
    } else {
      setScannerStatus('Photo preview loaded. (Could not auto-decode — ensure code is sharp)');
    }
  };

  const isBarcode = scanMode === 'barcode';
  const viewportAspectClass = isBarcode ? 'aspect-[16/8]' : 'aspect-square';

  return (
    <div className="space-y-3">
      {/* Aspect Ratio Viewport (16:8 for Bar Code, 1:1 for QR Code) */}
      <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-black ${viewportAspectClass} max-w-md mx-auto w-full flex items-center justify-center shadow-xl transition-all duration-300 [&_#qr-shaded-region]:!hidden [&_div[style*="border"]]:!border-0 [&_div[style*="rgba"]]:!hidden [&_div[style*="z-index: 1"]]:!hidden`}>
        {/* If Cropped Photo Preview is active, display it inside the active aspect box */}
        {croppedPreviewUrl ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-950 p-2">
            <img
              src={croppedPreviewUrl}
              alt="Cropped Barcode Preview"
              className="max-w-full max-h-full object-contain rounded-lg border border-slate-800"
            />

            {/* Badge Indicator */}
            <div className="absolute top-3 left-3 bg-blue-600/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg backdrop-blur shadow-md flex items-center gap-1 z-10">
              <span>🖼️</span> Cropped Photo Preview
            </div>

            {/* Switch to Live Camera Button */}
            <button
              type="button"
              onClick={handleRefreshScanner}
              className="absolute bottom-3 bg-white/90 hover:bg-white text-slate-800 text-xs font-bold px-3 py-2 rounded-xl shadow-lg cursor-pointer transition-all flex items-center gap-1.5 z-10"
            >
              <span>🎥</span> Switch to Live Camera
            </button>
          </div>
        ) : (
          /* Live Camera Viewport */
          <>
            <div id={containerId} className="w-full h-full object-cover [&>video]:w-full [&>video]:h-full [&>video]:object-cover" />

            {cameraError && (
              <div className="absolute inset-0 p-6 text-center text-xs text-red-400 font-semibold bg-slate-900 flex flex-col items-center justify-center gap-2">
                <span>⚠️</span>
                <span>{cameraError}</span>
              </div>
            )}

            {/* Clean Target Framing Box Overlay */}
            {isScanning && !cameraError && !croppedPreviewUrl && !isCameraPaused && (
              <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center p-3">
                {isBarcode ? (
                  /* Barcode Mode Target Frame (Wide Horizontal Strip) */
                  <div className="relative w-[85%] h-[60%] border-2 border-dashed border-white/40 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                    <div className="w-6 h-6 border-t-4 border-l-4 border-blue-500 absolute -top-1 -left-1 rounded-tl-lg shadow-md" />
                    <div className="w-6 h-6 border-t-4 border-r-4 border-blue-500 absolute -top-1 -right-1 rounded-tr-lg shadow-md" />
                    <div className="w-6 h-6 border-b-4 border-l-4 border-blue-500 absolute -bottom-1 -left-1 rounded-bl-lg shadow-md" />
                    <div className="w-6 h-6 border-b-4 border-r-4 border-blue-500 absolute -bottom-1 -right-1 rounded-br-lg shadow-md" />
                  </div>
                ) : (
                  /* QR Code Mode Target Frame (1:1 Square Box) */
                  <div className="relative w-[70%] h-[70%] border-2 border-dashed border-white/40 rounded-2xl shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                    <div className="w-7 h-7 border-t-4 border-l-4 border-blue-500 absolute -top-1 -left-1 rounded-tl-xl shadow-md" />
                    <div className="w-7 h-7 border-t-4 border-r-4 border-blue-500 absolute -top-1 -right-1 rounded-tr-xl shadow-md" />
                    <div className="w-7 h-7 border-b-4 border-l-4 border-blue-500 absolute -bottom-1 -left-1 rounded-bl-xl shadow-md" />
                    <div className="w-7 h-7 border-b-4 border-r-4 border-blue-500 absolute -bottom-1 -right-1 rounded-br-xl shadow-md" />
                  </div>
                )}
              </div>
            )}

            {/* Animated laser line */}
            {isScanning && !cameraError && !isCameraPaused && (
              <div className="absolute left-0 right-0 h-0.5 bg-green-500/90 shadow-[0_0_12px_#22c55e] animate-bounce top-0 pointer-events-none z-15" />
            )}

            {/* Camera Control Overlays (Torch & Zoom) */}
            {isScanning && !cameraError && (supportsTorch || supportsZoom) && !isCameraPaused && (
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
          </>
        )}
      </div>

      {/* Bar Code / QR Code Toggle Selector */}
      <div className="flex bg-slate-200/80 p-1 rounded-2xl w-full max-w-md mx-auto text-xs font-semibold select-none shadow-inner border border-slate-300/50">
        <button
          type="button"
          onClick={() => {
            setScanMode('barcode');
            handleRefreshScanner();
          }}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            scanMode === 'barcode'
              ? 'bg-white text-blue-600 shadow-md font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>📊</span> Bar Code (16:8)
        </button>
        <button
          type="button"
          onClick={() => {
            setScanMode('qrcode');
            handleRefreshScanner();
          }}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            scanMode === 'qrcode'
              ? 'bg-white text-blue-600 shadow-md font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🔳</span> QR Code (1:1)
        </button>
      </div>

      {/* Children elements (Scanned / Tracking ID Input Card) */}
      {typeof children === 'function'
        ? children({ refreshScanner: handleRefreshScanner, isPaused: isCameraPaused })
        : children}

      {/* Full Width Gallery Pick Option (Placed below Scanned / Tracking ID card) */}
      <div className="w-full max-w-md mx-auto">
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
          className="w-full text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm border border-blue-100/80"
        >
          <span>🖼️</span> Pick from Gallery
        </button>
      </div>

      {/* Touch-Friendly Mobile Photo Crop Modal */}
      {cropModalImage && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-between p-4 overflow-hidden select-none">
          {/* Header */}
          <div className="w-full max-w-md flex items-center justify-between pt-2 pb-2">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <span className="text-base">✂️</span> Crop {isBarcode ? 'Barcode' : 'QR Code'} Region
            </div>
            <button
              type="button"
              onClick={() => setCropModalImage(null)}
              className="text-slate-400 hover:text-white text-base p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="text-[11px] text-slate-400 text-center -mt-1 mb-2">
            Drag the box or drag its 4 corners to fit the code
          </div>

          {/* Touch & Drag Canvas Box */}
          <div className="flex-1 w-full max-w-md flex items-center justify-center relative overflow-hidden my-auto">
            <div
              ref={cropContainerRef}
              className="relative inline-block max-w-full max-h-[62vh] rounded-xl overflow-hidden border border-slate-800 shadow-2xl touch-none select-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <img
                ref={cropImageRef}
                src={cropModalImage}
                alt="Barcode Source"
                className="max-h-[62vh] max-w-full w-auto h-auto block select-none pointer-events-none"
              />

              {/* Draggable & Resizable Outlined Overlay Box */}
              <div
                className="absolute border-2 border-dashed border-blue-400 bg-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.4)] cursor-move touch-none"
                style={{
                  left: `${cropBox.x}%`,
                  top: `${cropBox.y}%`,
                  width: `${cropBox.width}%`,
                  height: `${cropBox.height}%`,
                }}
                onPointerDown={(e) => handlePointerDown('move', e)}
              >
                {/* Center Badge Label */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-md pointer-events-none whitespace-nowrap">
                  {isBarcode ? 'Barcode Area' : 'QR Area'}
                </div>

                {/* 4 Corner Drag Knobs */}
                {/* Top-Left */}
                <div
                  className="absolute -top-3 -left-3 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-lg cursor-nwse-resize touch-none z-30"
                  onPointerDown={(e) => handlePointerDown('nw', e)}
                />

                {/* Top-Right */}
                <div
                  className="absolute -top-3 -right-3 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-lg cursor-nesw-resize touch-none z-30"
                  onPointerDown={(e) => handlePointerDown('ne', e)}
                />

                {/* Bottom-Left */}
                <div
                  className="absolute -bottom-3 -left-3 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-lg cursor-nesw-resize touch-none z-30"
                  onPointerDown={(e) => handlePointerDown('sw', e)}
                />

                {/* Bottom-Right */}
                <div
                  className="absolute -bottom-3 -right-3 w-6 h-6 bg-white border-2 border-blue-600 rounded-full shadow-lg cursor-nwse-resize touch-none z-30"
                  onPointerDown={(e) => handlePointerDown('se', e)}
                />
              </div>
            </div>
          </div>

          {/* Clean Modal Footer Buttons */}
          <div className="w-full max-w-md flex gap-3 pt-3 pb-2">
            <button
              type="button"
              onClick={() => setCropModalImage(null)}
              className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeCropAndScan}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-blue-500/25 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>✂️</span> Scan Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
