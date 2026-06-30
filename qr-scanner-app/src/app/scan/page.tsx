'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import dynamic from 'next/dynamic';

// Import ScannerWrapper dynamically with SSR disabled
const ScannerWrapper = dynamic(() => import('@/components/ScannerWrapper'), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-video md:aspect-square max-w-md mx-auto rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
      <div className="text-slate-500 text-sm flex flex-col items-center gap-2">
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
  const [scannedValue, setScannedValue] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<ScannedHistoryItem[]>([]);

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

  const handleScan = (value: string) => {
    if (value && value !== scannedValue) {
      setScannedValue(value);
      // Play a subtle success beep sound using web audio api
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); // 1200Hz beep
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
      } catch (err) {
        console.error('Audio beep failed', err);
      }
    }
  };

  const handleLogout = () => {
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
        
        // Add to history list
        const newItem: ScannedHistoryItem = {
          id: valueToSubmit,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        const updatedHistory = [newItem, ...history].slice(0, 10);
        setHistory(updatedHistory);
        sessionStorage.setItem('scan_history', JSON.stringify(updatedHistory));

        // Clear values
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

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  const finalValue = manualValue.trim() || scannedValue.trim();

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-950 text-white select-none relative overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📥</span>
          <span className="font-bold text-sm tracking-wide text-slate-200">RMS SCANNER</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Sign Out
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col p-4 space-y-6 max-w-md mx-auto w-full pb-10">
        {/* Scanner Viewport */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Camera Scanner
          </label>
          <ScannerWrapper onScan={handleScan} />
        </div>

        {/* Form controls */}
        <div className="space-y-4 bg-slate-900/40 border border-slate-900 p-5 rounded-2xl">
          {message && (
            <div
              className={`p-3 text-xs rounded-xl border text-center font-semibold ${
                message.type === 'success'
                  ? 'bg-green-950/20 border-green-900/50 text-green-400'
                  : 'bg-red-950/20 border-red-900/50 text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Scanned/Manual Value field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Scanned / Tracking ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualValue || scannedValue}
                onChange={(e) => {
                  setManualValue(e.target.value);
                  setScannedValue(''); // Clear scanned value if manual is edited
                }}
                placeholder="Scan code or enter manually..."
                className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-mono"
              />
              {(scannedValue || manualValue) && (
                <button
                  type="button"
                  onClick={() => {
                    setScannedValue('');
                    setManualValue('');
                  }}
                  className="px-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 text-sm cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Submit CTA */}
          <button
            type="button"
            disabled={!finalValue || submitting}
            onClick={() => handleSubmit()}
            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving Capture...
              </>
            ) : (
              'Capture & Submit'
            )}
          </button>
        </div>

        {/* History */}
        <div className="space-y-2 flex-1">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Recent Scans (This Session)
          </label>
          <div className="border border-slate-900 rounded-2xl overflow-hidden bg-slate-900/20 max-h-[220px] overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-600">
                No items scanned in this session yet
              </div>
            ) : (
              <div className="divide-y divide-slate-900">
                {history.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 text-sm font-mono hover:bg-slate-900/50 transition-colors">
                    <span className="text-blue-400 truncate max-w-[200px]">{item.id}</span>
                    <span className="text-slate-500 text-xs">{item.timestamp}</span>
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
