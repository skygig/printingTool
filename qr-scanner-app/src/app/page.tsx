'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const user = Cookies.get('scan_user');
    if (user === 'raj@rmsint.net') {
      router.push('/scan');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-pulse text-slate-400 text-sm">Loading RMS Scanner...</div>
    </div>
  );
}
