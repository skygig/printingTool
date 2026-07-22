'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import dynamic from 'next/dynamic';

// Import ScannerWrapper dynamically with SSR disabled
const ScannerWrapper = dynamic(() => import('@/components/ScannerWrapper'), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-[16/8] max-w-md mx-auto rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
      <div className="text-slate-400 text-sm flex flex-col items-center gap-2">
        <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Initializing Camera...
      </div>
    </div>
  ),
});

interface ScannedHistoryItem {
  id: string;
  timestamp: string;
}

export default function ScanPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'receiving' | 'shipping'>('receiving');
  const [scannedValue, setScannedValue] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<ScannedHistoryItem[]>([]);

  // Shipping capture camera references & state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    setMounted(true);
    const user = Cookies.get('scan_user');
    if (user !== 'raj@rmsint.net') {
      router.push('/login');
    }

    // Load local history from session storage if exists
    const storedHistory = sessionStorage.getItem('scan_history');
    if (storedHistory) {
      try {
        setHistory(JSON.parse(storedHistory));
      } catch (e) {
        console.error(e);
      }
    }
  }, [router]);

  // Handle shipping capture camera streaming
  useEffect(() => {
    if (!mounted) return;

    let timeoutId: any;

    if (activeTab === 'shipping') {
      setCameraActive(false);
      setMessage(null);
      
      // Delay requesting camera to allow ScannerWrapper to completely release it
      timeoutId = setTimeout(() => {
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })
        .then(s => {
          setStream(s);
          setCameraActive(true);
          // Wait for DOM to bind videoRef
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.srcObject = s;
              videoRef.current.play().catch(e => console.error("Error playing video:", e));
            }
          }, 100);
        })
        .catch(err => {
          console.error("Failed to access camera for shipping capture:", err);
          setMessage({ type: 'error', text: 'Failed to access camera. Please allow camera permissions.' });
        });
      }, 400);
    } else {
      stopCamera();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      stopCamera();
    };
  }, [activeTab, mounted]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  const handleScan = (value: string) => {
    if (value && value !== scannedValue) {
      setScannedValue(value);
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
      } catch (err) {
        console.error('Audio beep failed', err);
      }
    }
  };

  const handleLogout = () => {
    stopCamera();
    Cookies.remove('scan_user');
    router.push('/login');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const valueToSubmit = manualValue.trim() || scannedValue.trim();
    if (!valueToSubmit) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackingId: valueToSubmit }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: `Captured: ${valueToSubmit}` });
        
        const newItem: ScannedHistoryItem = {
          id: valueToSubmit,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        const updatedHistory = [newItem, ...history].slice(0, 10);
        setHistory(updatedHistory);
        sessionStorage.setItem('scan_history', JSON.stringify(updatedHistory));

        setScannedValue('');
        setManualValue('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save scan' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Network error occurred' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCaptureAndStore = async () => {
    const video = videoRef.current;
    if (!video || !cameraActive) {
      setMessage({ type: 'error', text: 'Camera not active' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      // Create canvas to capture photo frame in 1:1 ratio
      const canvas = document.createElement('canvas');
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const size = Math.min(videoWidth, videoHeight);
      
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error("Could not initialize 2D context");
      }

      // Draw the center square from the video feed
      const sx = (videoWidth - size) / 2;
      const sy = (videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

      // Convert canvas to base64 jpeg
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      const res = await fetch('/api/shipping-capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: dataUrl }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'Shipping photo captured and stored successfully!' });
        
        // Add a mock item to history to show session captures
        const newItem: ScannedHistoryItem = {
          id: `📷 Capture [${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        const updatedHistory = [newItem, ...history].slice(0, 10);
        setHistory(updatedHistory);
        sessionStorage.setItem('scan_history', JSON.stringify(updatedHistory));
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save shipping capture' });
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Error capturing image: ${err.message || 'Network error'}` });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  const finalValue = manualValue.trim() || scannedValue.trim();

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-50 text-slate-900 select-none relative overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">📥</span>
          <span className="font-bold text-sm tracking-wide text-slate-700">RMS SCANNER</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Sign Out
        </button>
      </header>

      {/* Tab Selector */}
      <div className="flex border-b border-slate-200 bg-white shadow-sm w-full">
        <button
          type="button"
          onClick={() => setActiveTab('receiving')}
          className={`flex-1 py-3.5 text-center text-sm font-semibold transition-all border-b-2 cursor-pointer ${
            activeTab === 'receiving'
              ? 'border-blue-600 text-blue-600 bg-blue-50/10'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          📥 Receiving Scan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('shipping')}
          className={`flex-1 py-3.5 text-center text-sm font-semibold transition-all border-b-2 cursor-pointer ${
            activeTab === 'shipping'
              ? 'border-blue-600 text-blue-600 bg-blue-50/10'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          🚢 Shipping Capture
        </button>
      </div>

      {/* Main Container */}
      <main className="flex-1 flex flex-col p-4 space-y-6 max-w-md mx-auto w-full pb-10">
        
        {/* Toggleable sections */}
        {activeTab === 'receiving' ? (
          <>
            {/* Camera Barcode Scanner & Input Form */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Camera Scanner
              </label>
              <ScannerWrapper onScan={handleScan}>
                {({ refreshScanner, isPaused }) => (
                  /* Input Form */
                  <div className="space-y-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-xl">
                    {message && (
                      <div
                        className={`p-3 text-xs rounded-xl border text-center font-semibold ${
                          message.type === 'success'
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : 'bg-red-50 border-red-200 text-red-700'
                        }`}
                      >
                        {message.text}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        Scanned / Tracking ID
                      </label>
                      <input
                        type="text"
                        value={manualValue || scannedValue}
                        onChange={(e) => {
                          setManualValue(e.target.value);
                          setScannedValue('');
                        }}
                        placeholder="Scan code or enter manually..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-mono"
                      />
                    </div>

                    {/* Add Tracking ID Action Button */}
                    <button
                      type="button"
                      disabled={!finalValue || submitting}
                      onClick={() => handleSubmit()}
                      className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Saving Scan...
                        </>
                      ) : (
                        'Add Tracking ID'
                      )}
                    </button>

                    {/* Refresh Scanner Button */}
                    <button
                      type="button"
                      disabled={!finalValue || submitting}
                      onClick={() => {
                        setScannedValue('');
                        setManualValue('');
                        refreshScanner();
                      }}
                      className="w-full py-3.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-300/60 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-75 disabled:border-slate-200/60 disabled:cursor-not-allowed shadow-sm"
                    >
                      <span>🔄</span> Refresh
                    </button>
                  </div>
                )}
              </ScannerWrapper>
            </div>
          </>
        ) : (
          <>
            {/* Camera Viewport (Ratio 1:1) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Shipping Photo Camera (1:1 Ratio)
              </label>
              
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black aspect-square max-w-md mx-auto w-full flex items-center justify-center shadow-xl">
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-slate-500 text-xs flex flex-col items-center gap-2">
                    <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Starting Camera Feed...
                  </div>
                )}
                {/* 1:1 framing grid overlay */}
                <div className="absolute inset-0 border border-white/10 pointer-events-none" />
                <div className="absolute inset-x-0 top-1/3 border-b border-white/5 pointer-events-none" />
                <div className="absolute inset-x-0 top-2/3 border-b border-white/5 pointer-events-none" />
                <div className="absolute inset-y-0 left-1/3 border-r border-white/5 pointer-events-none" />
                <div className="absolute inset-y-0 left-2/3 border-r border-white/5 pointer-events-none" />
              </div>
            </div>

            {/* Action Card */}
            <div className="space-y-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-xl">
              {message && (
                <div
                  className={`p-3 text-xs rounded-xl border text-center font-semibold ${
                    message.type === 'success'
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {message.text}
                </div>
              )}

              <button
                type="button"
                disabled={!cameraActive || submitting}
                onClick={handleCaptureAndStore}
                className="w-full py-4 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Uploading Photo...
                  </>
                ) : (
                  <>
                    <span className="text-base">📸</span> Capture and Store
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* History (Shared) */}
        <div className="space-y-2 flex-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Recent Scans & Captures (This Session)
          </label>
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm max-h-[200px] overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No items scanned or captured in this session yet
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {history.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 text-sm font-mono hover:bg-slate-50 transition-colors">
                    <span className="text-blue-600 truncate max-w-[220px]">{item.id}</span>
                    <span className="text-slate-400 text-xs">{item.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
