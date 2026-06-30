'use client';

import React from 'react';
import BarcodeScannerComponent from 'react-qr-barcode-scanner';

interface ScannerWrapperProps {
  onScan: (value: string) => void;
  onError?: (err: string) => void;
}

export default function ScannerWrapper({ onScan, onError }: ScannerWrapperProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 aspect-video md:aspect-square max-w-md mx-auto w-full flex items-center justify-center shadow-inner">
      <BarcodeScannerComponent
        width="100%"
        height="100%"
        facingMode="environment"
        onUpdate={(err: any, result: any) => {
          if (result) {
            onScan(result.getText());
          } else if (err && onError) {
            // ZXing constantly outputs errors when no barcode is found, so we don't spam the callback
            // but we can pass it if specifically needed.
          }
        }}
      />
      {/* Laser scan animation overlay */}
      <div className="absolute left-0 right-0 h-0.5 bg-green-500/80 shadow-[0_0_10px_#22c55e] animate-bounce top-0 pointer-events-none" />
      
      {/* Target framing */}
      <div className="absolute inset-8 border-2 border-dashed border-white/20 rounded-lg pointer-events-none flex items-center justify-center">
        <div className="w-12 h-12 border-t-4 border-l-4 border-blue-500 absolute top-[-2px] left-[-2px] rounded-tl-md" />
        <div className="w-12 h-12 border-t-4 border-r-4 border-blue-500 absolute top-[-2px] right-[-2px] rounded-tr-md" />
        <div className="w-12 h-12 border-b-4 border-l-4 border-blue-500 absolute bottom-[-2px] left-[-2px] rounded-bl-md" />
        <div className="w-12 h-12 border-b-4 border-r-4 border-blue-500 absolute bottom-[-2px] right-[-2px] rounded-br-md" />
      </div>
    </div>
  );
}
